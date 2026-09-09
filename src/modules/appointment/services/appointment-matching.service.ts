import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';
import { normalizePhone } from '../../../utils/phone';
import { customerService } from '../../customer/services/customer.service';

export class AppointmentMatchingService {
  /**
   * Matches an existing customer by phone number.
   * Used for walk-in and phone bookings where customer may not have an account yet.
   */
  async matchCustomerByPhone(businessId: string, phone: string): Promise<{
    matched: boolean;
    customerId?: string;
    customer?: { id: string; firstName: string; lastName: string; status: string };
  }> {
    const normalizedPhone = normalizePhone(phone);

    const existingPhone = await prisma.customerPhone.findUnique({
      where: { businessId_normalizedPhone: { businessId, normalizedPhone } },
      include: { customer: true },
    });

    if (existingPhone) {
      return {
        matched: true,
        customerId: existingPhone.customer.id,
        customer: {
          id: existingPhone.customer.id,
          firstName: existingPhone.customer.firstName,
          lastName: existingPhone.customer.lastName,
          status: existingPhone.customer.status,
        },
      };
    }

    return { matched: false };
  }

  /**
   * Finds an existing customer by phone or creates a new one.
   * This is the core "find or create" logic used by walk-in, phone, and online booking.
   * Uses database-level uniqueness constraints to prevent race conditions.
   */
  async findOrCreateCustomer(
    businessId: string,
    actorId: string,
    data: {
      firstName: string;
      lastName: string;
      phone: string;
    }
  ): Promise<{ customerId: string; isNew: boolean }> {
    const normalizedPhone = normalizePhone(data.phone);

    // Try to find existing customer with this phone
    const existingPhone = await prisma.customerPhone.findUnique({
      where: { businessId_normalizedPhone: { businessId, normalizedPhone } },
      include: { customer: true },
    });

    if (existingPhone) {
      return { customerId: existingPhone.customer.id, isNew: false };
    }

    // Customer doesn't exist - create new one
    try {
      const customer = await prisma.customer.create({
        data: {
          businessId,
          firstName: data.firstName,
          lastName: data.lastName,
          status: 'ACTIVE',
          createdById: actorId,
          phones: {
            create: {
              businessId,
              phone: data.phone,
              normalizedPhone,
              isPrimary: true,
            },
          },
        },
      });

      return { customerId: customer.id, isNew: true };
    } catch (error: any) {
      // Handle race condition: another request created the customer between our check and create
      if (error.code === 'P2002' && error.meta?.target?.includes('businessId_normalizedPhone')) {
        const existingPhone = await prisma.customerPhone.findUnique({
          where: { businessId_normalizedPhone: { businessId, normalizedPhone } },
          include: { customer: true },
        });
        if (existingPhone) {
          return { customerId: existingPhone.customer.id, isNew: false };
        }
      }
      throw error;
    }
  }

  /**
   * Matches a customer by phone and verifies they belong to the business.
   * Returns customer if found and active, null otherwise.
   */
  async matchAndVerifyCustomer(businessId: string, phone: string) {
    const normalizedPhone = normalizePhone(phone);

    const existingPhone = await prisma.customerPhone.findUnique({
      where: { businessId_normalizedPhone: { businessId, normalizedPhone } },
      include: {
        customer: {
          include: { phones: true },
        },
      },
    });

    if (!existingPhone) {
      return null;
    }

    // Only return active customers
    if (existingPhone.customer.status === 'ARCHIVED') {
      return null;
    }

    return existingPhone.customer;
  }
}

export const appointmentMatchingService = new AppointmentMatchingService();