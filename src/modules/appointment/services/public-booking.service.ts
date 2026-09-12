import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';
import { normalizePhone } from '../../../utils/phone';
import { otpService } from '../../auth/services/otp.service';
import { appointmentMatchingService } from './appointment-matching.service';
import { appointmentService } from './appointment.service';
import { paymentReceiptService } from '../../payment/services/payment-receipt.service';
import { BookingSource } from '@prisma/client';

export class PublicBookingService {
  /**
   * Public ONLINE booking: OTP verified phone → find/create customer → revalidate slot → create appointment.
   * Does not require a User account.
   */
  async createPublicBooking(
    businessId: string,
    input: {
      verificationToken: string;
      firstName: string;
      lastName: string;
      phone: string;
      branchId: string;
      serviceId: string;
      staffId: string;
      scheduledStart: Date;
      notes?: string;
    }
  ) {
    const verified = await otpService.consumeVerificationToken(input.verificationToken, 'PHONE_VERIFICATION');
    const normalizedPhone = normalizePhone(input.phone);

    if (verified.phone !== normalizedPhone) {
      throw new ApiError(400, 'Verified phone does not match booking phone', ErrorCodes.OTP_INVALID);
    }

    const { customerId } = await appointmentMatchingService.findOrCreateCustomer(businessId, null, {
      firstName: input.firstName,
      lastName: input.lastName,
      phone: normalizedPhone,
    });

    return appointmentService.createAppointment(
      {
        businessId,
        branchId: input.branchId,
        customerId,
        serviceId: input.serviceId,
        staffId: input.staffId,
        scheduledStart: input.scheduledStart,
        notes: input.notes,
        bookingSource: BookingSource.ONLINE,
        createdById: undefined,
      },
      null
    );
  }

  /**
   * Public receipt submission for a PENDING online appointment, authenticated by OTP token + matching phone.
   */
  async submitPublicReceipt(
    businessId: string,
    appointmentId: string,
    input: {
      paymentMethodId: string;
      submittedAmount?: number;
      receiptImageUrl: string;
      customerNote?: string;
    }
  ) {
    

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { customer: { include: { phones: true } } },
    });

    if (!appointment || appointment.businessId !== businessId) {
      throw new ApiError(404, 'Appointment not found', ErrorCodes.NOT_FOUND);
    }



    return paymentReceiptService.submitReceipt(appointmentId, appointment.customerId, {
      paymentMethodId: input.paymentMethodId,
      submittedAmount: input.submittedAmount,
      receiptImageUrl: input.receiptImageUrl,
      customerNote: input.customerNote,
    });
  }
}

export const publicBookingService = new PublicBookingService();
