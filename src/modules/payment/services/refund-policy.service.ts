import { RefundPolicyType } from '@prisma/client';
import { Db, getAppointmentFinancials, policyRefundCap, resolveEffectiveRefundPolicy } from './payment-finance.helpers';

export interface EffectiveRefundPolicy {
  policyType: RefundPolicyType;
  refundPercentage: number | null;
  refundDeadlineHours: number | null;
  isOverridden: boolean;
}

export interface RefundCalculationResult {
  eligible: boolean;
  policyType: RefundPolicyType;
  refundPercentage: number | null;
  paidAmount: number;
  refundAmount: number;
  refundDeadlineHours: number | null;
  isOverridden: boolean;
  outsideDeadline: boolean;
}

/**
 * Resolve the effective refund policy for an appointment by checking
 * the appointment override first, then falling back to branch config.
 */
export async function getEffectiveRefundPolicy(
  db: Db,
  appointmentId: string,
  branchId: string
): Promise<EffectiveRefundPolicy> {
  const appointment = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
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
    where: { branchId },
    select: {
      refundPolicyType: true,
      refundPercentage: true,
      refundDeadlineHours: true,
    },
  });

  return resolveEffectiveRefundPolicy(
    {
      refundPolicyType: appointment.refundPolicyType,
      refundPercentage: appointment.refundPercentage,
      refundDeadlineHours: appointment.refundDeadlineHours,
      refundPolicyTypeOverride: appointment.refundPolicyTypeOverride,
      refundPercentageOverride: appointment.refundPercentageOverride,
      refundDeadlineHoursOverride: appointment.refundDeadlineHoursOverride,
    },
    {
      refundPolicyType: branchConfig?.refundPolicyType ?? null,
      refundPercentage: branchConfig?.refundPercentage ?? null,
      refundDeadlineHours: branchConfig?.refundDeadlineHours ?? null,
    }
  );
}

/**
 * Calculate the refund amount for an appointment cancellation.
 *
 * @param db - Prisma client or transaction client
 * @param appointmentId - The appointment being cancelled
 * @param branchId - The branch to resolve branch config from
 * @param cancellationTime - When the cancellation is happening (for deadline check)
 * @param scheduledStart - The appointment's scheduled start time
 * @returns RefundCalculationResult with the refund details
 */
export async function calculateRefundOnCancellation(
  db: Db,
  appointmentId: string,
  branchId: string,
  cancellationTime: Date,
  scheduledStart: Date
): Promise<RefundCalculationResult> {
  // Resolve the effective refund policy
  const effectivePolicy = await getEffectiveRefundPolicy(db, appointmentId, branchId);

  // Get financial state
  const financials = await getAppointmentFinancials(db, appointmentId);
  const paidAmount = financials.verifiedPaid.toNumber();

  // If no money was paid, there's nothing to refund
  if (paidAmount <= 0) {
    return {
      eligible: false,
      policyType: effectivePolicy.policyType,
      refundPercentage: effectivePolicy.refundPercentage,
      paidAmount: 0,
      refundAmount: 0,
      refundDeadlineHours: effectivePolicy.refundDeadlineHours,
      isOverridden: effectivePolicy.isOverridden,
      outsideDeadline: false,
    };
  }

  // A cancellation is outside the deadline exactly when it is not within it.
  // The single deadline rule lives in isWithinRefundDeadline() below.
  const outsideDeadline = !isWithinRefundDeadline(
    cancellationTime,
    scheduledStart,
    effectivePolicy.refundDeadlineHours
  );

  // Calculate refund based on policy. An outside-deadline cancellation refunds nothing.
  let refundAmount = 0;
  if (!outsideDeadline) {
    const cap = policyRefundCap(
      effectivePolicy.policyType,
      effectivePolicy.refundPercentage,
      financials.verifiedPaid
    );
    refundAmount = cap.gt(0) ? cap.toNumber() : 0;
  }

  return {
    eligible: refundAmount > 0,
    policyType: effectivePolicy.policyType,
    refundPercentage: effectivePolicy.refundPercentage,
    paidAmount,
    refundAmount,
    refundDeadlineHours: effectivePolicy.refundDeadlineHours,
    isOverridden: effectivePolicy.isOverridden,
    outsideDeadline,
  };
}

/**
 * Check if a cancellation is within the refund deadline.
 * Used for validation without full calculation.
 */
export function isWithinRefundDeadline(
  cancellationTime: Date,
  scheduledStart: Date,
  refundDeadlineHours: number | null | undefined
): boolean {
  if (refundDeadlineHours === null || refundDeadlineHours === undefined) {
    return true; // No deadline set, always eligible
  }

  if (scheduledStart.getTime() <= cancellationTime.getTime()) {
    return true; // Appointment already happened, deadline doesn't apply
  }

  const hoursUntilStart = (scheduledStart.getTime() - cancellationTime.getTime()) / (1000 * 60 * 60);
  return hoursUntilStart >= refundDeadlineHours;
}
