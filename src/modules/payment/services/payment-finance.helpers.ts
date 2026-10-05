import {
  AppointmentPaymentStatus,
  Prisma,
  RefundPolicyType,
  RefundRequestStatus,
} from '@prisma/client';

/**
 * Canonical financial calculations for payments, outstanding balances and refunds.
 *
 * One source of truth is used everywhere so the financial state stays unambiguous:
 *
 *   verified payments  ->  final agreed amount  ->  outstanding
 *   verified payments  ->  refund policy cap    ->  refundable (minus refunded/reserved)
 *
 * Money rules:
 *  - VOIDED payments are not money and never count.
 *  - PENDING / REJECTED receipts never create a payment, so they never count.
 *  - A refund does NOT reduce "paid" and does NOT become customer debt. The customer
 *    paid it; the salon separately owes it back. Refunds live on their own ledger.
 *  - Multiple active refund requests may not collectively exceed the refundable amount.
 */

export const ZERO = new Prisma.Decimal(0);

/** Any Prisma client or interactive transaction client. */
export type Db = Prisma.TransactionClient;

export function toDecimal(value: Prisma.Decimal | number | string | null | undefined): Prisma.Decimal {
  if (value === null || value === undefined) return new Prisma.Decimal(0);
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value.toString());
}

/** Statuses that still represent money actually received (voided money does not). */
export const VERIFIED_PAYMENT_STATUSES: AppointmentPaymentStatus[] = [
  AppointmentPaymentStatus.PAID,
  AppointmentPaymentStatus.PARTIALLY_REFUNDED,
  AppointmentPaymentStatus.REFUNDED,
];

/** Refund request statuses that reserve refundable money before completion. */
export const ACTIVE_REFUND_STATUSES: RefundRequestStatus[] = [
  RefundRequestStatus.PENDING,
  RefundRequestStatus.APPROVED,
];

/**
 * Serialize all refund/payment mutations for one appointment by taking a row lock
 * on its payments. Prevents two admins approving/completing overlapping refunds
 * against the same refundable balance.
 */
export async function lockAppointmentPayments(db: Db, appointmentId: string): Promise<void> {
  await db.$queryRaw`SELECT id FROM "AppointmentPayment" WHERE "appointmentId" = ${appointmentId} FOR UPDATE`;
}

/** Sum of verified (non-voided) payments for an appointment. */
export async function getVerifiedPaidTotal(db: Db, appointmentId: string): Promise<Prisma.Decimal> {
  const agg = await db.appointmentPayment.aggregate({
    where: { appointmentId, status: { in: VERIFIED_PAYMENT_STATUSES } },
    _sum: { amount: true },
  });
  return toDecimal(agg._sum.amount);
}

/** Sum of amounts already refunded and confirmed (COMPLETED refunds) for an appointment. */
export async function getRefundedTotal(db: Db, appointmentId: string): Promise<Prisma.Decimal> {
  const agg = await db.appointmentPayment.aggregate({
    where: { appointmentId },
    _sum: { refundedAmount: true },
  });
  return toDecimal(agg._sum.refundedAmount);
}

/** Sum of in-flight refund reservations (PENDING/APPROVED) for an appointment. */
export async function getActiveRefundReservations(
  db: Db,
  appointmentId: string,
  excludeRefundRequestId?: string
): Promise<Prisma.Decimal> {
  const rows = await db.refundRequest.findMany({
    where: {
      appointmentId,
      status: { in: ACTIVE_REFUND_STATUSES },
      ...(excludeRefundRequestId ? { id: { not: excludeRefundRequestId } } : {}),
    },
    select: { requestedAmount: true, approvedAmount: true },
  });

  return rows.reduce(
    (sum, row) => sum.plus(toDecimal(row.approvedAmount ?? row.requestedAmount)),
    ZERO
  );
}

/**
 * Refund cap implied by the effective refund policy for an appointment.
 *
 * Resolution order:
 *   1. If appointment has an explicit override (refundPolicyTypeOverride is set),
 *      use the override fields.
 *   2. Otherwise, use the appointment's current refundPolicyType/refundPercentage/
 *      refundDeadlineHours fields, which may be a snapshot of branch config at
 *      creation time OR dynamically resolved from the branch config.
 *
 * NO_REFUND / no policy -> nothing is refundable.
 */
