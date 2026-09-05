import { Prisma } from '@prisma/client';
import { prisma } from '../../../libs/prisma';
import { normalizePhone } from '../../../utils/phone';
import { ApiError } from '../../../utils/api-error';

export class CustomerMatchingService {
  /**
   * Matches a customer by phone number within a business.
   * Returns the full customer record if found, otherwise null.
   * Also matches archived customers — the phone still belongs to a historical record.
   */
  async matchCustomerByPhone(businessId: string, phone: string) {
    const normalizedPhone = normalizePhone(phone);

    const customerPhone = await prisma.customerPhone.findUnique({
      where: {
        businessId_normalizedPhone: { businessId, normalizedPhone },
      },
      include: {
        customer: { include: { phones: true } },
      },
    });

    return customerPhone ? customerPhone.customer : null;
  }

  /**
   * Reusable find-or-create logic.
   * Transaction-safe against duplicate creation races via unique constraint on [businessId, normalizedPhone].
   */
  async findOrCreateCustomer(
    businessId: string,
    phone: string,
    customerData: { firstName: string; lastName: string; createdById: string }
  ) {
    const normalizedPhone = normalizePhone(phone);

    // 1. Try finding first
    const existing = await this.matchCustomerByPhone(businessId, phone);
    if (existing) {
      return existing;
    }

    // 2. Attempt creation — handle unique constraint race condition gracefully
    try {
      return await prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({
          data: {
            businessId,
            firstName: customerData.firstName,
            lastName: customerData.lastName,
            createdById: customerData.createdById,
            status: 'ACTIVE',
            phones: {
              create: { businessId, phone, normalizedPhone, isPrimary: true },
            },
          },
          include: { phones: true },
        });
        return customer;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Race condition — another request created the customer first
        const racedCustomer = await this.matchCustomerByPhone(businessId, phone);
        if (!racedCustomer) {
          throw ApiError.internal('Failed to retrieve customer after unique constraint violation');
        }
        return racedCustomer;
      }
      throw error;
    }
  }
}

export const customerMatchingService = new CustomerMatchingService();
