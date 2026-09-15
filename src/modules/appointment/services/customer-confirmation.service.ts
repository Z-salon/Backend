import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';
import { verifyCustomerActionToken, generateCustomerActionToken } from '../../../libs/jwt';
import { CustomerConfirmationStatus } from '@prisma/client';
import { customerAppointmentService } from '../../customer/services/customer-appointment.service';
import {
  sendConfirmationRequestSms,
  buildConfirmationUrl,
} from '../../auth/sms/sms.service';
import { config } from '../../../config/env';

export class CustomerConfirmationService {

  /**
   * Generate a customer action token for a given appointment and (optionally) send SMS.
   * Called when creating an appointment with customerConfirmationEnabled=true.
   */
  async sendConfirmationRequest(appointmentId: string): Promise<string> {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        customer: { include: { phones: { where: { isPrimary: true }, take: 1 } } },
        branch: { select: { bookingConfig: true } },
      }
    });

    if (!appointment) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);
    }

    const branchConfig = appointment.branch.bookingConfig;
    // Token lifetime: expires confirmationDeadlineHours before appointment
    const deadlineHours = branchConfig?.confirmationDeadlineHours ?? 2;
    const expiryMs = appointment.scheduledStart.getTime() - (deadlineHours * 60 * 60 * 1000);
    const nowMs = Date.now();
    const ttlSeconds = Math.max(Math.floor((expiryMs - nowMs) / 1000), 3600); // at least 1h
    const expiresIn = `${ttlSeconds}s`;

    const token = generateCustomerActionToken(appointmentId, expiresIn);
    const confirmationUrl = buildConfirmationUrl(config.frontendUrl, token);

    const primaryPhone = appointment.customer.phones[0]?.phone;
    if (primaryPhone) {
      await sendConfirmationRequestSms(primaryPhone, confirmationUrl, appointment.scheduledStart).catch(() => {
        // Swallow SMS errors to not affect appointment creation
      });
    }

    return token;
  }

  /**
   * Validates a customer action token and returns safe appointment details
   */
  async getAppointmentFromToken(token: string) {
    const payload = verifyCustomerActionToken(token);
    const appointmentId = payload.sub;

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        business: { select: { id: true, name: true, phone: true } },
        branch: { select: { id: true, name: true, address: true, timezone: true } },
        service: { select: { id: true, name: true, durationMinutes: true, price: true } },
        staff: { include: { staff: { select: { id: true, firstName: true } } } },
      }
    });

    if (!appointment) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);
    }

    return {
      id: appointment.id,
      scheduledStart: appointment.scheduledStart,
      scheduledEnd: appointment.scheduledEnd,
      status: appointment.status,
      confirmationStatus: appointment.confirmationStatus,
      totalAmount: appointment.totalAmount,
      business: appointment.business,
      branch: appointment.branch,
      service: appointment.service,
      staffName: appointment.staff[0]?.staff?.firstName || 'Assigned Staff',
    };
  }

  /**
   * Customer confirms their appointment via token (idempotent)
   */
  async confirmAppointment(token: string) {
    const payload = verifyCustomerActionToken(token);
    const appointmentId = payload.sub;

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);
    }

    if (['CANCELLED', 'NO_SHOW', 'COMPLETED', 'EXPIRED'].includes(appointment.status)) {
      throw new ApiError(400, `Cannot confirm an appointment that is ${appointment.status}`, ErrorCodes.VALIDATION_ERROR);
    }

    if (appointment.confirmationStatus === CustomerConfirmationStatus.CONFIRMED) {
      return appointment; // Idempotent
    }

    const updated = await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        confirmationStatus: CustomerConfirmationStatus.CONFIRMED,
        customerConfirmedAt: new Date(),
        confirmationMethod: 'CUSTOMER_TOKEN',
      }
    });

    return updated;
  }

  /**
   * Customer cancels their appointment via token
   */
  async cancelAppointment(token: string, reason?: string) {
    const payload = verifyCustomerActionToken(token);
    const appointmentId = payload.sub;

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);
    }

    // Delegates to the shared customer cancellation path, which emails/SMSes the
    // customer once (no duplicate notification here).
    return customerAppointmentService.cancelAppointment(
      appointment.businessId,
      appointment.customerId,
      appointmentId,
      reason || 'Customer cancelled via link'
    );
  }

  /**
   * Customer reschedules their appointment via token
   */
  async rescheduleAppointment(token: string, newStartTime: string) {
    const payload = verifyCustomerActionToken(token);
    const appointmentId = payload.sub;

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);
    }

    return await customerAppointmentService.rescheduleCustomerAppointment(
      appointment.businessId,
      appointment.customerId,
      appointmentId,
      new Date(newStartTime),
      'Customer rescheduled via link'
    );
  }
}

export const customerConfirmationService = new CustomerConfirmationService();
