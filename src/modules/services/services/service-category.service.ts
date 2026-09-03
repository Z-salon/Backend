import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';
import { auditLogService } from '../../business/services/audit-log.service';
import { ServiceCategoryStatus } from '@prisma/client';

const SYSTEM_ROLES = ['OWNER', 'ADMIN'];
const BRANCH_MANAGER_ROLE = 'BRANCH_MANAGER';

export interface CreateServiceCategoryInput {
  name: string;
  description?: string;
  branchIds: string[];
}

export interface UpdateServiceCategoryInput {
  name?: string;
  description?: string | null;
  status?: ServiceCategoryStatus;
}

export class ServiceCategoryService {
  private async getMembershipAndUserRoles(businessId: string, userId: string) {
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

    return {
      membership,
      isOwnerOrAdmin,
      isBranchManager,
      allowedBranchIds,
    };
  }

  private async verifyOwnerOrAdmin(businessId: string, userId: string) {
    const auth = await this.getMembershipAndUserRoles(businessId, userId);
    if (!auth.isOwnerOrAdmin) {
      throw new ApiError(403, 'Only business owner or admin can perform this action', ErrorCodes.INSUFFICIENT_PERMISSIONS);
    }
    return auth;
  }

  async createCategory(businessId: string, userId: string, input: CreateServiceCategoryInput) {
    await this.verifyOwnerOrAdmin(businessId, userId);

    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business || business.status !== 'ACTIVE') {
      throw new ApiError(403, 'Business is not active or found', ErrorCodes.BUSINESS_NOT_FOUND);
    }

    const existing = await prisma.serviceCategory.findFirst({
      where: { businessId, name: input.name },
    });

    if (existing) {
      throw new ApiError(409, 'Category with this name already exists in this business', ErrorCodes.CONFLICT);
    }

    // Validate all branchIds
    const branches = await prisma.branch.findMany({
      where: {
        id: { in: input.branchIds },
        businessId,
      },
    });

    if (branches.length !== input.branchIds.length) {
      throw new ApiError(400, 'One or more branches do not belong to this business', ErrorCodes.BRANCH_NOT_IN_BUSINESS);
    }

    const inactiveBranch = branches.find((b) => !b.isActive);
    if (inactiveBranch) {
      throw new ApiError(400, `Branch '${inactiveBranch.name}' is inactive`, ErrorCodes.BAD_REQUEST);
    }

