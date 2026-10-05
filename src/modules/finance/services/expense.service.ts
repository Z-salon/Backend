import { prisma } from '../../../libs/prisma';
import { ApiError } from '../../../utils/api-error';
import { ExpenseStatus, Prisma } from '@prisma/client';
import { auditLogService } from '../../business/services/audit-log.service';
import { toDecimal } from '../../payment/services/payment-finance.helpers';
import { financeAccessService } from './finance-access.service';

export interface ExpenseInput {
  branchId: string;
  categoryId: string;
  amount: number | string;
  description?: string | null;
  vendor?: string | null;
  receiptNumber?: string | null;
  notes?: string | null;
  expenseDate?: string | Date;
  dueDate?: string | Date | null;
  paymentMethodId?: string | null;
  /** Optional amount already paid at creation time (e.g. a cash purchase). */
  amountPaid?: number | string;
}

export interface ExpenseListFilters {
  from?: string;
  to?: string;
  branchId?: string;
  categoryId?: string;
  status?: ExpenseStatus;
  page?: number;
  limit?: number;
}

/** Derive simple payment state from incurred amount and cash paid so far. */
function deriveStatus(amount: Prisma.Decimal, amountPaid: Prisma.Decimal): ExpenseStatus {
  if (amountPaid.lte(0)) return ExpenseStatus.UNPAID;
  if (amountPaid.gte(amount)) return ExpenseStatus.PAID;
  return ExpenseStatus.PARTIALLY_PAID;
}

function toDate(value: string | Date | null | undefined, field: string): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw ApiError.badRequest(`${field} is not a valid date`);
  }
  return date;
}

