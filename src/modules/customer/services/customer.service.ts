import { Prisma, CustomerStatus } from '@prisma/client';
import { prisma } from '../../../libs/prisma';
import { ApiError } from '../../../utils/api-error';
import { normalizePhone } from '../../../utils/phone';
import { auditLogService } from '../../business/services/audit-log.service';
import { customerMatchingService } from './customer-matching.service';

export class CustomerService {
  /**
   * Resolves business membership and roles for access control.
   * Requires the user to be an active member with OWNER, ADMIN, BRANCH_MANAGER, or RECEPTIONIST role.
   */
  async getMembershipAndUserRoles(businessId: string, userId: string) {
    const member = await prisma.businessMember.findUnique({
      where: { businessId_userId: { businessId, userId } },
      include: {
        userRoles: {
          include: { role: true, branches: true },
        },
      },
    });

    if (!member || member.status !== 'ACTIVE') {
      throw ApiError.forbidden('Unauthorized access to this business');
    }

    const isOwnerOrAdmin = member.userRoles.some(
      (ur) => ur.role.systemKey === 'OWNER' || ur.role.systemKey === 'ADMIN'
    );
    const isBranchManager = member.userRoles.some((ur) => ur.role.systemKey === 'BRANCH_MANAGER');
    const isReceptionist = member.userRoles.some((ur) => ur.role.systemKey === 'RECEPTIONIST');

    if (!isOwnerOrAdmin && !isBranchManager && !isReceptionist) {
      throw ApiError.forbidden('Insufficient permissions to manage customers');
    }

    return { member, isOwnerOrAdmin, isBranchManager, isReceptionist };
  }