export function policyRefundCap(
  policyType: RefundPolicyType | null | undefined,
  refundPercentage: number | null | undefined,
  verifiedPaid: Prisma.Decimal
): Prisma.Decimal {
  if (!policyType || policyType === 'NO_REFUND') return ZERO;
  if (policyType === 'FULL_REFUND') return verifiedPaid;
  if (policyType === 'PARTIAL_REFUND') {
    const pct = refundPercentage ?? 0;
    if (pct <= 0) return ZERO;
    if (pct >= 100) return verifiedPaid; // 100% or more = full refund
    return verifiedPaid.mul(pct).div(100);
  }
  return ZERO;
}

/**
 * Resolve the effective refund policy for an appointment. Single source of truth.
 *
 * Priority:
 *   1. Appointment override (refundPolicyTypeOverride is not null)
 *   2. The appointment's own base policy (the snapshot captured at creation, so
 *      later branch-config changes cannot retroactively change an appointment)
 *   3. Branch configuration (fallback for legacy appointments with no snapshot)
 *
 * `null` on the override means "no override / inherit", never "explicitly NO_REFUND".
 */
export function resolveEffectiveRefundPolicy(
  appointment: {
    refundPolicyType: RefundPolicyType | null | undefined;
    refundPercentage: number | null | undefined;
    refundDeadlineHours: number | null | undefined;
    refundPolicyTypeOverride: RefundPolicyType | null | undefined;
    refundPercentageOverride: number | null | undefined;
    refundDeadlineHoursOverride: number | null | undefined;
  },
  branchPolicy: {
    refundPolicyType: RefundPolicyType | null | undefined;
    refundPercentage: number | null | undefined;
    refundDeadlineHours: number | null | undefined;
  }
): {
  policyType: RefundPolicyType;
  refundPercentage: number | null;
  refundDeadlineHours: number | null;
  isOverridden: boolean;
} {
  // 1. Explicit appointment override wins.
  const overrideType = appointment.refundPolicyTypeOverride;
  if (overrideType !== null && overrideType !== undefined) {
    return {
      policyType: overrideType,
      refundPercentage: appointment.refundPercentageOverride ?? null,
      refundDeadlineHours: appointment.refundDeadlineHoursOverride ?? null,
      isOverridden: true,
    };
  }

  // 2. No override - use the appointment's creation-time snapshot when present,
  //    otherwise fall back to the current branch configuration.
  return {
    policyType: appointment.refundPolicyType ?? branchPolicy.refundPolicyType ?? 'NO_REFUND',
    refundPercentage: appointment.refundPercentage ?? branchPolicy.refundPercentage ?? null,
    refundDeadlineHours:
      appointment.refundDeadlineHours ?? branchPolicy.refundDeadlineHours ?? null,
    isOverridden: false,
  };
}

export interface AppointmentFinancials {
  appointmentId: string;
  originalAmount: Prisma.Decimal;
  finalAgreedAmount: Prisma.Decimal | null;
  finalized: boolean;
  verifiedPaid: Prisma.Decimal;
  outstanding: Prisma.Decimal;
  refunded: Prisma.Decimal;
  refundReserved: Prisma.Decimal;
  refundable: Prisma.Decimal;
}

/**
 * Canonical appointment-level financial state.
 * Outstanding = finalAgreedAmount - verifiedPaid (never negative), and only exists
 * once the amount is finalized. Refunds are reported separately and never become debt.
 */
/**
 * Get the effective refund policy type and percentage for an appointment using the
 * canonical resolver (override -> appointment snapshot -> branch config).
 * Used by the financial calculations, which operate under a lock.
 */
