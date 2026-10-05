import { prisma } from '../../../libs/prisma';
import { ApiError } from '../../../utils/api-error';
import { auditLogService } from '../../business/services/audit-log.service';
import { Prisma } from '@prisma/client';

export interface ExpenseCategoryInput {
  name?: string;
  description?: string | null;
  isActive?: boolean;
}

export class ExpenseCategoryService {
  async createCategory(businessId: string, userId: string, input: ExpenseCategoryInput) {
    const name = input.name?.trim();
    if (!name) {
      throw ApiError.badRequest('name is required');
    }

    const existing = await prisma.expenseCategory.findUnique({
      where: { businessId_name: { businessId, name } },
      select: { id: true },
    });
    if (existing) {
      throw ApiError.conflict('An expense category with this name already exists');
    }

    return prisma.$transaction(async (tx) => {
      const category = await tx.expenseCategory.create({
        data: {
          businessId,
          name,
          description: input.description ?? null,
          isActive: input.isActive ?? true,
        },
      });

      await auditLogService.createAuditLog(
        {
          businessId,
          actorId: userId,
          action: 'EXPENSE_CATEGORY_CREATED',
          entityType: 'ExpenseCategory',
          entityId: category.id,
          newValues: { name, description: input.description ?? null },
        },
        tx
      );

      return category;
    });
  }

  async listCategories(businessId: string, options?: { includeInactive?: boolean }) {
    return prisma.expenseCategory.findMany({
      where: {
        businessId,
        ...(options?.includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ name: 'asc' }],
    });
  }

  async updateCategory(
    categoryId: string,
    businessId: string,
    userId: string,
    input: ExpenseCategoryInput
  ) {
    const category = await prisma.expenseCategory.findUnique({ where: { id: categoryId } });
    if (!category || category.businessId !== businessId) {
      throw ApiError.notFound('Expense category not found');
    }

    const data: Prisma.ExpenseCategoryUpdateInput = {};

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) {
        throw ApiError.badRequest('name cannot be empty');
      }
      if (name !== category.name) {
        const duplicate = await prisma.expenseCategory.findUnique({
          where: { businessId_name: { businessId, name } },
          select: { id: true },
        });
        if (duplicate) {
          throw ApiError.conflict('An expense category with this name already exists');
        }
      }
      data.name = name;
    }
    if (input.description !== undefined) data.description = input.description;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    if (Object.keys(data).length === 0) {
      throw ApiError.badRequest('At least one field must be provided for update');
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.expenseCategory.update({ where: { id: categoryId }, data });

      await auditLogService.createAuditLog(
        {
          businessId,
          actorId: userId,
          action: 'EXPENSE_CATEGORY_UPDATED',
          entityType: 'ExpenseCategory',
          entityId: categoryId,
          oldValues: { name: category.name, isActive: category.isActive },
          newValues: { name: updated.name, isActive: updated.isActive },
        },
        tx
      );

      return updated;
    });
  }
}

export const expenseCategoryService = new ExpenseCategoryService();
