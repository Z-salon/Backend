import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';
import { auditLogService } from '../../business/services/audit-log.service';
import { EmployeeAssignmentMode, DepositPolicyType, ServiceStatus, Prisma } from '@prisma/client';

const SYSTEM_ROLES = ['OWNER', 'ADMIN'];
const BRANCH_MANAGER_ROLE = 'BRANCH_MANAGER';

export interface CreateServiceInput {
  categoryId: string;
  name: string;
  description?: string;
  durationMinutes: number;
  price: string | number;
  employeeAssignmentMode: EmployeeAssignmentMode;
  showPriceToCustomer?: boolean;
  depositPolicyType?: DepositPolicyType;
  depositAmount?: string | number | null;
  branchIds: string[];
}

export interface UpdateServiceInput {
  categoryId?: string;
  name?: string;
  description?: string | null;
  durationMinutes?: number;
  price?: string | number;
  employeeAssignmentMode?: EmployeeAssignmentMode;
  showPriceToCustomer?: boolean;
  depositPolicyType?: DepositPolicyType;
  depositAmount?: string | number | null;
  status?: ServiceStatus;
}

export class ServiceService {
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

  private validateDepositPolicy(
    policyType: DepositPolicyType,
    depositAmount: string | number | Prisma.Decimal | null | undefined,
    price: number
  ) {
    const amountNum = depositAmount !== null && depositAmount !== undefined ? Number(depositAmount.toString()) : null;

    if (policyType === 'NONE' || policyType === 'FULL') {
      if (amountNum !== null && amountNum !== 0) {
        throw new ApiError(
          400,
          `depositAmount must be null or omitted when depositPolicyType is ${policyType}`,
          ErrorCodes.VALIDATION_ERROR
        );
      }
      return null;
    }

    if (policyType === 'FIXED') {
      if (amountNum === null || isNaN(amountNum) || amountNum <= 0) {
        throw new ApiError(400, 'depositAmount is required and must be > 0 for FIXED deposit policy', ErrorCodes.VALIDATION_ERROR);
      }
      if (amountNum > price) {
        throw new ApiError(400, 'depositAmount cannot exceed service price for FIXED deposit policy', ErrorCodes.VALIDATION_ERROR);
      }
      return new Prisma.Decimal(amountNum);
    }

    if (policyType === 'PERCENTAGE') {
      if (amountNum === null || isNaN(amountNum) || amountNum <= 0 || amountNum > 100) {
        throw new ApiError(
          400,
          'depositAmount is required and must be > 0 and <= 100 for PERCENTAGE deposit policy',
          ErrorCodes.VALIDATION_ERROR
        );
      }
      return new Prisma.Decimal(amountNum);
    }

    return null;
  }

  async createService(businessId: string, userId: string, input: CreateServiceInput) {
    await this.verifyOwnerOrAdmin(businessId, userId);

    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business || business.status !== 'ACTIVE') {
      throw new ApiError(403, 'Business is not active or found', ErrorCodes.BUSINESS_NOT_FOUND);
    }

    // Category validation
    const category = await prisma.serviceCategory.findUnique({
      where: { id: input.categoryId },
    });

    if (!category || category.businessId !== businessId) {
      throw new ApiError(400, 'Category not found or does not belong to this business', ErrorCodes.VALIDATION_ERROR);
    }

    if (category.status !== 'ACTIVE') {
      throw new ApiError(400, 'Category must be ACTIVE to create a service under it', ErrorCodes.VALIDATION_ERROR);
    }

    // Branch validation
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

    // Category active at selected branches check
    const categoryAssignments = await prisma.serviceCategoryBranchAssignment.findMany({
      where: {
        categoryId: input.categoryId,
        branchId: { in: input.branchIds },
        isActive: true,
      },
    });

    if (categoryAssignments.length !== input.branchIds.length) {
      throw new ApiError(
        400,
        'Category is not active at one or more of the selected branches',
        ErrorCodes.VALIDATION_ERROR
      );
    }

    // Numeric validations
    const priceNum = Number(input.price);
    if (isNaN(priceNum) || priceNum < 0) {
      throw new ApiError(400, 'price must be >= 0', ErrorCodes.VALIDATION_ERROR);
    }