export async function getEffectiveRefundPolicyForFinancials(
  db: Db,
  appointmentId: string
): Promise<{ policyType: RefundPolicyType | null; refundPercentage: number | null }> {
  const appointment = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      branchId: true,
      refundPolicyType: true,
      refundPercentage: true,
      refundDeadlineHours: true,
      refundPolicyTypeOverride: true,
      refundPercentageOverride: true,
      refundDeadlineHoursOverride: true,
    },
  });

  if (!appointment) {
    throw new Error(`Appointment ${appointmentId} not found`);
  }

  const branchConfig = await db.branchBookingConfig.findUnique({
    where: { branchId: appointment.branchId },
    select: { refundPolicyType: true, refundPercentage: true, refundDeadlineHours: true },
  });

  const resolved = resolveEffectiveRefundPolicy(appointment, {
    refundPolicyType: branchConfig?.refundPolicyType ?? null,
    refundPercentage: branchConfig?.refundPercentage ?? null,
    refundDeadlineHours: branchConfig?.refundDeadlineHours ?? null,
  });

  return { policyType: resolved.policyType, refundPercentage: resolved.refundPercentage };
}

export async function getAppointmentFinancials(
  db: Db,
  appointmentId: string,
  options?: { excludeRefundRequestId?: string }
): Promise<AppointmentFinancials> {
  // Get the effective refund policy first (this does a separate query with proper select)
  const effectivePolicy = await getEffectiveRefundPolicyForFinancials(db, appointmentId);

  // Get the full appointment for other fields
  const appointment = await db.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment) {
    throw new Error(`Appointment ${appointmentId} not found`);
  }

  const verifiedPaid = await getVerifiedPaidTotal(db, appointmentId);
  const refunded = await getRefundedTotal(db, appointmentId);
  const refundReserved = await getActiveRefundReservations(db, appointmentId, options?.excludeRefundRequestId);

  const finalAgreedAmount = appointment.finalAgreedAmount ?? null;
  let outstanding = ZERO;
  if (finalAgreedAmount !== null) {
    const raw = finalAgreedAmount.minus(verifiedPaid);
    outstanding = raw.gt(0) ? raw : ZERO;
  }

  // Use the effective refund policy (override-aware)
  const cap = policyRefundCap(effectivePolicy.policyType, effectivePolicy.refundPercentage, verifiedPaid);
  const availableRefundable = cap.minus(refunded).minus(refundReserved);

  return {
    appointmentId,
    originalAmount: appointment.totalAmount,
    finalAgreedAmount,
    finalized: finalAgreedAmount !== null,
    verifiedPaid,
    outstanding,
    refunded,
    refundReserved,
    refundable: availableRefundable.gt(0) ? availableRefundable : ZERO,
  };
}

/**
 * Allocate a confirmed refund across the appointment's verified payments, oldest first.
 * Mutates AppointmentPayment.refundedAmount / status. The original `amount` is never
 * changed, so history stays readable: Payment +500, Refund -200, Net paid 300.
 */
export async function applyCompletedRefund(
  db: Db,
  appointmentId: string,
  amount: Prisma.Decimal
): Promise<Prisma.Decimal> {
  if (amount.lte(0)) return ZERO;

  const payments = await db.appointmentPayment.findMany({
    where: {
      appointmentId,
      status: { in: [AppointmentPaymentStatus.PAID, AppointmentPaymentStatus.PARTIALLY_REFUNDED] },
    },
    orderBy: { paidAt: 'asc' },
  });

  let remaining = amount;

  for (const payment of payments) {
    if (remaining.lte(0)) break;

    const capacity = payment.amount.minus(payment.refundedAmount);
    if (capacity.lte(0)) continue;

    const take = capacity.lt(remaining) ? capacity : remaining;
    const newRefunded = payment.refundedAmount.plus(take);
    const newStatus = newRefunded.gte(payment.amount)
      ? AppointmentPaymentStatus.REFUNDED
      : AppointmentPaymentStatus.PARTIALLY_REFUNDED;

    await db.appointmentPayment.update({
      where: { id: payment.id },
      data: { refundedAmount: newRefunded, status: newStatus },
    });

    remaining = remaining.minus(take);
  }

  if (remaining.gt(0)) {
    throw new Error('Refund exceeds the refundable payment amount');
  }

  return amount;
}