  async createCustomer(
    businessId: string,
    userId: string,
    data: {
      firstName: string;
      lastName: string;
      phones?: { phone: string; isPrimary?: boolean }[];
    }
  ) {
    await this.getMembershipAndUserRoles(businessId, userId);

    const hasPhones = data.phones && data.phones.length > 0;
    const status: CustomerStatus = hasPhones ? 'ACTIVE' : 'PENDING_DETAILS';

    const phonesToCreate: { businessId: string; phone: string; normalizedPhone: string; isPrimary: boolean }[] = [];
    if (hasPhones) {
      let primarySet = false;
      for (const p of data.phones!) {
        const normalizedPhone = normalizePhone(p.phone);
        const isPrimary = p.isPrimary === true ? true : !primarySet;
        if (isPrimary) primarySet = true;
        phonesToCreate.push({ businessId, phone: p.phone, normalizedPhone, isPrimary });
      }

      const uniqueNormalized = new Set(phonesToCreate.map((p) => p.normalizedPhone));
      if (uniqueNormalized.size !== phonesToCreate.length) {
        throw ApiError.badRequest('Duplicate phone numbers in request');
      }
    }

    return prisma.$transaction(async (tx) => {
      if (phonesToCreate.length > 0) {
        const existingPhones = await tx.customerPhone.findMany({
          where: {
            businessId,
            normalizedPhone: { in: phonesToCreate.map((p) => p.normalizedPhone) },
          },
        });

        if (existingPhones.length > 0) {
          throw ApiError.conflict('One or more phone numbers already exist in this business');
        }
      }

      const customer = await tx.customer.create({
        data: {
          businessId,
          firstName: data.firstName,
          lastName: data.lastName,
          status,
          createdById: userId,
          phones: {
            create: phonesToCreate.map((p) => ({
              businessId: p.businessId,
              phone: p.phone,
              normalizedPhone: p.normalizedPhone,
              isPrimary: p.isPrimary,
            })),
          },
        },
        include: { phones: true },
      });

      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: 'CUSTOMER_CREATED',
        entityType: 'CUSTOMER',
        entityId: customer.id,
        newValues: { firstName: customer.firstName, lastName: customer.lastName, status: customer.status },
      });

      return customer;
    });
  }

  async getCustomers(
    businessId: string,
    userId: string,
    query: { q?: string; phone?: string; status?: CustomerStatus; page: number; limit: number }
  ) {
    await this.getMembershipAndUserRoles(businessId, userId);

    const where: Prisma.CustomerWhereInput = {
      businessId,
      // Hide archived by default unless explicitly requested
      status: query.status ? query.status : { not: 'ARCHIVED' },
    };

    if (query.q) {
      where.OR = [
        { firstName: { contains: query.q, mode: 'insensitive' } },
        { lastName: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    if (query.phone) {
      try {
        const normalizedPhone = normalizePhone(query.phone);
        where.phones = { some: { normalizedPhone } };
      } catch {
        // Invalid phone in search — return empty
        return { data: [], meta: { total: 0, page: query.page, limit: query.limit, totalPages: 0 } };
      }
    }

    const skip = (query.page - 1) * query.limit;

    const [total, customers] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: { phones: true },
      }),
    ]);

    return {
      data: customers,
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    };
  }

  async getCustomerDetails(businessId: string, customerId: string, userId: string) {
    await this.getMembershipAndUserRoles(businessId, userId);

    const customer = await prisma.customer.findUnique({
      where: { id: customerId, businessId },
      include: { phones: true },
    });

    if (!customer) {
      throw ApiError.notFound('Customer not found');
    }

    return customer;
  }

  async updateCustomer(
    businessId: string,
    customerId: string,
    userId: string,
    data: { firstName?: string; lastName?: string }
  ) {
    await this.getMembershipAndUserRoles(businessId, userId);
    const customer = await this.getCustomerDetails(businessId, customerId, userId);

    return prisma.$transaction(async (tx) => {
      const result = await tx.customer.update({
        where: { id: customer.id },
        data,
        include: { phones: true },
      });

      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: 'CUSTOMER_UPDATED',
        entityType: 'CUSTOMER',
        entityId: result.id,
        oldValues: { firstName: customer.firstName, lastName: customer.lastName },
        newValues: { firstName: result.firstName, lastName: result.lastName },
      });

      return result;
    });
  }

  async addCustomerPhone(
    businessId: string,
    customerId: string,
    userId: string,
    data: { phone: string; isPrimary: boolean }
  ) {
    await this.getMembershipAndUserRoles(businessId, userId);
    const customer = await this.getCustomerDetails(businessId, customerId, userId);
    const normalizedPhone = normalizePhone(data.phone);

    return prisma.$transaction(async (tx) => {
      const existing = await tx.customerPhone.findUnique({
        where: { businessId_normalizedPhone: { businessId, normalizedPhone } },
      });

      if (existing) {
        throw ApiError.conflict('Phone number already exists in this business');
      }

      if (data.isPrimary) {
        await tx.customerPhone.updateMany({
          where: { customerId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      // Make primary if it's the first phone or explicitly requested
      const isFirstPhone = customer.phones.length === 0;
      const isPrimary = data.isPrimary || isFirstPhone;

      const newPhone = await tx.customerPhone.create({
        data: { businessId, customerId, phone: data.phone, normalizedPhone, isPrimary },
      });

      // Upgrade PENDING_DETAILS → ACTIVE when a phone is added
      if (customer.status === 'PENDING_DETAILS') {
        await tx.customer.update({ where: { id: customerId }, data: { status: 'ACTIVE' } });
      }

      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: 'CUSTOMER_PHONE_ADDED',
        entityType: 'CUSTOMER_PHONE',
        entityId: newPhone.id,
        newValues: { phone: newPhone.phone, isPrimary: newPhone.isPrimary },
      });

      return newPhone;
    });
  }

  async setPrimaryPhone(businessId: string, customerId: string, phoneId: string, userId: string) {
    await this.getMembershipAndUserRoles(businessId, userId);
    const customer = await this.getCustomerDetails(businessId, customerId, userId);
    const phone = customer.phones.find((p) => p.id === phoneId);

    if (!phone) {
      throw ApiError.notFound('Phone not found for this customer');
    }

    if (phone.isPrimary) {
      return phone; // already primary — idempotent
    }

    return prisma.$transaction(async (tx) => {
      await tx.customerPhone.updateMany({ where: { customerId, isPrimary: true }, data: { isPrimary: false } });
      const updated = await tx.customerPhone.update({ where: { id: phoneId }, data: { isPrimary: true } });

      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: 'CUSTOMER_PRIMARY_PHONE_CHANGED',
        entityType: 'CUSTOMER',
        entityId: customerId,
        newValues: { primaryPhoneId: phoneId },
      });

      return updated;
    });
  }

  async deleteCustomerPhone(businessId: string, customerId: string, phoneId: string, userId: string) {
    await this.getMembershipAndUserRoles(businessId, userId);
    const customer = await this.getCustomerDetails(businessId, customerId, userId);
    const phone = customer.phones.find((p) => p.id === phoneId);

    if (!phone) {
      throw ApiError.notFound('Phone not found for this customer');
    }

    return prisma.$transaction(async (tx) => {
      await tx.customerPhone.delete({ where: { id: phoneId } });

      // If primary was removed and others remain, promote the first remaining
      const remainingPhones = await tx.customerPhone.findMany({ where: { customerId } });
      if (phone.isPrimary && remainingPhones.length > 0) {
        await tx.customerPhone.update({ where: { id: remainingPhones[0].id }, data: { isPrimary: true } });
      }

      // If no phones left and customer was ACTIVE, downgrade to PENDING_DETAILS
      if (remainingPhones.length === 0 && customer.status === 'ACTIVE') {
        await tx.customer.update({ where: { id: customerId }, data: { status: 'PENDING_DETAILS' } });
      }

      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: 'CUSTOMER_PHONE_REMOVED',
        entityType: 'CUSTOMER_PHONE',
        entityId: phoneId,
        oldValues: { phone: phone.phone },
      });

      return { success: true };
    });
  }

  async archiveCustomer(businessId: string, customerId: string, userId: string) {
    await this.getMembershipAndUserRoles(businessId, userId);
    const customer = await this.getCustomerDetails(businessId, customerId, userId);

    if (customer.status === 'ARCHIVED') {
      return customer; // idempotent
    }

    return prisma.$transaction(async (tx) => {
      const result = await tx.customer.update({
        where: { id: customerId },
        data: { status: 'ARCHIVED' },
        include: { phones: true },
      });

      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: 'CUSTOMER_ARCHIVED',
        entityType: 'CUSTOMER',
        entityId: customerId,
      });

      return result;
    });
  }
}

export const customerService = new CustomerService();
