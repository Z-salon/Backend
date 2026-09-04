import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';
import { auditLogService } from '../../business/services/audit-log.service';
import { StaffStatus, Prisma } from '@prisma/client';

const SYSTEM_ROLES = ['OWNER', 'ADMIN'];
const BRANCH_MANAGER_ROLE = 'BRANCH_MANAGER';

export interface CreateStaffInput {
  branchId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  title?: string;
  bio?: string;
}

export interface UpdateStaffInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  title?: string;
  bio?: string;
  status?: StaffStatus;
}

export class StaffService {
  async getMembershipAndUserRoles(businessId: string, userId: string) {
    const membership = await prisma.businessMember.findFirst({
      where: { businessId, userId, status: 'ACTIVE' },
      include: {
        userRoles: {
          include: {
            role: true,
            branches: { select: { branchId: true } },
          },
        },
      },
    });

    if (!membership) {
      throw new ApiError(403, 'Not a member of this business', ErrorCodes.NOT_BUSINESS_MEMBER);
    }

    const roleSystemKeys = membership.userRoles
      .map((ur) => ur.role.systemKey)
      .filter((key): key is string => Boolean(key));

    const isOwnerOrAdmin = roleSystemKeys.some((key) => SYSTEM_ROLES.includes(key));
    const isBranchManager = roleSystemKeys.some((key) => key === BRANCH_MANAGER_ROLE);

    const allowedBranchIds = new Set(
      membership.userRoles
        .filter((ur) => ur.scopeType === 'BRANCH')
        .flatMap((ur) => ur.branches.map((b) => b.branchId))
    );

    return { membership, isOwnerOrAdmin, isBranchManager, allowedBranchIds };
  }

  private async verifyOwnerOrAdmin(businessId: string, userId: string) {
    const auth = await this.getMembershipAndUserRoles(businessId, userId);
    if (!auth.isOwnerOrAdmin) {
      throw new ApiError(403, 'Only business owner or admin can perform this action', ErrorCodes.INSUFFICIENT_PERMISSIONS);
    }
    return auth;
  }

