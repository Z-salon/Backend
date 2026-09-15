import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';
import { normalizePhone } from '../../../utils/phone';
import { auditLogService } from '../../business/services/audit-log.service';

export interface BranchPhoneCreateInput {
  phoneNumber: string;
  label?: string;
  isPrimary?: boolean;
}

export interface BranchPhoneUpdateInput {
  phoneNumber?: string | null;
  label?: string | null;
  isPrimary?: boolean;
  isActive?: boolean;
}

export interface BranchPhoneResponse {
  id: string;
  branchId: string;
  phoneNumber: string;
  label: string | null;
  isPrimary: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class BranchPhoneService {
  private async verifyBranchAccess(businessId: string, userId: string, branchId: string) {
    const membership = await prisma.businessMember.findFirst({
      where: { businessId, userId, status: 'ACTIVE' },
      include: {
        userRoles: { include: { role: true, branches: true } },
      },
    });

    if (!membership) {
      throw new ApiError(403, 'Not a member of this business', ErrorCodes.NOT_BUSINESS_MEMBER);
    }

    const roleSystemKeys = membership.userRoles
      .map(ur => ur.role.systemKey)
      .filter((key): key is string => Boolean(key));

    const hasBusinessScope = roleSystemKeys.some(key => ['OWNER', 'ADMIN'].includes(key));

    if (hasBusinessScope) return;

    const allowedBranchIds = new Set(
      membership.userRoles
        .filter(ur => ur.scopeType === 'BRANCH')
        .flatMap(ur => ur.branches.map(b => b.branchId))
    );

    if (!allowedBranchIds.has(branchId)) {
      throw new ApiError(403, 'Access denied to this branch', ErrorCodes.FORBIDDEN);
    }
  }

  async createBranchPhone(
    businessId: string,
    userId: string,
    branchId: string,
    input: {
      phoneNumber: string;
      label?: string;
      isPrimary?: boolean;
    }
  ): Promise<{ id: string; branchId: string; phoneNumber: string; label: string | null; isPrimary: boolean; isActive: boolean; createdAt: Date; updatedAt: Date }> {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch || branch.businessId !== businessId) {
      throw new ApiError(404, 'Branch not found in this business', ErrorCodes.BRANCH_NOT_IN_BUSINESS);
    }

    if (!branch.isActive) {
      throw new ApiError(400, 'Branch is not active', ErrorCodes.BAD_REQUEST);
    }

    await this.verifyBranchAccess(businessId, userId, branchId);

    const normalizedPhone = normalizePhone(input.phoneNumber);

    // Check for duplicate phone number in the same branch
    const existingPhone = await prisma.branchPhone.findUnique({
      where: { branchId_phoneNumber: { branchId, phoneNumber: normalizedPhone } },
    });

    if (existingPhone) {
      throw new ApiError(409, 'Phone number already exists for this branch', ErrorCodes.CONFLICT);
    }

    // If setting as primary, unset any existing primary
    if (input.isPrimary) {
      await prisma.branchPhone.updateMany({
        where: { branchId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const phone = await prisma.$transaction(async (tx) => {
      const phone = await tx.branchPhone.create({
        data: {
          branchId,
          phoneNumber: normalizedPhone,
          label: input.label,
          isPrimary: input.isPrimary ?? false,
          isActive: true,
        },
      });

      await auditLogService.createAuditLog(
        {
          businessId,
          actorId: userId,
          action: 'BRANCH_PHONE_CREATED',
          entityType: 'BranchPhone',
          entityId: phone.id,
          newValues: { phoneNumber: normalizedPhone, label: input.label, isPrimary: input.isPrimary },
        },
        tx
      );

      return phone;
    });

    return phone;
  }

  async getBranchPhones(branchId: string, userId: string): Promise<any[]> {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new ApiError(404, 'Branch not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyBranchAccess(branch.businessId, userId, branchId);

    const phones = await prisma.branchPhone.findMany({
      where: { branchId },
      orderBy: { isPrimary: 'desc' },
    });

    return phones;
  }

  async updateBranchPhone(
    branchId: string,
    userId: string,
    phoneId: string,
    input: {
      phoneNumber?: string | null;
      label?: string | null;
      isPrimary?: boolean;
      isActive?: boolean;
    }
  ): Promise<any> {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      include: { business: true },
    });

    if (!branch) {
      throw new ApiError(404, 'Branch not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyBranchAccess(branch.businessId, userId, branchId);

    const phone = await prisma.branchPhone.findUnique({
      where: { id: phoneId, branchId },
    });

    if (!phone) {
      throw new ApiError(404, 'Phone number not found', ErrorCodes.NOT_FOUND);
    }

    const changes: Record<string, any> = {};
    const oldValues: Record<string, any> = {};

    if (input.phoneNumber !== undefined) {
      const newPhoneNumber = input.phoneNumber ? normalizePhone(input.phoneNumber) : null;
      if (newPhoneNumber !== phone.phoneNumber) {
        if (newPhoneNumber) {
          const existing = await prisma.branchPhone.findUnique({
            where: { branchId_phoneNumber: { branchId, phoneNumber: newPhoneNumber } },
          });
          if (existing && existing.id !== phoneId) {
            throw new ApiError(409, 'Phone number already exists for this branch', ErrorCodes.CONFLICT);
          }
        }
        changes.phoneNumber = newPhoneNumber;
        oldValues.phoneNumber = phone.phoneNumber;
      }

      if (input.label !== undefined && input.label !== phone.label) {
        changes.label = input.label;
        oldValues.label = phone.label;
      }

      if (input.isPrimary !== undefined && input.isPrimary !== phone.isPrimary) {
        if (input.isPrimary) {
          // Unset current primary
          await prisma.branchPhone.updateMany({
            where: { branchId, isPrimary: true },
            data: { isPrimary: false },
          });
        }
        changes.isPrimary = input.isPrimary;
        oldValues.isPrimary = phone.isPrimary;
      }

      if (input.isActive !== undefined && input.isActive !== phone.isActive) {
        changes.isActive = input.isActive;
        oldValues.isActive = phone.isActive;
      }

      if (Object.keys(changes).length === 0) {
        const phoneData = await prisma.branchPhone.findUnique({ where: { id: phoneId } });
        return phoneData;
      }

      const updated = await prisma.$transaction(async (tx) => {
        const updated = await tx.branchPhone.update({
          where: { id: phoneId },
          data: changes,
        });

        const newValues: Record<string, any> = {};
        for (const field of Object.keys(changes)) {
          newValues[field] = changes[field];
        }

        await auditLogService.createAuditLog(
          {
            businessId: branch.businessId,
            actorId: userId,
            action: 'BRANCH_PHONE_UPDATED',
            entityType: 'BranchPhone',
            entityId: phoneId,
            oldValues,
            newValues,
          },
          tx
        );

        return updated;
      });

      return updated;
    }
  }

  async setPrimaryPhone(branchId: string, userId: string, phoneId: string): Promise<any> {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new ApiError(404, 'Branch not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyBranchAccess(branch.businessId, userId, branchId);

    const phone = await prisma.branchPhone.findUnique({
      where: { id: phoneId, branchId },
    });

    if (!phone) {
      throw new ApiError(404, 'Phone number not found', ErrorCodes.NOT_FOUND);
    }

    if (phone.isPrimary) {
      return phone;
    }

    await prisma.$transaction(async (tx) => {
      await tx.branchPhone.updateMany({
        where: { branchId, isPrimary: true },
        data: { isPrimary: false },
      });

      await tx.branchPhone.update({
        where: { id: phoneId },
        data: { isPrimary: true },
      });

      await auditLogService.createAuditLog(
        {
          businessId: branch.businessId,
          actorId: userId,
          action: 'BRANCH_PHONE_PRIMARY_CHANGED',
          entityType: 'BranchPhone',
          entityId: phoneId,
          newValues: { phoneId, isPrimary: true },
        },
        tx
      );
    });

    return prisma.branchPhone.findUnique({ where: { id: phoneId } });
  }

  async removeBranchPhone(branchId: string, userId: string, phoneId: string): Promise<{ success: boolean }> {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new ApiError(404, 'Branch not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyBranchAccess(branch.businessId, userId, branchId);

    const phone = await prisma.branchPhone.findUnique({
      where: { id: phoneId, branchId },
    });

    if (!phone) {
      throw new ApiError(404, 'Phone number not found', ErrorCodes.NOT_FOUND);
    }

    await prisma.$transaction(async (tx) => {
      await tx.branchPhone.delete({
        where: { id: phoneId },
      });

      await auditLogService.createAuditLog(
        {
          businessId: branch.businessId,
          actorId: userId,
          action: 'BRANCH_PHONE_DELETED',
          entityType: 'BranchPhone',
          entityId: phoneId,
          oldValues: { phoneNumber: phone.phoneNumber, label: phone.label, isPrimary: phone.isPrimary },
        },
        tx
      );
    });

    return { success: true };
  }

  private mapToResponse(phone: any) {
    return {
      id: phone.id,
      branchId: phone.branchId,
      phoneNumber: phone.phoneNumber,
      label: phone.label,
      isPrimary: phone.isPrimary,
      isActive: phone.isActive,
      createdAt: phone.createdAt,
      updatedAt: phone.updatedAt,
    };
  }
}

export const branchPhoneService = new BranchPhoneService();