import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';
import { AppointmentStatus, CustomerConfirmationStatus } from '@prisma/client';
import { customerAppointmentService } from '../../customer/services/customer-appointment.service';
import { appointmentActionTokenService } from './appointment-action-token.service';
import { appointmentReminderService } from './appointment-reminder.service';
import {
  buildConfirmationUrl,
  sendPendingApprovalSms,
  sendApprovalNotificationSms,
} from '../../auth/sms/sms.service';
import { config } from '../../../config/env';

const TERMINAL_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.CANCELLED,
  AppointmentStatus.COMPLETED,
  AppointmentStatus.NO_SHOW,
  AppointmentStatus.EXPIRED,
];

/** Operational statuses in which the customer may still acknowledge/act. */
const CUSTOMER_ACTIONABLE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CHECKED_IN,
];

export class CustomerConfirmationService {
  /**
   * Send the correct booking notification after the existing creation/approval
   * workflow finishes. Called after the appointment transaction committed.
   *
   * - PENDING (awaiting staff approval / prepayment): pending-approval notice
   *   with a view-only link. No acknowledgement requested, no reminders.
   * - CONFIRMED with customer confirmation enabled: approval notification with
   *   the self-service link. Reminders were scheduled by the caller.
   *
   * Never throws for SMS failures: notification is best-effort and must not roll
   * back an already-committed appointment.
   */
  async dispatchBookingNotification(appointmentId: string): Promise<{ url: string } | null> {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        customer: { include: { phones: { where: { isPrimary: true }, take: 1 } } },
        branch: { select: { name: true, timezone: true, bookingConfig: true } },
        business: { select: { name: true } },
      },
    });

    if (!appointment) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);
    }

    const phone = appointment.customer.phones[0]?.phone;
    const branchName = appointment.branch.name || appointment.business.name;
    const timezone = appointment.branch.timezone;
    const confirmationEnabled = appointment.branch.bookingConfig?.customerConfirmationEnabled ?? false;

    const shouldSendPending = appointment.status === AppointmentStatus.PENDING;
    const shouldSendApproval =
      appointment.status === AppointmentStatus.CONFIRMED && confirmationEnabled;

    if (!shouldSendPending && !shouldSendApproval) {
      return null;
    }

    // Pending notification would normally only be relevant to ONLINE bookings;
    // the same path is harmless for staff-created pending appointments.
    const token = await appointmentActionTokenService.issueToken(prisma, {
      id: appointment.id,
      businessId: appointment.businessId,
      scheduledEnd: appointment.scheduledEnd,
    });
    const url = buildConfirmationUrl(config.frontendUrl, token);

    if (!phone) {
      return { url };
    }

    try {
      if (shouldSendPending) {
        await sendPendingApprovalSms(phone, url, appointment.scheduledStart, timezone, branchName);
      } else {
        await sendApprovalNotificationSms(phone, url, appointment.scheduledStart, timezone, branchName);
      }
    } catch (error) {
      console.error(
        'Failed to send booking notification SMS:',
        error instanceof Error ? error.message : error
      );
    }

    return { url };
  }

  /**
   * Validates a customer action token and returns safe, minimal appointment
   * details plus the actions currently permitted. The frontend must never be
   * the only enforcement layer — every action is re-validated server-side.
   */
  async getAppointmentFromToken(token: string) {
    const { appointmentId } = await appointmentActionTokenService.resolve(token);
    const appointment = await this.loadAppointmentForToken(appointmentId);
    return this.buildCustomerView(appointment);
  }

  /**
   * Customer confirms attendance (idempotent). Does NOT change the operational
   * appointment status, and is accepted before or after the response deadline as
   * long as the appointment is otherwise actionable.
   */
  async confirmAppointment(token: string) {
    const { appointmentId } = await appointmentActionTokenService.resolve(token);
    const appointment = await this.loadAppointmentForToken(appointmentId);

    this.assertCustomerActionAllowed(appointment, 'confirm');

    if (appointment.confirmationStatus === CustomerConfirmationStatus.CONFIRMED) {
      return this.buildCustomerView(appointment); // Idempotent
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.appointment.updateMany({
        where: {
          id: appointmentId,
          confirmationStatus: { not: CustomerConfirmationStatus.CONFIRMED },
        },
        data: {
          confirmationStatus: CustomerConfirmationStatus.CONFIRMED,
          customerConfirmedAt: now,
          confirmationMethod: 'CUSTOMER_TOKEN',
        },
      });

      // Only the request that actually performed the transition reconciles
      // reminders/follow-ups, so concurrent confirmations cannot double-apply.
      if (claimed.count === 1) {
        await appointmentReminderService.onCustomerConfirmed(tx, appointmentId, 'CUSTOMER_TOKEN');
      }
    });

    const fresh = await this.loadAppointmentForToken(appointmentId);
    return this.buildCustomerView(fresh);
  }

  /**
   * Customer cancels via the link. Delegates to the shared customer
   * cancellation service (branch policy, cancellation window, refund policy,
   * audit) and lets it reconcile reminders/follow-ups. Blocked while pending.
   */
  async cancelAppointment(token: string, reason?: string) {
    const { appointmentId } = await appointmentActionTokenService.resolve(token);
    const appointment = await this.loadAppointmentForToken(appointmentId);

    this.assertCustomerActionAllowed(appointment, 'cancel');

    await customerAppointmentService.cancelAppointment(
      appointment.businessId,
      appointment.customerId,
      appointmentId,
      reason || 'Customer cancelled via link'
    );

    const fresh = await this.loadAppointmentForToken(appointmentId);
    return this.buildCustomerView(fresh);
  }

  /**
   * Customer reschedules via the link. Delegates to the shared rescheduling
   * service (availability/conflict/business-rule validation) which reconciles
   * reminders and extends the action link. Blocked while pending.
   */
  async rescheduleAppointment(token: string, newStartTime: string) {
    const { appointmentId } = await appointmentActionTokenService.resolve(token);
    const appointment = await this.loadAppointmentForToken(appointmentId);

    this.assertCustomerActionAllowed(appointment, 'reschedule');

    await customerAppointmentService.rescheduleCustomerAppointment(
      appointment.businessId,
      appointment.customerId,
      appointmentId,
      new Date(newStartTime),
      'Customer rescheduled via link'
    );

    const fresh = await this.loadAppointmentForToken(appointmentId);
    return this.buildCustomerView(fresh);
  }

  /**
   * A pending appointment's link is strictly view-only. A terminal appointment
   * cannot be acted on either.
   */
  private assertCustomerActionAllowed(appointment: any, action: 'confirm' | 'cancel' | 'reschedule') {
    if (appointment.status === AppointmentStatus.PENDING) {
      throw new ApiError(
        409,
        'This appointment is awaiting confirmation, so this link is view-only.',
        ErrorCodes.CONFLICT
      );
    }
    if (TERMINAL_STATUSES.includes(appointment.status)) {
      throw new ApiError(
        400,
        `This appointment can no longer be changed because it is ${appointment.status}.`,
        ErrorCodes.VALIDATION_ERROR
      );
    }
    if (action === 'confirm' && !CUSTOMER_ACTIONABLE_STATUSES.includes(appointment.status)) {
      throw new ApiError(
        400,
        `This appointment cannot be acknowledged in its current state.`,
        ErrorCodes.VALIDATION_ERROR
      );
    }
  }

  private async loadAppointmentForToken(appointmentId: string) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        branch: { select: { name: true, address: true, timezone: true, bookingConfig: true } },
        business: { select: { name: true } },
        service: { select: { name: true, durationMinutes: true } },
        staff: { include: { staff: { select: { firstName: true } } } },
      },
    });

    if (!appointment) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);
    }
    return appointment;
  }

  /**
   * Customer-safe payload: no internal ids, no payment details, no customer
   * phone, no business contact numbers.
   */
  private buildCustomerView(appointment: any) {
    const bookingConfig = appointment.branch?.bookingConfig;
    const isPending = appointment.status === AppointmentStatus.PENDING;
    const isTerminal = TERMINAL_STATUSES.includes(appointment.status);

    const canConfirm =
      !isPending &&
      !isTerminal &&
      CUSTOMER_ACTIONABLE_STATUSES.includes(appointment.status) &&
      appointment.confirmationStatus !== CustomerConfirmationStatus.CONFIRMED;

    const canCancel =
      !isPending && !isTerminal && (bookingConfig?.customerCancellationEnabled ?? true);

    const canReschedule =
      !isPending && !isTerminal && (bookingConfig?.reschedulingEnabled ?? false);

    return {
      scheduledStart: appointment.scheduledStart,
      scheduledEnd: appointment.scheduledEnd,
      status: appointment.status,
      confirmationStatus: appointment.confirmationStatus,
      customerConfirmedAt: appointment.customerConfirmedAt,
      totalAmount: appointment.totalAmount,
      notes: appointment.notes ?? null,
      businessName: appointment.business?.name ?? null,
      branch: appointment.branch
        ? {
            name: appointment.branch.name,
            address: appointment.branch.address,
            timezone: appointment.branch.timezone,
          }
        : null,
      service: appointment.service
        ? { name: appointment.service.name, durationMinutes: appointment.service.durationMinutes }
        : null,
      staffName: appointment.staff?.[0]?.staff?.firstName ?? 'Assigned Staff',
      actions: {
        viewOnly: isPending || isTerminal,
        canConfirm,
        canCancel,
        canReschedule,
      },
    };
  }
}

export const customerConfirmationService = new CustomerConfirmationService();