    if (input.durationMinutes <= 0) {
      throw new ApiError(400, 'durationMinutes must be > 0', ErrorCodes.VALIDATION_ERROR);
    }

    const depositPolicy = input.depositPolicyType || DepositPolicyType.NONE;
    const validatedDepositAmount = this.validateDepositPolicy(depositPolicy, input.depositAmount, priceNum);

    return prisma.$transaction(async (tx) => {
      const service = await tx.service.create({
        data: {
          businessId,
          categoryId: input.categoryId,
          name: input.name,
          description: input.description,
          durationMinutes: input.durationMinutes,
          price: new Prisma.Decimal(priceNum),
          employeeAssignmentMode: input.employeeAssignmentMode,
          showPriceToCustomer: input.showPriceToCustomer ?? true,
          depositPolicyType: depositPolicy,
          depositAmount: validatedDepositAmount,
          status: 'ACTIVE',
        },
      });

      await tx.serviceBranchAssignment.createMany({
        data: input.branchIds.map((branchId) => ({
          serviceId: service.id,
          branchId,
          isActive: true,
        })),
      });

      await auditLogService.createAuditLog(
        {
          businessId,
          actorId: userId,
          action: 'SERVICE_CREATED',
          entityType: 'Service',
          entityId: service.id,
          newValues: {
            name: service.name,
            categoryId: service.categoryId,
            price: priceNum,
            durationMinutes: service.durationMinutes,
            branchIds: input.branchIds,
          },
        },
        tx
      );

      return tx.service.findUnique({
        where: { id: service.id },
        include: {
          category: { select: { id: true, name: true, status: true } },
          branchAssignments: {
            include: {
              branch: { select: { id: true, name: true, isActive: true } },
            },
          },
        },
      });
    });
  }

  async getServices(
    businessId: string,
    userId: string,
    query?: { branchId?: string; categoryId?: string; status?: ServiceStatus }
  ) {
    const auth = await this.getMembershipAndUserRoles(businessId, userId);

    const where: any = { businessId };

    if (query?.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query?.status) {
      where.status = query.status;
    }

    if (!auth.isOwnerOrAdmin) {
      // Branch Manager role filter
      const allowedBranchIdsArr = Array.from(auth.allowedBranchIds);
      const branchIdsToFilter = query?.branchId
        ? allowedBranchIdsArr.filter((id) => id === query.branchId)
        : allowedBranchIdsArr;

      where.status = 'ACTIVE';
      where.branchAssignments = {
        some: {
          branchId: { in: branchIdsToFilter },
          isActive: true,
        },
      };
      where.category = {
        branchAssignments: {
          some: {
            branchId: { in: branchIdsToFilter },
            isActive: true,
          },
        },
      };
    } else if (query?.branchId) {
      where.branchAssignments = {
        some: {
          branchId: query.branchId,
        },
      };
    }

    return prisma.service.findMany({
      where,
      include: {
        category: {
          select: { id: true, name: true, status: true },
        },
        branchAssignments: {
          include: {
            branch: { select: { id: true, name: true, isActive: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getServiceById(serviceId: string, userId: string) {
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      include: {
        category: {
          select: { id: true, name: true, status: true, businessId: true },
        },
        branchAssignments: {
          include: {
            branch: { select: { id: true, name: true, isActive: true } },
          },
        },
      },
    });

    if (!service) {
      throw new ApiError(404, 'Service not found', ErrorCodes.NOT_FOUND);
    }

    const auth = await this.getMembershipAndUserRoles(service.businessId, userId);

    if (!auth.isOwnerOrAdmin) {
      const isAvailableInBranch = service.branchAssignments.some(
        (ba) => ba.isActive && auth.allowedBranchIds.has(ba.branchId)
      );

      if (!isAvailableInBranch) {
        throw new ApiError(403, 'Access denied to this service', ErrorCodes.FORBIDDEN);
      }
    }

    return service;
  }

  async updateService(serviceId: string, userId: string, input: UpdateServiceInput) {
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      include: {
        branchAssignments: { where: { isActive: true } },
      },
    });

    if (!service) {
      throw new ApiError(404, 'Service not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyOwnerOrAdmin(service.businessId, userId);

    const priceNum = input.price !== undefined ? Number(input.price) : Number(service.price);
    if (isNaN(priceNum) || priceNum < 0) {
      throw new ApiError(400, 'price must be >= 0', ErrorCodes.VALIDATION_ERROR);
    }

    if (input.durationMinutes !== undefined && input.durationMinutes <= 0) {
      throw new ApiError(400, 'durationMinutes must be > 0', ErrorCodes.VALIDATION_ERROR);
    }

    let newCategoryId = service.categoryId;

    if (input.categoryId && input.categoryId !== service.categoryId) {
      const newCategory = await prisma.serviceCategory.findUnique({
        where: { id: input.categoryId },
      });

      if (!newCategory || newCategory.businessId !== service.businessId) {
        throw new ApiError(400, 'New category not found or belongs to a different business', ErrorCodes.VALIDATION_ERROR);
      }

      if (newCategory.status !== 'ACTIVE') {
        throw new ApiError(400, 'New category is not ACTIVE', ErrorCodes.VALIDATION_ERROR);
      }

      // Safe category change check: all active service branch assignments must have active category branch assignments for new category
      const activeBranchIds = service.branchAssignments.map((ba) => ba.branchId);

      if (activeBranchIds.length > 0) {
        const newCategoryBranchAssignments = await prisma.serviceCategoryBranchAssignment.findMany({
          where: {
            categoryId: input.categoryId,
            branchId: { in: activeBranchIds },
            isActive: true,
          },
        });

        if (newCategoryBranchAssignments.length !== activeBranchIds.length) {
          throw new ApiError(
            400,
            'Cannot change category: current active service branch assignments are not all active in the new category',
            ErrorCodes.VALIDATION_ERROR
          );
        }
      }

      newCategoryId = input.categoryId;
    }

    const depositPolicy = input.depositPolicyType ?? service.depositPolicyType;
    const depositAmountInput = input.depositAmount !== undefined ? input.depositAmount : service.depositAmount;
    const validatedDepositAmount = this.validateDepositPolicy(depositPolicy, depositAmountInput, priceNum);

    const updated = await prisma.service.update({
      where: { id: serviceId },
      data: {
        categoryId: newCategoryId,
        ...(input.name ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
        ...(input.price !== undefined ? { price: new Prisma.Decimal(priceNum) } : {}),
        ...(input.employeeAssignmentMode ? { employeeAssignmentMode: input.employeeAssignmentMode } : {}),
        ...(input.showPriceToCustomer !== undefined ? { showPriceToCustomer: input.showPriceToCustomer } : {}),
        depositPolicyType: depositPolicy,
        depositAmount: validatedDepositAmount,
        ...(input.status ? { status: input.status } : {}),
      },
      include: {
        category: { select: { id: true, name: true, status: true } },
        branchAssignments: {
          include: {
            branch: { select: { id: true, name: true, isActive: true } },
          },
        },
      },
    });

    const action = input.status === 'INACTIVE' ? 'SERVICE_DEACTIVATED' : 'SERVICE_UPDATED';

    await auditLogService.createAuditLog({
      businessId: service.businessId,
      actorId: userId,
      action,
      entityType: 'Service',
      entityId: service.id,
      oldValues: {
        name: service.name,
        price: service.price,
        durationMinutes: service.durationMinutes,
        status: service.status,
      },
      newValues: {
        name: updated.name,
        price: updated.price,
        durationMinutes: updated.durationMinutes,
        status: updated.status,
      },
    });

    return updated;
  }

  async addServiceToBranch(serviceId: string, userId: string, branchId: string) {
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      include: { category: true },
    });

    if (!service) {
      throw new ApiError(404, 'Service not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyOwnerOrAdmin(service.businessId, userId);

    const branch = await prisma.branch.findFirst({
      where: { id: branchId, businessId: service.businessId },
    });

    if (!branch) {
      throw new ApiError(400, 'Branch not found or belongs to a different business', ErrorCodes.BRANCH_NOT_IN_BUSINESS);
    }

    if (!branch.isActive) {
      throw new ApiError(400, 'Branch is not active', ErrorCodes.BAD_REQUEST);
    }

    // Verify service category is assigned and active at branch
    const categoryAssignment = await prisma.serviceCategoryBranchAssignment.findUnique({
      where: { categoryId_branchId: { categoryId: service.categoryId, branchId } },
    });

    if (!categoryAssignment || !categoryAssignment.isActive) {
      throw new ApiError(
        400,
        'Service category is not assigned and active at this branch',
        ErrorCodes.VALIDATION_ERROR
      );
    }

    const existingAssignment = await prisma.serviceBranchAssignment.findUnique({
      where: { serviceId_branchId: { serviceId, branchId } },
    });

    if (existingAssignment && existingAssignment.isActive) {
      throw new ApiError(409, 'Service is already assigned and active at this branch', ErrorCodes.CONFLICT);
    }

    const assignment = await prisma.serviceBranchAssignment.upsert({
      where: { serviceId_branchId: { serviceId, branchId } },
      create: { serviceId, branchId, isActive: true },
      update: { isActive: true },
      include: {
        branch: { select: { id: true, name: true, isActive: true } },
      },
    });

    await auditLogService.createAuditLog({
      businessId: service.businessId,
      actorId: userId,
      action: 'SERVICE_BRANCH_ACTIVATED',
      entityType: 'ServiceBranchAssignment',
      entityId: assignment.id,
      newValues: { serviceId, branchId, isActive: true },
    });

    return assignment;
  }

  async getServiceBranches(serviceId: string, userId: string) {
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
    });

    if (!service) {
      throw new ApiError(404, 'Service not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyOwnerOrAdmin(service.businessId, userId);

    return prisma.serviceBranchAssignment.findMany({
      where: { serviceId },
      include: {
        branch: { select: { id: true, name: true, isActive: true } },
      },
    });
  }

  async updateServiceBranchAssignment(
    serviceId: string,
    branchId: string,
    userId: string,
    isActive: boolean
  ) {
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      include: { category: true },
    });

    if (!service) {
      throw new ApiError(404, 'Service not found', ErrorCodes.NOT_FOUND);
    }

    await this.verifyOwnerOrAdmin(service.businessId, userId);

    const assignment = await prisma.serviceBranchAssignment.findUnique({
      where: { serviceId_branchId: { serviceId, branchId } },
    });

    if (!assignment) {
      throw new ApiError(404, 'Service branch assignment not found', ErrorCodes.NOT_FOUND);
    }

    if (isActive) {
      // Validate conditions for activation:
      // 1. Branch active
      // 2. Category status == ACTIVE
      // 3. CategoryBranchAssignment isActive == true
      // 4. Service status == ACTIVE
      const branch = await prisma.branch.findUnique({ where: { id: branchId } });
      if (!branch || !branch.isActive) {
        throw new ApiError(400, 'Branch is not active', ErrorCodes.VALIDATION_ERROR);
      }

      if (service.status !== 'ACTIVE') {
        throw new ApiError(400, 'Service is INACTIVE and cannot be activated at a branch', ErrorCodes.VALIDATION_ERROR);
      }

      if (service.category.status !== 'ACTIVE') {
        throw new ApiError(400, 'Service Category is INACTIVE', ErrorCodes.VALIDATION_ERROR);
      }

      const catBranch = await prisma.serviceCategoryBranchAssignment.findUnique({
        where: { categoryId_branchId: { categoryId: service.categoryId, branchId } },
      });

      if (!catBranch || !catBranch.isActive) {
        throw new ApiError(400, 'Category is not assigned and active at this branch', ErrorCodes.VALIDATION_ERROR);
      }
    }

    const updated = await prisma.serviceBranchAssignment.update({
      where: { id: assignment.id },
      data: { isActive },
      include: {
        branch: { select: { id: true, name: true, isActive: true } },
      },
    });

    const action = isActive ? 'SERVICE_BRANCH_ACTIVATED' : 'SERVICE_BRANCH_DEACTIVATED';

    await auditLogService.createAuditLog({
      businessId: service.businessId,
      actorId: userId,
      action,
      entityType: 'ServiceBranchAssignment',
      entityId: updated.id,
      oldValues: { isActive: assignment.isActive },
      newValues: { isActive: updated.isActive },
    });

    return updated;
  }
}

export const serviceService = new ServiceService();