    return prisma.$transaction(async (tx) => {
      const category = await tx.serviceCategory.create({
        data: {
          businessId,
          name: input.name,
          description: input.description,
          status: 'ACTIVE',
        },
      });

      await tx.serviceCategoryBranchAssignment.createMany({
        data: input.branchIds.map((branchId) => ({
          categoryId: category.id,
          branchId,
          isActive: true,
        })),
      });

      await auditLogService.createAuditLog(
        {
          businessId,
          actorId: userId,
          action: 'SERVICE_CATEGORY_CREATED',
          entityType: 'ServiceCategory',
          entityId: category.id,
          newValues: {
            name: category.name,
            description: category.description,
            branchIds: input.branchIds,
          },
        },
        tx
      );

      return tx.serviceCategory.findUnique({
        where: { id: category.id },
        include: {
          branchAssignments: {
            include: {
              branch: {
                select: { id: true, name: true, isActive: true },
              },
            },
          },
        },
      });
    });
  }

  async getCategories(
    businessId: string,
    userId: string,
    query?: { branchId?: string; status?: ServiceCategoryStatus; includeInactive?: boolean }
  ) {
    const auth = await this.getMembershipAndUserRoles(businessId, userId);

    const where: any = { businessId };

    if (query?.status) {
      where.status = query.status;
    } else if (!query?.includeInactive && !auth.isOwnerOrAdmin) {
      where.status = 'ACTIVE';
    }

    if (!auth.isOwnerOrAdmin) {
      // Branch Manager scope filtering
      const branchIdsToFilter = query?.branchId
        ? Array.from(auth.allowedBranchIds).filter((b) => b === query.branchId)
        : Array.from(auth.allowedBranchIds);

      where.branchAssignments = {
        some: {
          branchId: { in: branchIdsToFilter },
          isActive: true,
        },
      };
    } else if (query?.branchId) {
      where.branchAssignments = {
        some: {
          branchId: query.branchId,
        },
      };
    }

    return prisma.serviceCategory.findMany({
      where,
      include: {
        branchAssignments: {
          include: {
            branch: {
              select: { id: true, name: true, isActive: true },
            },
          },
        },
        services: {
          select: {
            id: true,
            name: true,
            durationMinutes: true,
            price: true,
            status: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getCategoryById(categoryId: string, userId: string) {
    const category = await prisma.serviceCategory.findUnique({
      where: { id: categoryId },
      include: {
        branchAssignments: {
          include: {
            branch: {
              select: { id: true, name: true, isActive: true },
            },
          },
        },
        services: true,
      },
    });

    if (!category) {
      throw new ApiError(404, 'Service category not found', ErrorCodes.NOT_FOUND);
    }

    const auth = await this.getMembershipAndUserRoles(category.businessId, userId);

    if (!auth.isOwnerOrAdmin) {
      const isAvailableInManagerBranch = category.branchAssignments.some(
        (ba) => ba.isActive && auth.allowedBranchIds.has(ba.branchId)
      );

      if (!isAvailableInManagerBranch) {
        throw new ApiError(403, 'Access denied to this category', ErrorCodes.FORBIDDEN);
      }
    }

    return category;
  }

  async updateCategory(categoryId: string, userId: string, input: UpdateServiceCategoryInput) {
    const category = await prisma.serviceCategory.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new ApiError(404, 'Service category not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyOwnerOrAdmin(category.businessId, userId);

    if (input.name && input.name !== category.name) {
      const existing = await prisma.serviceCategory.findFirst({
        where: {
          businessId: category.businessId,
          name: input.name,
          id: { not: categoryId },
        },
      });

      if (existing) {
        throw new ApiError(409, 'Category with this name already exists in this business', ErrorCodes.CONFLICT);
      }
    }

    const updated = await prisma.serviceCategory.update({
      where: { id: categoryId },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      include: {
        branchAssignments: {
          include: {
            branch: {
              select: { id: true, name: true, isActive: true },
            },
          },
        },
      },
    });

    const action =
      input.status === 'INACTIVE' ? 'SERVICE_CATEGORY_DEACTIVATED' : 'SERVICE_CATEGORY_UPDATED';

    await auditLogService.createAuditLog({
      businessId: category.businessId,
      actorId: userId,
      action,
      entityType: 'ServiceCategory',
      entityId: category.id,
      oldValues: { name: category.name, description: category.description, status: category.status },
      newValues: { name: updated.name, description: updated.description, status: updated.status },
    });

    return updated;
  }

  async addCategoryToBranch(categoryId: string, userId: string, branchId: string) {
    const category = await prisma.serviceCategory.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new ApiError(404, 'Service category not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyOwnerOrAdmin(category.businessId, userId);

    const branch = await prisma.branch.findFirst({
      where: { id: branchId, businessId: category.businessId },
    });

    if (!branch) {
      throw new ApiError(400, 'Branch not found or does not belong to this business', ErrorCodes.BRANCH_NOT_IN_BUSINESS);
    }

    if (!branch.isActive) {
      throw new ApiError(400, 'Branch is not active', ErrorCodes.BAD_REQUEST);
    }

    const existingAssignment = await prisma.serviceCategoryBranchAssignment.findUnique({
      where: {
        categoryId_branchId: { categoryId, branchId },
      },
    });

    if (existingAssignment && existingAssignment.isActive) {
      throw new ApiError(409, 'Category is already assigned and active at this branch', ErrorCodes.CONFLICT);
    }

    const assignment = await prisma.serviceCategoryBranchAssignment.upsert({
      where: {
        categoryId_branchId: { categoryId, branchId },
      },
      create: {
        categoryId,
        branchId,
        isActive: true,
      },
      update: {
        isActive: true,
      },
      include: {
        branch: { select: { id: true, name: true, isActive: true } },
      },
    });

    await auditLogService.createAuditLog({
      businessId: category.businessId,
      actorId: userId,
      action: 'SERVICE_CATEGORY_BRANCH_ACTIVATED',
      entityType: 'ServiceCategoryBranchAssignment',
      entityId: assignment.id,
      newValues: { categoryId, branchId, isActive: true },
    });

    return assignment;
  }

  async getCategoryBranches(categoryId: string, userId: string) {
    const category = await prisma.serviceCategory.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new ApiError(404, 'Service category not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyOwnerOrAdmin(category.businessId, userId);

    return prisma.serviceCategoryBranchAssignment.findMany({
      where: { categoryId },
      include: {
        branch: { select: { id: true, name: true, isActive: true } },
      },
    });
  }

  async updateCategoryBranchAssignment(
    categoryId: string,
    branchId: string,
    userId: string,
    isActive: boolean
  ) {
    const category = await prisma.serviceCategory.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new ApiError(404, 'Service category not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyOwnerOrAdmin(category.businessId, userId);

    const assignment = await prisma.serviceCategoryBranchAssignment.findUnique({
      where: { categoryId_branchId: { categoryId, branchId } },
    });

    if (!assignment) {
      throw new ApiError(404, 'Category branch assignment not found', ErrorCodes.NOT_FOUND);
    }

    const updated = await prisma.serviceCategoryBranchAssignment.update({
      where: { id: assignment.id },
      data: { isActive },
      include: {
        branch: { select: { id: true, name: true, isActive: true } },
      },
    });

    const action = isActive
      ? 'SERVICE_CATEGORY_BRANCH_ACTIVATED'
      : 'SERVICE_CATEGORY_BRANCH_DEACTIVATED';

    await auditLogService.createAuditLog({
      businessId: category.businessId,
      actorId: userId,
      action,
      entityType: 'ServiceCategoryBranchAssignment',
      entityId: updated.id,
      oldValues: { isActive: assignment.isActive },
      newValues: { isActive: updated.isActive },
    });

    return updated;
  }
}

export const serviceCategoryService = new ServiceCategoryService();
