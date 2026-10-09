import { FollowUpOutcome, Prisma } from '@prisma/client';
import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';
import { appointmentService } from './appointment.service';

export interface FollowUpListQuery {
  branchId?: string;
  status?: 'OPEN' | 'RESOLVED' | 'CANCELLED';
  page?: number;
  limit?: number;
}

export interface ResolveFollowUpInput {
  outcome: FollowUpOutcome;
  note?: string;
  /** Required when outcome is RESCHEDULED. */
  newStartTime?: string;
  /** Optional staff reassignment on reschedule. */
  staffId?: string;
}

const ALLOWED_OUTCOMES: FollowUpOutcome[] = [
  FollowUpOutcome.CONFIRMED,
  FollowUpOutcome.CANCELLED,
  FollowUpOutcome.RESCHEDULED,
];

export class AppointmentFollowUpService {
  /**
   * Branch-scoped authorization that mirrors the appointment module: OWNER/ADMIN
   * see the whole business; branch-scoped roles only see their branches.
   */
  private async resolveAccessScope(businessId: string, userId: string) {
    const membership = await prisma.businessMember.findUnique({
      where: { businessId_userId: { businessId, userId } },
      include: {
        userRoles: { include: { role: true, branches: { select: { branchId: true } } } },
      },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      throw new ApiError(403, 'Not a member of this business', ErrorCodes.NOT_BUSINESS_MEMBER);
    }

    const roleSystemKeys = membership.userRoles
      .map((ur) => ur.role.systemKey)
      .filter((key): key is string => Boolean(key));
    const isOwnerOrAdmin = roleSystemKeys.some((key) => ['OWNER', 'ADMIN'].includes(key));

    const allowedBranchIds = new Set(
      membership.userRoles
        .filter((ur) => ur.scopeType === 'BRANCH')
        .flatMap((ur) => ur.branches.map((b) => b.branchId))
    );

    return { isOwnerOrAdmin, allowedBranchIds };
  }

  async list(businessId: string, userId: string, query: FollowUpListQuery) {
    const scope = await this.resolveAccessScope(businessId, userId);

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

    const where: Prisma.AppointmentFollowUpWhereInput = { businessId };
    if (query.status) where.status = query.status;
    else where.status = 'OPEN';

    if (query.branchId) {
      if (!scope.isOwnerOrAdmin && !scope.allowedBranchIds.has(query.branchId)) {
        throw new ApiError(403, 'Access denied to this branch', ErrorCodes.FORBIDDEN);
      }
      where.branchId = query.branchId;
    } else if (!scope.isOwnerOrAdmin) {
      where.branchId = { in: Array.from(scope.allowedBranchIds) };
    }

    const [total, rows] = await Promise.all([
      prisma.appointmentFollowUp.count({ where }),
      prisma.appointmentFollowUp.findMany({
        where,
        orderBy: [{ status: 'asc' }, { deadlineAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          appointment: {
            select: {
              id: true,
              scheduledStart: true,
              scheduledEnd: true,
              status: true,
              confirmationStatus: true,
              customerConfirmedAt: true,
              bookingSource: true,
              branch: { select: { id: true, name: true, timezone: true, address: true } },
              service: { select: { id: true, name: true, durationMinutes: true } },
              customer: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  phones: { select: { phone: true, isPrimary: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      data: rows.map((row) => this.mapFollowUp(row)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Follow-up state used as a warning/indicator on the appointment detail view. */
  async getForAppointment(businessId: string, appointmentId: string) {
    const followUps = await prisma.appointmentFollowUp.findMany({
      where: { appointmentId, businessId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const open = followUps.find((f) => f.status === 'OPEN') ?? null;
    const latest = followUps[0] ?? null;
    const reminders = await prisma.appointmentReminder.findMany({
      where: { appointmentId },
      orderBy: { scheduledFor: 'asc' },
      select: {
        id: true,
        type: true,
        status: true,
        scheduledFor: true,
        attemptCount: true,
        sentAt: true,
        lastError: true,
      },
    });

    return {
      needsFollowUp: Boolean(open),
      open,
      latest,
      history: followUps,
      reminders,
    };
  }

  /**
   * Record a staff resolution. Only CONFIRMED, CANCELLED, and RESCHEDULED are
   * supported. The follow-up is claimed atomically (conditional update) so a
   * repeated or concurrent request cannot execute the underlying appointment
   * service twice.
   */
  async resolve(
    businessId: string,
    userId: string,
    followUpId: string,
    input: ResolveFollowUpInput
  ) {
    if (!ALLOWED_OUTCOMES.includes(input.outcome)) {
      throw new ApiError(
        400,
        `Unsupported outcome. Allowed: ${ALLOWED_OUTCOMES.join(', ')}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    if (input.outcome === FollowUpOutcome.RESCHEDULED && !input.newStartTime) {
      throw new ApiError(400, 'newStartTime is required when rescheduling', ErrorCodes.VALIDATION_ERROR);
    }

    const followUp = await prisma.appointmentFollowUp.findFirst({
      where: { id: followUpId, businessId },
    });
    if (!followUp) {
      throw new ApiError(404, 'Follow-up not found', ErrorCodes.NOT_FOUND);
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: followUp.appointmentId },
    });
    if (!appointment || appointment.businessId !== businessId) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);
    }

    await appointmentService.verifyAppointmentAccess(businessId, userId, appointment);

    // Idempotency: a resolved/cancelled follow-up is never re-applied.
    if (followUp.status !== 'OPEN') {
      return { followUp, alreadyResolved: true };
    }

    const now = new Date();
    const claim = await prisma.appointmentFollowUp.updateMany({
      where: { id: followUpId, status: 'OPEN' },
      data: {
        status: 'RESOLVED',
        outcome: input.outcome,
        handledById: userId,
        handledAt: now,
        note: input.note?.slice(0, 1000) ?? null,
        resolvedVia: 'STAFF',
      },
    });

    if (claim.count === 0) {
      // Lost the race; another staff member handled it.
      const current = await prisma.appointmentFollowUp.findUnique({ where: { id: followUpId } });
      return { followUp: current, alreadyResolved: true };
    }

    try {
      if (input.outcome === FollowUpOutcome.CONFIRMED) {
        await appointmentService.confirmAttendance(followUp.appointmentId, businessId, userId);
      } else if (input.outcome === FollowUpOutcome.CANCELLED) {
        await appointmentService.cancelAppointment(
          businessId,
          userId,
          followUp.appointmentId,
          true,
          undefined,
          input.note || 'Cancelled by staff after follow-up'
        );
      } else {
        await appointmentService.rescheduleBusinessAppointment(
          businessId,
          userId,
          followUp.appointmentId,
          new Date(input.newStartTime as string),
          input.note || 'Rescheduled by staff after follow-up',
          input.staffId
        );
      }
    } catch (error) {
      // Business action failed: release the claim so staff can retry.
      await prisma.appointmentFollowUp.updateMany({
        where: { id: followUpId, status: 'RESOLVED', handledAt: now },
        data: {
          status: 'OPEN',
          outcome: null,
          handledById: null,
          handledAt: null,
          resolvedVia: null,
        },
      });
      throw error;
    }

    const finalFollowUp = await prisma.appointmentFollowUp.findUnique({ where: { id: followUpId } });
    return { followUp: finalFollowUp, alreadyResolved: false };
  }

  /**
   * Deliberately open a new follow-up for another contact attempt. Historical
   * rows are preserved; only one OPEN follow-up per appointment is permitted,
   * so this is rejected while one is already open.
   */
  async reopen(businessId: string, userId: string, followUpId: string, note?: string) {
    const previous = await prisma.appointmentFollowUp.findFirst({
      where: { id: followUpId, businessId },
    });
    if (!previous) {
      throw new ApiError(404, 'Follow-up not found', ErrorCodes.NOT_FOUND);
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: previous.appointmentId },
    });
    if (!appointment || appointment.businessId !== businessId) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);
    }
    await appointmentService.verifyAppointmentAccess(businessId, userId, appointment);

    const existingOpen = await prisma.appointmentFollowUp.findFirst({
      where: { appointmentId: previous.appointmentId, status: 'OPEN' },
    });
    if (existingOpen) {
      throw new ApiError(409, 'An open follow-up already exists for this appointment', ErrorCodes.CONFLICT);
    }

    if (['CANCELLED', 'COMPLETED', 'NO_SHOW', 'EXPIRED'].includes(appointment.status)) {
      throw new ApiError(400, `Cannot reopen a follow-up for an appointment in ${appointment.status} status`, ErrorCodes.VALIDATION_ERROR);
    }

    return prisma.appointmentFollowUp.create({
      data: {
        appointmentId: previous.appointmentId,
        businessId: previous.businessId,
        branchId: previous.branchId,
        scheduleVersion: appointment.reminderScheduleVersion,
        status: 'OPEN',
        reason: note || 'Follow-up reopened for another contact attempt',
        deadlineAt: previous.deadlineAt,
      },
    });
  }

  private mapFollowUp(row: any) {
    const appt = row.appointment;
    const primaryPhone =
      appt?.customer?.phones?.find((p: any) => p.isPrimary)?.phone ??
      appt?.customer?.phones?.[0]?.phone ??
      null;

    return {
      id: row.id,
      status: row.status,
      outcome: row.outcome,
      reason: row.reason,
      deadlineAt: row.deadlineAt,
      handledById: row.handledById,
      handledAt: row.handledAt,
      note: row.note,
      resolvedVia: row.resolvedVia,
      createdAt: row.createdAt,
      appointment: appt
        ? {
            id: appt.id,
            scheduledStart: appt.scheduledStart,
            scheduledEnd: appt.scheduledEnd,
            status: appt.status,
            confirmationStatus: appt.confirmationStatus,
            customerConfirmedAt: appt.customerConfirmedAt,
            bookingSource: appt.bookingSource,
            branch: appt.branch,
            service: appt.service,
            customer: appt.customer
              ? {
                  id: appt.customer.id,
                  firstName: appt.customer.firstName,
                  lastName: appt.customer.lastName,
                  phone: primaryPhone,
                }
              : null,
          }
        : null,
    };
  }

  /** Reminder history for staff-facing views. */
  async getReminderHistory(businessId: string, appointmentId: string) {
    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment || appointment.businessId !== businessId) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);
    }
    return prisma.appointmentReminder.findMany({
      where: { appointmentId },
      orderBy: { scheduledFor: 'asc' },
      include: {
        attempts: { orderBy: { createdAt: 'asc' } },
      },
    });
  }
}

export const appointmentFollowUpService = new AppointmentFollowUpService();