export class ExpenseService {
  private async assertBranchInBusiness(businessId: string, branchId: string) {
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, businessId },
      select: { id: true },
    });
    if (!branch) {
      throw ApiError.badRequest('Branch not found in this business');
    }
  }

  private async assertCategoryInBusiness(businessId: string, categoryId: string) {
    const category = await prisma.expenseCategory.findUnique({ where: { id: categoryId } });
    if (!category || category.businessId !== businessId) {
      throw ApiError.badRequest('Expense category not found in this business');
    }
    return category;
  }

  private async assertPaymentMethodInBusiness(businessId: string, paymentMethodId: string) {
    const method = await prisma.paymentMethod.findUnique({ where: { id: paymentMethodId } });
    if (!method || method.businessId !== businessId) {
      throw ApiError.badRequest('Payment method not found in this business');
    }
    return method;
  }

  async createExpense(businessId: string, userId: string, input: ExpenseInput) {
    if (!input.branchId) throw ApiError.badRequest('branchId is required');
    if (!input.categoryId) throw ApiError.badRequest('categoryId is required');

    const amount = toDecimal(input.amount);
    if (amount.lte(0)) {
      throw ApiError.badRequest('Expense amount must be greater than zero');
    }

    const amountPaid = toDecimal(input.amountPaid);
    if (amountPaid.lt(0)) {
      throw ApiError.badRequest('amountPaid cannot be negative');
    }
    if (amountPaid.gt(amount)) {
      throw ApiError.badRequest('amountPaid cannot exceed the expense amount');
    }

    // Authorize the branch against the caller's scope (owner/admin = any branch).
    const scope = await financeAccessService.resolveScope(businessId, userId, input.branchId);
    await this.assertBranchInBusiness(businessId, input.branchId);
    await this.assertCategoryInBusiness(businessId, input.categoryId);
    if (input.paymentMethodId) {
      await this.assertPaymentMethodInBusiness(businessId, input.paymentMethodId);
    }

    const expenseDate = toDate(input.expenseDate, 'expenseDate') ?? new Date();
    const dueDate = toDate(input.dueDate, 'dueDate');
    const status = deriveStatus(amount, amountPaid);

    return prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          businessId,
          branchId: input.branchId,
          categoryId: input.categoryId,
          amount,
          amountPaid,
          status,
          description: input.description ?? null,
          vendor: input.vendor ?? null,
          receiptNumber: input.receiptNumber ?? null,
          notes: input.notes ?? null,
          expenseDate,
          dueDate,
          paidAt: amountPaid.gt(0) ? expenseDate : null,
          paymentMethodId: input.paymentMethodId ?? null,
          createdById: userId,
        },
      });

      await auditLogService.createAuditLog(
        {
          businessId,
          actorId: userId,
          action: 'EXPENSE_CREATED',
          entityType: 'Expense',
          entityId: expense.id,
          newValues: {
            branchId: input.branchId,
            categoryId: input.categoryId,
            amount: amount.toString(),
            amountPaid: amountPaid.toString(),
            status,
            scope: scope.allBranches ? 'BUSINESS' : 'BRANCH',
          },
        },
        tx
      );

      return expense;
    });
  }

  async listExpenses(businessId: string, userId: string, filters: ExpenseListFilters) {
    const scope = await financeAccessService.resolveScope(businessId, userId, filters.branchId);
    const branchWhere = financeAccessService.branchWhere(scope, filters.branchId);

    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 100) : 20;

    const from = toDate(filters.from, 'from');
    const to = toDate(filters.to, 'to');

    const where: Prisma.ExpenseWhereInput = {
      businessId,
      ...branchWhere,
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(from || to ? { expenseDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    };

    const [data, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { expenseDate: 'desc' },
        include: {
          category: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
          paymentMethod: { select: { id: true, name: true, type: true } },
          createdBy: { select: { id: true, phone: true } },
        },
      }),
      prisma.expense.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getExpense(expenseId: string, businessId: string, userId: string) {
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: {
        category: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        paymentMethod: { select: { id: true, name: true, type: true } },
        createdBy: { select: { id: true, phone: true } },
      },
    });
    if (!expense || expense.businessId !== businessId) {
      throw ApiError.notFound('Expense not found');
    }
    await financeAccessService.resolveScope(businessId, userId, expense.branchId);
    return expense;
  }

  async updateExpense(expenseId: string, businessId: string, userId: string, input: Partial<ExpenseInput>) {
    const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
    if (!expense || expense.businessId !== businessId) {
      throw ApiError.notFound('Expense not found');
    }
    await financeAccessService.resolveScope(businessId, userId, expense.branchId);

    if (expense.status === ExpenseStatus.VOIDED) {
      throw ApiError.badRequest('Cannot update a voided expense');
    }

    const data: Prisma.ExpenseUpdateInput = {};

    if (input.categoryId !== undefined) {
      await this.assertCategoryInBusiness(businessId, input.categoryId);
      data.category = { connect: { id: input.categoryId } };
    }
    if (input.description !== undefined) data.description = input.description;
    if (input.vendor !== undefined) data.vendor = input.vendor;
    if (input.receiptNumber !== undefined) data.receiptNumber = input.receiptNumber;
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.expenseDate !== undefined) {
      data.expenseDate = toDate(input.expenseDate, 'expenseDate') ?? expense.expenseDate;
    }
    if (input.dueDate !== undefined) data.dueDate = toDate(input.dueDate, 'dueDate');
    if (input.paymentMethodId !== undefined) {
      if (input.paymentMethodId) {
        await this.assertPaymentMethodInBusiness(businessId, input.paymentMethodId);
        data.paymentMethod = { connect: { id: input.paymentMethodId } };
      } else {
        data.paymentMethod = { disconnect: true };
      }
    }

    if (input.amount !== undefined) {
      const amount = toDecimal(input.amount);
      if (amount.lte(0)) throw ApiError.badRequest('Expense amount must be greater than zero');
      if (amount.lt(expense.amountPaid)) {
        throw ApiError.badRequest('Expense amount cannot be less than the amount already paid');
      }
      data.amount = amount;
      data.status = deriveStatus(amount, expense.amountPaid);
    }

    if (Object.keys(data).length === 0) {
      throw ApiError.badRequest('At least one field must be provided for update');
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.expense.update({ where: { id: expenseId }, data });

      await auditLogService.createAuditLog(
        {
          businessId,
          actorId: userId,
          action: 'EXPENSE_UPDATED',
          entityType: 'Expense',
          entityId: expenseId,
          oldValues: { amount: expense.amount.toString(), status: expense.status },
          newValues: { amount: updated.amount.toString(), status: updated.status },
        },
        tx
      );

      return updated;
    });
  }

  /**
   * Record cash actually paid against an expense. Supports partial payments; the
   * running `amountPaid` can never exceed the incurred `amount`.
   */
  async recordExpensePayment(
    expenseId: string,
    businessId: string,
    userId: string,
    input: { amount: number | string; paymentMethodId?: string | null; paidAt?: string | Date }
  ) {
    const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
    if (!expense || expense.businessId !== businessId) {
      throw ApiError.notFound('Expense not found');
    }
    await financeAccessService.resolveScope(businessId, userId, expense.branchId);

    if (expense.status === ExpenseStatus.VOIDED) {
      throw ApiError.badRequest('Cannot record a payment for a voided expense');
    }

    const paymentAmount = toDecimal(input.amount);
    if (paymentAmount.lte(0)) {
      throw ApiError.badRequest('Payment amount must be greater than zero');
    }

    const newPaid = expense.amountPaid.plus(paymentAmount);
    if (newPaid.gt(expense.amount)) {
      throw ApiError.badRequest('Payment would exceed the remaining unpaid balance');
    }

    if (input.paymentMethodId) {
      await this.assertPaymentMethodInBusiness(businessId, input.paymentMethodId);
    }

    const paidAt = toDate(input.paidAt, 'paidAt') ?? new Date();
    const status = deriveStatus(expense.amount, newPaid);

    return prisma.$transaction(async (tx) => {
      const updated = await tx.expense.update({
        where: { id: expenseId },
        data: {
          amountPaid: newPaid,
          status,
          paidAt,
          ...(input.paymentMethodId ? { paymentMethodId: input.paymentMethodId } : {}),
        },
      });

      await auditLogService.createAuditLog(
        {
          businessId,
          actorId: userId,
          action: 'EXPENSE_PAYMENT_RECORDED',
          entityType: 'Expense',
          entityId: expenseId,
          oldValues: { amountPaid: expense.amountPaid.toString(), status: expense.status },
          newValues: { amountPaid: newPaid.toString(), status, paidAt: paidAt.toISOString() },
        },
        tx
      );

      return updated;
    });
  }

  /** Soft-delete an expense. Financial history is preserved and excluded from reports. */
  async voidExpense(expenseId: string, businessId: string, userId: string, reason?: string) {
    const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
    if (!expense || expense.businessId !== businessId) {
      throw ApiError.notFound('Expense not found');
    }
    await financeAccessService.resolveScope(businessId, userId, expense.branchId);

    if (expense.status === ExpenseStatus.VOIDED) {
      return expense; // Idempotent
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.expense.update({
        where: { id: expenseId },
        data: {
          status: ExpenseStatus.VOIDED,
          voidedAt: new Date(),
          voidReason: reason ?? null,
        },
      });

      await auditLogService.createAuditLog(
        {
          businessId,
          actorId: userId,
          action: 'EXPENSE_VOIDED',
          entityType: 'Expense',
          entityId: expenseId,
          oldValues: { status: expense.status, amount: expense.amount.toString() },
          newValues: { status: ExpenseStatus.VOIDED, reason: reason ?? null },
        },
        tx
      );

      return updated;
    });
  }
}

export const expenseService = new ExpenseService();
