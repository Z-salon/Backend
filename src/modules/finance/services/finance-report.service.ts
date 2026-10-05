import { DateTime } from 'luxon';
import { prisma } from '../../../libs/prisma';
import { ApiError } from '../../../utils/api-error';
import { ExpenseStatus, Prisma, RefundRequestStatus } from '@prisma/client';
import {
  getAppointmentFinancials,
  toDecimal,
  VERIFIED_PAYMENT_STATUSES,
  ZERO,
} from '../../payment/services/payment-finance.helpers';
import { financeAccessService, FinanceScope } from './finance-access.service';

/**
 * Finance reporting.
 *
 * Definitions (single source of truth, mirrored from the canonical money helpers in
 * `payment-finance.helpers.ts`):
 *
 *   Revenue            = SUM(Appointment.finalAgreedAmount) for COMPLETED appointments,
 *                        recognized on `completedAt` (the moment the obligation was
 *                        finalized). Revenue is the amount EARNED, not cash received.
 *   Collected          = SUM(AppointmentPayment.amount) for verified (non-voided)
 *                        payments, on `paidAt`. Pending/rejected receipts never create
 *                        an AppointmentPayment, so they never appear here.
 *   Refunds            = SUM(approvedAmount) for COMPLETED refund requests, on
 *                        `completedAt`. APPROVED (not yet transferred) never counts.
 *   Outstanding        = current snapshot: SUM(max(finalAgreedAmount - verifiedPaid, 0))
 *                        over finalized appointments. Mirrors getAppointmentFinancials.
 *   Expenses           = SUM(Expense.amount) for non-voided expenses, on `expenseDate`
 *                        (incurred basis). `amountPaid` gives the cash basis.
 *   NetOperatingResult = Revenue - Expenses (accrual/earned basis).
 *   NetCashMovement    = (Collected - Refunds) - ExpensesPaid (cash basis, labeled clearly).
 *
 * Reports never sum two ledgers for the same event: revenue from Appointment,
 * collections from AppointmentPayment, refunds from RefundRequest (the payment
 * `refundedAmount` column is the applied ledger and is NOT added again), expenses
 * from Expense.
 */

export interface ReportQuery {
  from?: string;
  to?: string;
  branchId?: string;
}

