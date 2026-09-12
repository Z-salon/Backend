import { prisma } from '../../../libs/prisma';
import { ApiError } from '../../../utils/api-error';

export class PaymentMethodService {
  async createPaymentMethod(businessId: string, actorId: string, data: {
    name: string;
    type: string;
    accountName?: string;
    accountNumber?: string;
    instructions?: string;
    isActive?: boolean;
    displayOrder?: number;
  }) {
    // Validate business membership
    const member = await prisma.businessMember.findUnique({
      where: { businessId_userId: { businessId, userId: actorId } },
      include: { userRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });

    if (!member || member.status !== 'ACTIVE') {
      throw ApiError.forbidden('User is not an active member of this business');
    }

    const hasPermission = member.userRoles.some(ur =>
      ur.role.systemKey === 'OWNER'
      // || ur.role.permissions.some(p => p.permission.code === 'MANAGE_BUSINESS_SETTINGS')
    );

    if (!hasPermission) {
      throw ApiError.forbidden('Insufficient permissions to manage payment methods');
    }

    return prisma.paymentMethod.create({
      data: {
        businessId,
        ...data,
      },
    });
  }

  async getPaymentMethods(businessId: string, onlyActive: boolean = false) {
    const where: any = { businessId };
    if (onlyActive) {
      where.isActive = true;
    }

    return prisma.paymentMethod.findMany({
      where,
      orderBy: { displayOrder: 'asc' },
    });
  }

  async updatePaymentMethod(businessId: string, methodId: string, actorId: string, data: any) {
    const member = await prisma.businessMember.findUnique({
      where: { businessId_userId: { businessId, userId: actorId } },
      include: { userRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });

    if (!member || member.status !== 'ACTIVE') {
      throw ApiError.forbidden('User is not an active member of this business');
    }

    const hasPermission = member.userRoles.some(ur =>
      ur.role.systemKey === 'OWNER'
      // || ur.role.permissions.some(p => p.permission.code === 'MANAGE_BUSINESS_SETTINGS')
    );

    if (!hasPermission) {
      throw ApiError.forbidden('Insufficient permissions to manage payment methods');
    }

    const method = await prisma.paymentMethod.findUnique({ where: { id: methodId } });
    if (!method || method.businessId !== businessId) {
      throw ApiError.notFound('Payment method not found');
    }

    return prisma.paymentMethod.update({
      where: { id: methodId },
      data,
    });
  }

  async deletePaymentMethod(businessId: string, methodId: string, actorId: string) {
    const member = await prisma.businessMember.findUnique({
      where: { businessId_userId: { businessId, userId: actorId } },
      include: { userRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });

    if (!member || member.status !== 'ACTIVE') {
      throw ApiError.forbidden('User is not an active member of this business');
    }

    const hasPermission = member.userRoles.some(ur =>
      ur.role.systemKey === 'OWNER'
      // || 
      // ur.role.permissions.some(p => p.permission.code === 'MANAGE_BUSINESS_SETTINGS')
    );

    if (!hasPermission) {
      throw ApiError.forbidden('Insufficient permissions to manage payment methods');
    }

    const method = await prisma.paymentMethod.findUnique({ where: { id: methodId } });
    if (!method || method.businessId !== businessId) {
      throw ApiError.notFound('Payment method not found');
    }

    // Check if it's used in any receipts
    const receiptCount = await prisma.paymentReceipt.count({ where: { paymentMethodId: methodId } });
    if (receiptCount > 0) {
      throw ApiError.badRequest('Cannot delete a payment method that has been used. Please deactivate it instead.');
    }

    await prisma.paymentMethod.delete({ where: { id: methodId } });
    return { success: true };
  }
}

export const paymentMethodService = new PaymentMethodService();