  async createStaff(businessId: string, userId: string, data: CreateStaffInput) {
    await this.verifyOwnerOrAdmin(businessId, userId);

    const branch = await prisma.branch.findFirst({
      where: { id: data.branchId, businessId },
    });

    if (!branch) {
      throw ApiError.badRequest('Branch not found in this business', ErrorCodes.BRANCH_NOT_IN_BUSINESS);
    }

    if (!branch.isActive) {
      throw ApiError.badRequest('Cannot create staff in an inactive branch', ErrorCodes.BAD_REQUEST);
    }

    return prisma.$transaction(async (tx) => {
      const newStaff = await tx.staff.create({
        data: {
          businessId,
          branchId: data.branchId,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
          title: data.title,
          bio: data.bio,
          status: 'ACTIVE',
        },
      });

      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: 'STAFF_CREATED',
        entityType: 'Staff',
        entityId: newStaff.id,
        newValues: {
          branchId: newStaff.branchId,
          firstName: newStaff.firstName,
          lastName: newStaff.lastName,
          status: newStaff.status,
        },
      }, tx);

      return newStaff;
    });
  }

  async getBusinessStaff(businessId: string, userId: string, options?: { branchId?: string; status?: StaffStatus }) {
    const auth = await this.getMembershipAndUserRoles(businessId, userId);

    const where: Prisma.StaffWhereInput = { businessId };

    if (options?.branchId) {
      // Branch managers can only see staff in their authorized branches
      if (!auth.isOwnerOrAdmin && !auth.allowedBranchIds.has(options.branchId)) {
        throw ApiError.forbidden('Cannot access staff in this branch', ErrorCodes.FORBIDDEN);
      }
      where.branchId = options.branchId;
    } else if (!auth.isOwnerOrAdmin && auth.isBranchManager) {
      // Branch manager sees staff only in their allowed branches
      where.branchId = { in: Array.from(auth.allowedBranchIds) };
    }

    if (options?.status) {
      where.status = options.status;
    }

    return prisma.staff.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        branch: { select: { id: true, name: true, isActive: true } },
      },
    });
  }

  async getStaffById(businessId: string, staffId: string): Promise<NonNullable<Awaited<ReturnType<typeof prisma.staff.findFirst>>>> {
    const staff = await prisma.staff.findFirst({
      where: { id: staffId, businessId },
    });

    if (!staff) {
      throw ApiError.notFound('Staff not found', ErrorCodes.NOT_FOUND);
    }

    return staff;
  }

  async getStaffDetails(businessId: string, staffId: string, userId: string) {
    const auth = await this.getMembershipAndUserRoles(businessId, userId);

    const staff = await prisma.staff.findFirst({
      where: { id: staffId, businessId },
      include: {
        branch: { select: { id: true, name: true, isActive: true } },
        categoryQualifications: {
          where: { isActive: true },
          include: { category: { select: { id: true, name: true, status: true } } },
        },
        serviceQualifications: {
          where: { isActive: true },
          include: { service: { select: { id: true, name: true, status: true } } },
        },
      },
    });

    if (!staff) {
      throw ApiError.notFound('Staff not found', ErrorCodes.NOT_FOUND);
    }

    // Branch manager scope check
    if (!auth.isOwnerOrAdmin && auth.isBranchManager && !auth.allowedBranchIds.has(staff.branchId)) {
      throw ApiError.forbidden('Cannot access staff outside authorized branch scope', ErrorCodes.FORBIDDEN);
    }

    return staff;
  }

  async updateStaff(businessId: string, staffId: string, userId: string, data: UpdateStaffInput) {
    const auth = await this.getMembershipAndUserRoles(businessId, userId);

    const existingStaff = await this.getStaffById(businessId, staffId);

    // Branch manager scope check
    if (!auth.isOwnerOrAdmin && auth.isBranchManager && !auth.allowedBranchIds.has(existingStaff.branchId)) {
      throw ApiError.forbidden('Cannot update staff outside authorized branch scope', ErrorCodes.FORBIDDEN);
    }

    return prisma.$transaction(async (tx) => {
      const updatedStaff = await tx.staff.update({
        where: { id: staffId },
        data,
      });

      let action = 'STAFF_UPDATED';
      if (data.status && data.status !== existingStaff.status) {
        action = `STAFF_${data.status}`; // STAFF_ACTIVE or STAFF_INACTIVE
      }

      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action,
        entityType: 'Staff',
        entityId: staffId,
        oldValues: {
          firstName: existingStaff.firstName,
          lastName: existingStaff.lastName,
          status: existingStaff.status,
        },
        newValues: {
          firstName: updatedStaff.firstName,
          lastName: updatedStaff.lastName,
          status: updatedStaff.status,
        },
      }, tx);

      return updatedStaff;
    });
  }

  async moveStaffBranch(businessId: string, staffId: string, userId: string, newBranchId: string) {
    // Only owners/admins can move staff
    await this.verifyOwnerOrAdmin(businessId, userId);

    const existingStaff = await this.getStaffById(businessId, staffId);

    if (existingStaff.branchId === newBranchId) {
      return existingStaff;
    }

    const newBranch = await prisma.branch.findFirst({
      where: { id: newBranchId, businessId },
    });

    if (!newBranch) {
      throw ApiError.badRequest('Target branch not found in this business', ErrorCodes.BRANCH_NOT_IN_BUSINESS);
    }

    if (!newBranch.isActive) {
      throw ApiError.badRequest('Cannot move staff to an inactive branch', ErrorCodes.BAD_REQUEST);
    }

    return prisma.$transaction(async (tx) => {
      const updatedStaff = await tx.staff.update({
        where: { id: staffId },
        data: { branchId: newBranchId },
      });

      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: 'STAFF_BRANCH_CHANGED',
        entityType: 'Staff',
        entityId: staffId,
        oldValues: { branchId: existingStaff.branchId },
        newValues: { branchId: newBranchId },
      }, tx);

      return updatedStaff;
    });
  }
}

export const staffService = new StaffService();