export interface Period {
  from: string;
  to: string;
  timezone: string;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class FinanceReportService {
  // ---------------------------------------------------------------- period + scope

  private async resolveContext(businessId: string, userId: string, query: ReportQuery) {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, timezone: true },
    });
    if (!business) {
      throw ApiError.notFound('Business not found');
    }

    const scope = await financeAccessService.resolveScope(businessId, userId, query.branchId);
    const timezone = business.timezone || 'UTC';
    const { from, to } = this.resolvePeriod(timezone, query.from, query.to);
    const branchIds = financeAccessService.sqlBranchIds(scope, query.branchId);

    return { businessId, timezone, scope, from, to, branchIds };
  }

  /** Interpret `from`/`to` in the business timezone; date-only bounds span whole days. */
  private resolvePeriod(timezone: string, fromRaw?: string, toRaw?: string) {
    const now = DateTime.now().setZone(timezone);

    let fromDt: DateTime;
    if (fromRaw) {
      fromDt = DATE_ONLY.test(fromRaw)
        ? DateTime.fromISO(fromRaw, { zone: timezone }).startOf('day')
        : DateTime.fromISO(fromRaw, { zone: timezone });
    } else {
      fromDt = now.startOf('month');
    }

    let toDt: DateTime;
    if (toRaw) {
      toDt = DATE_ONLY.test(toRaw)
        ? DateTime.fromISO(toRaw, { zone: timezone }).endOf('day')
        : DateTime.fromISO(toRaw, { zone: timezone });
    } else {
      toDt = now.endOf('day');
    }

    if (!fromDt.isValid || !toDt.isValid) {
      throw ApiError.badRequest('from/to must be valid ISO dates');
    }
    if (fromDt.toMillis() > toDt.toMillis()) {
      throw ApiError.badRequest('from must be before or equal to to');
    }

    return { from: fromDt.toJSDate(), to: toDt.toJSDate() };
  }

  private money(value: Prisma.Decimal | number | string | null | undefined): string {
    return toDecimal(value).toFixed(2);
  }

  private async branchNames(businessId: string): Promise<Map<string, string>> {
    const branches = await prisma.branch.findMany({
      where: { businessId },
      select: { id: true, name: true },
    });
    return new Map(branches.map((b) => [b.id, b.name]));
  }

  // ---------------------------------------------------------------- raw aggregates

  private branchSql(branchIds: string[] | null, column: string): Prisma.Sql {
    if (!branchIds) return Prisma.empty;
    return Prisma.sql`AND ${Prisma.raw(column)} IN (${Prisma.join(branchIds)})`;
  }

  /** Revenue recognized per calendar day (business timezone). */
  private async revenueByDate(
    businessId: string,
    timezone: string,
    from: Date,
    to: Date,
    branchIds: string[] | null
  ): Promise<{ day: string; amount: Prisma.Decimal }[]> {
    return prisma.$queryRaw<{ day: string; amount: Prisma.Decimal }[]>`
      SELECT to_char(a."completedAt" AT TIME ZONE ${timezone}, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(a."finalAgreedAmount"), 0) AS amount
      FROM "Appointment" a
      WHERE a."businessId" = ${businessId}
        AND a."status" = 'COMPLETED'
        AND a."finalAgreedAmount" IS NOT NULL
        AND a."completedAt" >= ${from}
        AND a."completedAt" <= ${to}
        ${this.branchSql(branchIds, 'a."branchId"')}
      GROUP BY 1
      ORDER BY 1
    `;
  }

  private async collectedByDate(
    businessId: string,
    timezone: string,
    from: Date,
    to: Date,
    branchIds: string[] | null
  ): Promise<{ day: string; amount: Prisma.Decimal }[]> {
    return prisma.$queryRaw<{ day: string; amount: Prisma.Decimal }[]>`
      SELECT to_char(p."paidAt" AT TIME ZONE ${timezone}, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(p."amount"), 0) AS amount
      FROM "AppointmentPayment" p
      WHERE p."businessId" = ${businessId}
        AND p."status" IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
        AND p."paidAt" >= ${from}
        AND p."paidAt" <= ${to}
        ${this.branchSql(branchIds, 'p."branchId"')}
      GROUP BY 1
      ORDER BY 1
    `;
  }

  private async expensesByDate(
    businessId: string,
    timezone: string,
    from: Date,
    to: Date,
    branchIds: string[] | null
  ): Promise<{ day: string; amount: Prisma.Decimal; amountPaid: Prisma.Decimal }[]> {
    return prisma.$queryRaw<{ day: string; amount: Prisma.Decimal; amountPaid: Prisma.Decimal }[]>`
      SELECT to_char(e."expenseDate" AT TIME ZONE ${timezone}, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(e."amount"), 0) AS amount,
             COALESCE(SUM(e."amountPaid"), 0) AS "amountPaid"
      FROM "Expense" e
      WHERE e."businessId" = ${businessId}
        AND e."status" <> 'VOIDED'
        AND e."expenseDate" >= ${from}
        AND e."expenseDate" <= ${to}
        ${this.branchSql(branchIds, 'e."branchId"')}
      GROUP BY 1
      ORDER BY 1
    `;
  }

  private async refundsByDate(
    businessId: string,
    timezone: string,
    from: Date,
    to: Date,
    branchIds: string[] | null
  ): Promise<{ day: string; amount: Prisma.Decimal }[]> {
    return prisma.$queryRaw<{ day: string; amount: Prisma.Decimal }[]>`
      SELECT to_char(r."completedAt" AT TIME ZONE ${timezone}, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(COALESCE(r."approvedAmount", r."requestedAmount")), 0) AS amount
      FROM "RefundRequest" r
      JOIN "Appointment" a ON a."id" = r."appointmentId"
      WHERE r."status" = 'COMPLETED'
        AND r."completedAt" >= ${from}
        AND r."completedAt" <= ${to}
        AND a."businessId" = ${businessId}
        ${this.branchSql(branchIds, 'a."branchId"')}
      GROUP BY 1
      ORDER BY 1
    `;
  }

  /**
   * Current outstanding across finalized appointments, aggregated in the database.
   * Formula mirrors `getAppointmentFinancials`: max(finalAgreedAmount - verifiedPaid, 0).
   */
  private async outstandingTotal(
    businessId: string,
    branchIds: string[] | null
  ): Promise<Prisma.Decimal> {
    const rows = await prisma.$queryRaw<{ outstanding: Prisma.Decimal }[]>`
      SELECT COALESCE(SUM(GREATEST(a."finalAgreedAmount" - COALESCE(p.paid, 0), 0)), 0) AS outstanding
      FROM "Appointment" a
      LEFT JOIN (
        SELECT "appointmentId", SUM("amount") AS paid
        FROM "AppointmentPayment"
        WHERE "status" IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
        GROUP BY "appointmentId"
      ) p ON p."appointmentId" = a."id"
      WHERE a."businessId" = ${businessId}
        AND a."finalAgreedAmount" IS NOT NULL
        ${this.branchSql(branchIds, 'a."branchId"')}
    `;
    return toDecimal(rows[0]?.outstanding);
  }

  // ---------------------------------------------------------------- core totals

  private async revenueTotal(
    businessId: string,
    from: Date,
    to: Date,
    scope: FinanceScope,
    branchId?: string
  ) {
    const agg = await prisma.appointment.aggregate({
      where: {
        businessId,
        status: 'COMPLETED',
        finalAgreedAmount: { not: null },
        completedAt: { gte: from, lte: to },
        ...financeAccessService.branchWhere(scope, branchId),
      },
      _sum: { finalAgreedAmount: true },
      _count: { _all: true },
    });
    return { amount: toDecimal(agg._sum.finalAgreedAmount), count: agg._count._all };
  }

  private async collectedTotal(
    businessId: string,
    from: Date,
    to: Date,
    scope: FinanceScope,
    branchId?: string
  ) {
    const agg = await prisma.appointmentPayment.aggregate({
      where: {
        businessId,
        status: { in: VERIFIED_PAYMENT_STATUSES },
        paidAt: { gte: from, lte: to },
        ...financeAccessService.branchWhere(scope, branchId),
      },
      _sum: { amount: true },
      _count: { _all: true },
    });
    return { amount: toDecimal(agg._sum.amount), count: agg._count._all };
  }

  private async refundsCompletedTotal(
    businessId: string,
    from: Date,
    to: Date,
    scope: FinanceScope,
    branchId?: string
  ) {
    const agg = await prisma.refundRequest.aggregate({
      where: {
        status: RefundRequestStatus.COMPLETED,
        completedAt: { gte: from, lte: to },
        appointment: { businessId, ...financeAccessService.branchWhere(scope, branchId) },
      },
      _sum: { approvedAmount: true, requestedAmount: true },
      _count: { _all: true },
    });
    // Completed refunds always have approvedAmount set; requestedAmount is the fallback.
    const amount = agg._sum.approvedAmount ?? agg._sum.requestedAmount ?? ZERO;
    return { amount: toDecimal(amount), count: agg._count._all };
  }

  private async expensesTotal(
    businessId: string,
    from: Date,
    to: Date,
    scope: FinanceScope,
    branchId?: string
  ) {
    const agg = await prisma.expense.aggregate({
      where: {
        businessId,
        status: { not: ExpenseStatus.VOIDED },
        expenseDate: { gte: from, lte: to },
        ...financeAccessService.branchWhere(scope, branchId),
      },
      _sum: { amount: true, amountPaid: true },
      _count: { _all: true },
    });
    const incurred = toDecimal(agg._sum.amount);
    const paid = toDecimal(agg._sum.amountPaid);
    return {
      incurred,
      paid,
      unpaid: incurred.minus(paid),
      count: agg._count._all,
    };
  }

  // ---------------------------------------------------------------- breakdowns

  private async revenueByBranch(businessId: string, from: Date, to: Date, branchIds: string[] | null) {
    const rows = await prisma.$queryRaw<{ branchId: string; amount: Prisma.Decimal; count: bigint }[]>`
      SELECT a."branchId" AS "branchId",
             COALESCE(SUM(a."finalAgreedAmount"), 0) AS amount,
             COUNT(*) AS count
      FROM "Appointment" a
      WHERE a."businessId" = ${businessId}
        AND a."status" = 'COMPLETED'
        AND a."finalAgreedAmount" IS NOT NULL
        AND a."completedAt" >= ${from}
        AND a."completedAt" <= ${to}
        ${this.branchSql(branchIds, 'a."branchId"')}
      GROUP BY 1
      ORDER BY 2 DESC
    `;
    return rows.map((r) => ({ branchId: r.branchId, amount: toDecimal(r.amount), count: Number(r.count) }));
  }

  private async collectedByBranch(businessId: string, from: Date, to: Date, branchIds: string[] | null) {
    const rows = await prisma.$queryRaw<{ branchId: string; amount: Prisma.Decimal; count: bigint }[]>`
      SELECT p."branchId" AS "branchId",
             COALESCE(SUM(p."amount"), 0) AS amount,
             COUNT(*) AS count
      FROM "AppointmentPayment" p
      WHERE p."businessId" = ${businessId}
        AND p."status" IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
        AND p."paidAt" >= ${from}
        AND p."paidAt" <= ${to}
        ${this.branchSql(branchIds, 'p."branchId"')}
      GROUP BY 1
      ORDER BY 2 DESC
    `;
    return rows.map((r) => ({ branchId: r.branchId, amount: toDecimal(r.amount), count: Number(r.count) }));
  }

  private async refundsByBranch(businessId: string, from: Date, to: Date, branchIds: string[] | null) {
    const rows = await prisma.$queryRaw<{ branchId: string; amount: Prisma.Decimal; count: bigint }[]>`
      SELECT a."branchId" AS "branchId",
             COALESCE(SUM(COALESCE(r."approvedAmount", r."requestedAmount")), 0) AS amount,
             COUNT(*) AS count
      FROM "RefundRequest" r
      JOIN "Appointment" a ON a."id" = r."appointmentId"
      WHERE r."status" = 'COMPLETED'
        AND r."completedAt" >= ${from}
        AND r."completedAt" <= ${to}
        AND a."businessId" = ${businessId}
        ${this.branchSql(branchIds, 'a."branchId"')}
      GROUP BY 1
      ORDER BY 2 DESC
    `;
    return rows.map((r) => ({ branchId: r.branchId, amount: toDecimal(r.amount), count: Number(r.count) }));
  }

  private async expensesByBranch(businessId: string, from: Date, to: Date, branchIds: string[] | null) {
    const rows = await prisma.$queryRaw<{ branchId: string; amount: Prisma.Decimal; amountPaid: Prisma.Decimal; count: bigint }[]>`
      SELECT e."branchId" AS "branchId",
             COALESCE(SUM(e."amount"), 0) AS amount,
             COALESCE(SUM(e."amountPaid"), 0) AS "amountPaid",
             COUNT(*) AS count
      FROM "Expense" e
      WHERE e."businessId" = ${businessId}
        AND e."status" <> 'VOIDED'
        AND e."expenseDate" >= ${from}
        AND e."expenseDate" <= ${to}
        ${this.branchSql(branchIds, 'e."branchId"')}
      GROUP BY 1
      ORDER BY 2 DESC
    `;
    return rows.map((r) => ({
      branchId: r.branchId,
      amount: toDecimal(r.amount),
      amountPaid: toDecimal(r.amountPaid),
      count: Number(r.count),
    }));
  }

  private async revenueByService(businessId: string, from: Date, to: Date, branchIds: string[] | null) {
    const rows = await prisma.$queryRaw<{ serviceId: string; amount: Prisma.Decimal; count: bigint }[]>`
      SELECT a."serviceId" AS "serviceId",
             COALESCE(SUM(a."finalAgreedAmount"), 0) AS amount,
             COUNT(*) AS count
      FROM "Appointment" a
      WHERE a."businessId" = ${businessId}
        AND a."status" = 'COMPLETED'
        AND a."finalAgreedAmount" IS NOT NULL
        AND a."completedAt" >= ${from}
        AND a."completedAt" <= ${to}
        ${this.branchSql(branchIds, 'a."branchId"')}
      GROUP BY 1
      ORDER BY 2 DESC
    `;
    const ids = rows.map((r) => r.serviceId);
    const services = ids.length
      ? await prisma.service.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : [];
    const names = new Map(services.map((s) => [s.id, s.name]));
    return rows.map((r) => ({
      serviceId: r.serviceId,
      serviceName: names.get(r.serviceId) ?? 'Unknown service',
      amount: toDecimal(r.amount),
      count: Number(r.count),
    }));
  }

  private async collectedByPaymentMethod(businessId: string, from: Date, to: Date, branchIds: string[] | null) {
    const rows = await prisma.$queryRaw<{ paymentMethodId: string; amount: Prisma.Decimal; count: bigint }[]>`
      SELECT p."paymentMethodId" AS "paymentMethodId",
             COALESCE(SUM(p."amount"), 0) AS amount,
             COUNT(*) AS count
      FROM "AppointmentPayment" p
      WHERE p."businessId" = ${businessId}
        AND p."status" IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
        AND p."paidAt" >= ${from}
        AND p."paidAt" <= ${to}
        ${this.branchSql(branchIds, 'p."branchId"')}
      GROUP BY 1
      ORDER BY 2 DESC
    `;
    const ids = rows.map((r) => r.paymentMethodId);
    const methods = ids.length
      ? await prisma.paymentMethod.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, type: true } })
      : [];
    const names = new Map(methods.map((m) => [m.id, m]));
    return rows.map((r) => {
      const method = names.get(r.paymentMethodId);
      return {
        paymentMethodId: r.paymentMethodId,
        paymentMethodName: method?.name ?? 'Unknown',
        paymentMethodType: method?.type ?? null,
        amount: toDecimal(r.amount),
        count: Number(r.count),
      };
    });
  }

  private async collectedByRecordedBy(businessId: string, from: Date, to: Date, branchIds: string[] | null) {
    const rows = await prisma.$queryRaw<{ recordedById: string; amount: Prisma.Decimal; count: bigint }[]>`
      SELECT p."recordedById" AS "recordedById",
             COALESCE(SUM(p."amount"), 0) AS amount,
             COUNT(*) AS count
      FROM "AppointmentPayment" p
      WHERE p."businessId" = ${businessId}
        AND p."status" IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
        AND p."paidAt" >= ${from}
        AND p."paidAt" <= ${to}
        ${this.branchSql(branchIds, 'p."branchId"')}
      GROUP BY 1
      ORDER BY 2 DESC
    `;
    const ids = rows.map((r) => r.recordedById);
    const users = ids.length
      ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, phone: true } })
      : [];
    const phones = new Map(users.map((u) => [u.id, u.phone]));
    return rows.map((r) => ({
      recordedById: r.recordedById,
      recordedByPhone: phones.get(r.recordedById) ?? null,
      amount: toDecimal(r.amount),
      count: Number(r.count),
    }));
  }

  private async expensesByCategory(businessId: string, from: Date, to: Date, branchIds: string[] | null) {
    const rows = await prisma.$queryRaw<{ categoryId: string; amount: Prisma.Decimal; amountPaid: Prisma.Decimal; count: bigint }[]>`
      SELECT e."categoryId" AS "categoryId",
             COALESCE(SUM(e."amount"), 0) AS amount,
             COALESCE(SUM(e."amountPaid"), 0) AS "amountPaid",
             COUNT(*) AS count
      FROM "Expense" e
      WHERE e."businessId" = ${businessId}
        AND e."status" <> 'VOIDED'
        AND e."expenseDate" >= ${from}
        AND e."expenseDate" <= ${to}
        ${this.branchSql(branchIds, 'e."branchId"')}
      GROUP BY 1
      ORDER BY 2 DESC
    `;
    const ids = rows.map((r) => r.categoryId);
    const categories = ids.length
      ? await prisma.expenseCategory.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : [];
    const names = new Map(categories.map((c) => [c.id, c.name]));
    return rows.map((r) => ({
      categoryId: r.categoryId,
      categoryName: names.get(r.categoryId) ?? 'Unknown category',
      amount: toDecimal(r.amount),
      amountPaid: toDecimal(r.amountPaid),
      count: Number(r.count),
    }));
  }

  // ---------------------------------------------------------------- public API

  async getSummary(businessId: string, userId: string, query: ReportQuery) {
    const ctx = await this.resolveContext(businessId, userId, query);
    const empty = ctx.branchIds !== null && ctx.branchIds.length === 0;

    const revenueTotals = empty
      ? { amount: ZERO, count: 0 }
      : await this.revenueTotal(businessId, ctx.from, ctx.to, ctx.scope, query.branchId);
    const collectedTotals = empty
      ? { amount: ZERO, count: 0 }
      : await this.collectedTotal(businessId, ctx.from, ctx.to, ctx.scope, query.branchId);
    const revenue = revenueTotals.amount;
    const revenueCount = revenueTotals.count;
    const collected = collectedTotals.amount;
    const collectedCount = collectedTotals.count;
    const refunds = empty
      ? ZERO
      : (await this.refundsCompletedTotal(businessId, ctx.from, ctx.to, ctx.scope, query.branchId)).amount;
    const outstanding = empty ? ZERO : await this.outstandingTotal(businessId, ctx.branchIds);
    const exp = empty
      ? { incurred: ZERO, paid: ZERO, unpaid: ZERO, count: 0 }
      : await this.expensesTotal(businessId, ctx.from, ctx.to, ctx.scope, query.branchId);

    const netOperatingResult = revenue.minus(exp.incurred);
    const netCashMovement = collected.minus(refunds).minus(exp.paid);

    const [byBranch, byService, byPaymentMethod, byExpenseCategory, byDate] = empty
      ? [[], [], [], [], []]
      : await Promise.all([
          this.buildBranchBreakdown(businessId, ctx.from, ctx.to, ctx.branchIds),
          this.revenueByService(businessId, ctx.from, ctx.to, ctx.branchIds),
          this.collectedByPaymentMethod(businessId, ctx.from, ctx.to, ctx.branchIds),
          this.expensesByCategory(businessId, ctx.from, ctx.to, ctx.branchIds),
          this.buildDateBreakdown(businessId, ctx.timezone, ctx.from, ctx.to, ctx.branchIds),
        ]);

    return {
      period: { from: ctx.from.toISOString(), to: ctx.to.toISOString(), timezone: ctx.timezone },
      filters: { branchId: query.branchId ?? null, allBranches: query.branchId ? false : ctx.scope.allBranches },
      summary: {
        totalRevenue: this.money(revenue),
        totalPaymentsCollected: this.money(collected),
        totalRefunds: this.money(refunds),
        totalOutstanding: this.money(outstanding),
        totalExpenses: this.money(exp.incurred),
        totalExpensesPaid: this.money(exp.paid),
        totalExpensesUnpaid: this.money(exp.unpaid),
        netOperatingResult: this.money(netOperatingResult),
        netCashMovement: this.money(netCashMovement),
        revenueBasis: 'EARNED',
        transactionCount: collectedCount,
        appointmentCount: revenueCount,
        expenseCount: exp.count,
      },
      breakdowns: {
        byBranch,
        byService: byService.map((s) => ({ ...s, amount: this.money(s.amount) })),
        byPaymentMethod: byPaymentMethod.map((p) => ({ ...p, amount: this.money(p.amount) })),
        byExpenseCategory: byExpenseCategory.map((c) => ({
          ...c,
          amount: this.money(c.amount),
          amountPaid: this.money(c.amountPaid),
        })),
        byDate: byDate.map((d) => ({
          date: d.date,
          revenue: this.money(d.revenue),
          collected: this.money(d.collected),
          refunds: this.money(d.refunds),
          expenses: this.money(d.expenses),
        })),
      },
    };
  }

  async getRevenueReport(businessId: string, userId: string, query: ReportQuery) {
    const ctx = await this.resolveContext(businessId, userId, query);
    const empty = ctx.branchIds !== null && ctx.branchIds.length === 0;

    const total = empty
      ? { amount: ZERO, count: 0 }
      : await this.revenueTotal(businessId, ctx.from, ctx.to, ctx.scope, query.branchId);

    const [byBranch, byService, byDate] = empty
      ? [[], [], []]
      : await Promise.all([
          this.buildBranchBreakdown(businessId, ctx.from, ctx.to, ctx.branchIds, 'revenue'),
          this.revenueByService(businessId, ctx.from, ctx.to, ctx.branchIds),
          this.revenueByDate(businessId, ctx.timezone, ctx.from, ctx.to, ctx.branchIds),
        ]);

    return {
      period: { from: ctx.from.toISOString(), to: ctx.to.toISOString(), timezone: ctx.timezone },
      filters: { branchId: query.branchId ?? null },
      totalRevenue: this.money(total.amount),
      appointmentCount: total.count,
      breakdowns: {
        byBranch,
        byService: byService.map((s) => ({ ...s, amount: this.money(s.amount) })),
        byDate: byDate.map((d) => ({ date: d.day, revenue: this.money(d.amount) })),
      },
    };
  }

  async getCollectionReport(businessId: string, userId: string, query: ReportQuery) {
    const ctx = await this.resolveContext(businessId, userId, query);
    const empty = ctx.branchIds !== null && ctx.branchIds.length === 0;

    const collected = empty
      ? { amount: ZERO, count: 0 }
      : await this.collectedTotal(businessId, ctx.from, ctx.to, ctx.scope, query.branchId);
    const refunds = empty
      ? { amount: ZERO, count: 0 }
      : await this.refundsCompletedTotal(businessId, ctx.from, ctx.to, ctx.scope, query.branchId);

    const [byPaymentMethod, byBranch, byRecordedBy, byDate] = empty
      ? [[], [], [], []]
      : await Promise.all([
          this.collectedByPaymentMethod(businessId, ctx.from, ctx.to, ctx.branchIds),
          this.buildBranchBreakdown(businessId, ctx.from, ctx.to, ctx.branchIds, 'collected'),
          this.collectedByRecordedBy(businessId, ctx.from, ctx.to, ctx.branchIds),
          this.collectedByDate(businessId, ctx.timezone, ctx.from, ctx.to, ctx.branchIds),
        ]);

    return {
      period: { from: ctx.from.toISOString(), to: ctx.to.toISOString(), timezone: ctx.timezone },
      filters: { branchId: query.branchId ?? null },
      totalCollected: this.money(collected.amount),
      totalRefunds: this.money(refunds.amount),
      netCollected: this.money(collected.amount.minus(refunds.amount)),
      transactionCount: collected.count,
      breakdowns: {
        byPaymentMethod: byPaymentMethod.map((p) => ({ ...p, amount: this.money(p.amount) })),
        byBranch,
        byRecordedBy: byRecordedBy.map((r) => ({ ...r, amount: this.money(r.amount) })),
        byDate: byDate.map((d) => ({ date: d.day, collected: this.money(d.amount) })),
      },
    };
  }

  async getRefundReport(businessId: string, userId: string, query: ReportQuery & { page?: number; limit?: number }) {
    const ctx = await this.resolveContext(businessId, userId, query);
    const empty = ctx.branchIds !== null && ctx.branchIds.length === 0;

    const statusGroups = empty
      ? []
      : await prisma.refundRequest.groupBy({
          by: ['status'],
          where: {
            appointment: {
              businessId,
              ...financeAccessService.branchWhere(ctx.scope, query.branchId),
            },
          },
          _sum: { requestedAmount: true, approvedAmount: true },
          _count: { _all: true },
        });

    const byStatus: Record<string, { count: number; requestedAmount: string; approvedAmount: string }> = {
      PENDING: { count: 0, requestedAmount: '0.00', approvedAmount: '0.00' },
      APPROVED: { count: 0, requestedAmount: '0.00', approvedAmount: '0.00' },
      REJECTED: { count: 0, requestedAmount: '0.00', approvedAmount: '0.00' },
      COMPLETED: { count: 0, requestedAmount: '0.00', approvedAmount: '0.00' },
    };
    for (const group of statusGroups) {
      byStatus[group.status] = {
        count: group._count._all,
        requestedAmount: this.money(group._sum.requestedAmount),
        approvedAmount: this.money(group._sum.approvedAmount),
      };
    }

    // Completed refunds in the period are the only ones that are real cash outflows.
    const completed = empty
      ? { amount: ZERO, count: 0 }
      : await this.refundsCompletedTotal(businessId, ctx.from, ctx.to, ctx.scope, query.branchId);
    const refundsByBranch = empty
      ? []
      : await this.refundsByBranch(businessId, ctx.from, ctx.to, ctx.branchIds);

    return {
      period: { from: ctx.from.toISOString(), to: ctx.to.toISOString(), timezone: ctx.timezone },
      filters: { branchId: query.branchId ?? null },
      completedRefundAmount: this.money(completed.amount),
      completedRefundCount: completed.count,
      byStatus,
      byBranch: refundsByBranch.map((r) => ({ ...r, amount: this.money(r.amount) })),
    };
  }

  async getOutstandingReport(businessId: string, userId: string, query: ReportQuery & { page?: number; limit?: number }) {
    const scope = await financeAccessService.resolveScope(businessId, userId, query.branchId);
    const branchIds = financeAccessService.sqlBranchIds(scope, query.branchId);
    const empty = branchIds !== null && branchIds.length === 0;

    const totalOutstanding = empty ? ZERO : await this.outstandingTotal(businessId, branchIds);

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;
    const offset = (page - 1) * limit;

    // Outstanding > 0 is filtered and paginated in the database, so we never load the
    // full set of appointments into Node.
    const paidSubquery = Prisma.sql`(
      SELECT "appointmentId", SUM("amount") AS paid
      FROM "AppointmentPayment"
      WHERE "status" IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
      GROUP BY "appointmentId"
    )`;
    const branchCond = this.branchSql(branchIds, 'a."branchId"');

    let total = 0;
    let pageRows: { id: string; outstanding: Prisma.Decimal }[] = [];

    if (!empty) {
      const countRows = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS count FROM (
          SELECT a."id" AS id,
                 GREATEST(a."finalAgreedAmount" - COALESCE(p.paid, 0), 0) AS outstanding
          FROM "Appointment" a
          LEFT JOIN ${paidSubquery} p ON p."appointmentId" = a."id"
          WHERE a."businessId" = ${businessId}
            AND a."finalAgreedAmount" IS NOT NULL
            ${branchCond}
        ) sub
        WHERE sub.outstanding > 0
      `;
      total = Number(countRows[0]?.count ?? 0);

      pageRows = await prisma.$queryRaw<{ id: string; outstanding: Prisma.Decimal }[]>`
        SELECT * FROM (
          SELECT a."id" AS id,
                 GREATEST(a."finalAgreedAmount" - COALESCE(p.paid, 0), 0) AS outstanding
          FROM "Appointment" a
          LEFT JOIN ${paidSubquery} p ON p."appointmentId" = a."id"
          WHERE a."businessId" = ${businessId}
            AND a."finalAgreedAmount" IS NOT NULL
            ${branchCond}
        ) sub
        WHERE sub.outstanding > 0
        ORDER BY sub.outstanding DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }

    const ids = pageRows.map((r) => r.id);
    const appointments = ids.length
      ? await prisma.appointment.findMany({
          where: { id: { in: ids } },
          select: {
            id: true, branchId: true, customerId: true, status: true, scheduledStart: true,
            totalAmount: true, finalAgreedAmount: true,
            customer: { select: { id: true, firstName: true, lastName: true } },
          },
        })
      : [];
    const byId = new Map(appointments.map((a) => [a.id, a]));

    const data = [];
    for (const id of ids) {
      const appt = byId.get(id);
      if (!appt) continue;
      // Reuse the canonical per-appointment calculation for the displayed figures.
      const financials = await getAppointmentFinancials(prisma, id);
      data.push({
        appointmentId: appt.id,
        branchId: appt.branchId,
        customerId: appt.customerId,
        customerName: appt.customer ? `${appt.customer.firstName} ${appt.customer.lastName}`.trim() : null,
        status: appt.status,
        scheduledStart: appt.scheduledStart,
        originalAmount: this.money(appt.totalAmount),
        finalAgreedAmount: this.money(appt.finalAgreedAmount),
        verifiedPaid: this.money(financials.verifiedPaid),
        outstanding: this.money(financials.outstanding),
      });
    }

    return {
      asOf: new Date().toISOString(),
      filters: { branchId: query.branchId ?? null },
      totalOutstanding: this.money(totalOutstanding),
      appointments: data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getExpenseReport(businessId: string, userId: string, query: ReportQuery) {
    const ctx = await this.resolveContext(businessId, userId, query);
    const empty = ctx.branchIds !== null && ctx.branchIds.length === 0;

    const totals = empty
      ? { incurred: ZERO, paid: ZERO, unpaid: ZERO, count: 0 }
      : await this.expensesTotal(businessId, ctx.from, ctx.to, ctx.scope, query.branchId);

    const [byCategory, byBranch, byDate] = empty
      ? [[], [], []]
      : await Promise.all([
          this.expensesByCategory(businessId, ctx.from, ctx.to, ctx.branchIds),
          this.expensesByBranch(businessId, ctx.from, ctx.to, ctx.branchIds),
          this.expensesByDate(businessId, ctx.timezone, ctx.from, ctx.to, ctx.branchIds),
        ]);

    const branchNames = await this.branchNames(businessId);

    return {
      period: { from: ctx.from.toISOString(), to: ctx.to.toISOString(), timezone: ctx.timezone },
      filters: { branchId: query.branchId ?? null },
      totalExpenses: this.money(totals.incurred),
      totalExpensesPaid: this.money(totals.paid),
      totalExpensesUnpaid: this.money(totals.unpaid),
      expenseCount: totals.count,
      breakdowns: {
        byCategory: byCategory.map((c) => ({
          ...c,
          amount: this.money(c.amount),
          amountPaid: this.money(c.amountPaid),
        })),
        byBranch: byBranch.map((b) => ({
          branchId: b.branchId,
          branchName: branchNames.get(b.branchId) ?? 'Unknown branch',
          amount: this.money(b.amount),
          amountPaid: this.money(b.amountPaid),
          count: b.count,
        })),
        byDate: byDate.map((d) => ({ date: d.day, expenses: this.money(d.amount), expensesPaid: this.money(d.amountPaid) })),
      },
    };
  }

  // ---------------------------------------------------------------- breakdown helpers

  private async buildBranchBreakdown(
    businessId: string,
    from: Date,
    to: Date,
    branchIds: string[] | null,
    only?: 'revenue' | 'collected'
  ) {
    const names = await this.branchNames(businessId);
    const [revenue, collected, refunds, expenses] = await Promise.all([
      only === 'collected' ? Promise.resolve([]) : this.revenueByBranch(businessId, from, to, branchIds),
      only === 'revenue' ? Promise.resolve([]) : this.collectedByBranch(businessId, from, to, branchIds),
      only ? Promise.resolve([]) : this.refundsByBranch(businessId, from, to, branchIds),
      only ? Promise.resolve([]) : this.expensesByBranch(businessId, from, to, branchIds),
    ]);

    const map = new Map<string, any>();
    const ensure = (branchId: string) => {
      if (!map.has(branchId)) {
        map.set(branchId, {
          branchId,
          branchName: names.get(branchId) ?? 'Unknown branch',
          revenue: ZERO,
          collected: ZERO,
          refunds: ZERO,
          expenses: ZERO,
          expensesPaid: ZERO,
        });
      }
      return map.get(branchId);
    };

    for (const r of revenue) ensure(r.branchId).revenue = r.amount;
    for (const c of collected) ensure(c.branchId).collected = c.amount;
    for (const r of refunds) ensure(r.branchId).refunds = r.amount;
    for (const e of expenses) {
      const row = ensure(e.branchId);
      row.expenses = e.amount;
      row.expensesPaid = e.amountPaid;
    }

    return Array.from(map.values()).map((row) => ({
      branchId: row.branchId,
      branchName: row.branchName,
      revenue: this.money(row.revenue),
      collected: this.money(row.collected),
      refunds: this.money(row.refunds),
      expenses: this.money(row.expenses),
      expensesPaid: this.money(row.expensesPaid),
      netOperatingResult: this.money(row.revenue.minus(row.expenses)),
    }));
  }

  private async buildDateBreakdown(
    businessId: string,
    timezone: string,
    from: Date,
    to: Date,
    branchIds: string[] | null
  ) {
    const [revenue, collected, refunds, expenses] = await Promise.all([
      this.revenueByDate(businessId, timezone, from, to, branchIds),
      this.collectedByDate(businessId, timezone, from, to, branchIds),
      this.refundsByDate(businessId, timezone, from, to, branchIds),
      this.expensesByDate(businessId, timezone, from, to, branchIds),
    ]);

    const map = new Map<string, { date: string; revenue: any; collected: any; refunds: any; expenses: any }>();
    const ensure = (day: string) => {
      if (!map.has(day)) {
        map.set(day, { date: day, revenue: ZERO, collected: ZERO, refunds: ZERO, expenses: ZERO });
      }
      return map.get(day)!;
    };

    for (const r of revenue) ensure(r.day).revenue = toDecimal(r.amount);
    for (const c of collected) ensure(c.day).collected = toDecimal(c.amount);
    for (const r of refunds) ensure(r.day).refunds = toDecimal(r.amount);
    for (const e of expenses) ensure(e.day).expenses = toDecimal(e.amount);

    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }
}

export const financeReportService = new FinanceReportService();
