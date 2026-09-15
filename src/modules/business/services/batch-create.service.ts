import { prisma } from '../../../libs/prisma';
import { Prisma } from '@prisma/client';
import { ApiError, ErrorCodes } from '../../../utils/api-error';
import { normalizePhone } from '../../../utils/phone';
import { auditLogService } from './audit-log.service';

export interface BranchBatchCreateInput {
  items: Array<{
    name: string;
    address: string;
    timezone?: string;
  }>;
}

export interface ServiceBatchCreateInput {
  items: Array<{
    categoryId: string;
    name: string;
    description?: string;
    durationMinutes: number;
    price: number;
    employeeAssignmentMode: 'CUSTOMER_CHOOSES' | 'SALON_ASSIGNS' | 'ANY_AVAILABLE';
    showPriceToCustomer?: boolean;
    depositPolicyType: 'NONE' | 'FIXED' | 'PERCENTAGE' | 'FULL';
    depositAmount?: number | null;
    branchIds: string[];
  }>;
}

export interface StaffBatchCreateInput {
  items: Array<{
    branchId: string;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    title?: string;
    bio?: string;
    serviceIds?: string[];
    categoryIds?: string[];
  }>;
}

export interface PaymentMethodBatchCreateInput {
  items: Array<{
    name: string;
    type: string;
    accountName?: string;
    accountNumber?: string;
    instructions?: string;
    isActive?: boolean;
    displayOrder?: number;
  }>;
}

/** Maximum number of items allowed in a single batch request. */
const MAX_BATCH_SIZE = 50;

export class BatchCreateService {
  /**
   * Batch create branches
   */
  async createBranches(
    businessId: string,
    userId: string,
    input: BranchBatchCreateInput
  ) {
    const membership = await this.verifyOwnerOrAdmin(businessId, userId);
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw new ApiError(404, 'Business not found', ErrorCodes.BUSINESS_NOT_FOUND);
    if (business.status !== 'ACTIVE') throw new ApiError(403, 'Business is not active', ErrorCodes.BUSINESS_SUSPENDED);

    // Validate batch size
    if (input.items.length > MAX_BATCH_SIZE) {
      throw new ApiError(400, `Batch size cannot exceed ${MAX_BATCH_SIZE} items`, ErrorCodes.VALIDATION_ERROR);
    }

    // Validate all items first
    const branchNames = new Set<string>();
    for (const item of input.items) {
      if (!item.name || item.name.trim().length === 0) {
        throw new ApiError(400, 'Branch name is required', ErrorCodes.VALIDATION_ERROR);
      }
      if (branchNames.has(item.name)) {
        throw new ApiError(400, `Duplicate branch name: ${item.name}`, ErrorCodes.CONFLICT);
      }
      branchNames.add(item.name);
    }

    // Check for existing branch names
    const existingBranches = await prisma.branch.findMany({
      where: { businessId, name: { in: Array.from(branchNames) } },
      select: { name: true },
    });
    if (existingBranches.length > 0) {
      const existingNames = existingBranches.map(b => b.name).join(', ');
      throw new ApiError(409, `Branch name(s) already exist: ${existingNames}`, ErrorCodes.CONFLICT);
    }

    // Validate timezones
    for (const item of input.items) {
      if (item.timezone) {
        try {
          Intl.DateTimeFormat(undefined, { timeZone: item.timezone });
        } catch {
          throw new ApiError(400, `Invalid timezone: ${item.timezone}`, ErrorCodes.VALIDATION_ERROR);
        }
      }
    }

    const branches = await prisma.$transaction(async (tx) => {
      const created = await tx.branch.createMany({
        data: input.items.map(item => ({
          businessId,
          name: item.name,
          address: item.address,
          timezone: item.timezone || business.timezone,
          isActive: true,
        })),
        skipDuplicates: false,
      });

      // Get created branches to create booking configs
      const createdBranches = await tx.branch.findMany({
        where: { businessId, name: { in: Array.from(branchNames) } },
        select: { id: true, name: true, address: true, timezone: true, isActive: true, createdAt: true, updatedAt: true },
      });

      await tx.branchBookingConfig.createMany({
        data: createdBranches.map(b => ({ branchId: b.id })),
        skipDuplicates: true,
      });

      // Audit log
      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: 'BRANCHES_BATCH_CREATED',
        entityType: 'Branch',
        newValues: { items: input.items },
      }, tx);

      return createdBranches;
    });

    return branches;
  }

  /**
   * Batch create services
   */
  async createServices(
    businessId: string,
    userId: string,
    input: ServiceBatchCreateInput
  ) {
    const membership = await this.verifyOwnerOrAdmin(businessId, userId);
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw new ApiError(404, 'Business not found', ErrorCodes.BUSINESS_NOT_FOUND);

    // Validate batch size
    if (input.items.length > MAX_BATCH_SIZE) {
      throw new ApiError(400, `Batch size cannot exceed ${MAX_BATCH_SIZE} items`, ErrorCodes.VALIDATION_ERROR);
    }

    // Validate all items first
    const serviceNames = new Set<string>();
    const allBranchIds = new Set<string>();
    const allCategoryIds = new Set<string>();

    for (const item of input.items) {
      if (serviceNames.has(item.name)) {
        throw new ApiError(400, `Duplicate service name: ${item.name}`, ErrorCodes.CONFLICT);
      }
      serviceNames.add(item.name);
      item.branchIds.forEach(b => allBranchIds.add(b));
      allCategoryIds.add(item.categoryId);
    }

    // Validate categories
    const categories = await prisma.serviceCategory.findMany({
      where: { id: { in: Array.from(allCategoryIds) }, businessId },
      select: { id: true, name: true, businessId: true, status: true },
    });
    if (categories.length !== allCategoryIds.size) {
      throw new ApiError(400, 'One or more categories not found', ErrorCodes.VALIDATION_ERROR);
    }
    for (const cat of categories) {
      if (cat.businessId !== businessId) throw new ApiError(400, `Category ${cat.name} does not belong to this business`, ErrorCodes.VALIDATION_ERROR);
      if (cat.status !== 'ACTIVE') throw new ApiError(400, `Category ${cat.name} is not active`, ErrorCodes.VALIDATION_ERROR);
    }

    // Validate branches
    const branches = await prisma.branch.findMany({
      where: { id: { in: Array.from(allBranchIds) }, businessId },
      select: { id: true, name: true, isActive: true },
    });
    if (branches.length !== allBranchIds.size) {
      throw new ApiError(400, 'One or more branches not found or do not belong to this business', ErrorCodes.BRANCH_NOT_IN_BUSINESS);
    }
    for (const b of branches) {
      if (!b.isActive) throw new ApiError(400, 'Cannot assign service to inactive branch', ErrorCodes.BAD_REQUEST);
    }

    // Check category active at branches
    const categoryIds = Array.from(allCategoryIds);
    const branchIds = Array.from(allBranchIds);
    const categoryAssignments = await prisma.serviceCategoryBranchAssignment.findMany({
      where: { categoryId: { in: categoryIds }, branchId: { in: branchIds } },
      select: { categoryId: true, branchId: true, isActive: true },
    });

    for (const item of input.items) {
      for (const branchId of item.branchIds) {
        const ca = categoryAssignments.find(ca => ca.categoryId === item.categoryId && ca.branchId === branchId);
        if (!ca || !ca.isActive) {
          throw new ApiError(400, `Category not active at branch`, ErrorCodes.VALIDATION_ERROR);
        }
      }
    }

    // Validate duration and price
    for (const item of input.items) {
      if (item.durationMinutes <= 0) throw new ApiError(400, 'Duration must be positive', ErrorCodes.VALIDATION_ERROR);
      if (item.price < 0) throw new ApiError(400, 'Price must be >= 0', ErrorCodes.VALIDATION_ERROR);
      if (item.depositAmount !== undefined && item.depositAmount !== null && item.depositAmount < 0) {
        throw new ApiError(400, 'Deposit amount cannot be negative', ErrorCodes.VALIDATION_ERROR);
      }
    }

    // Check for duplicate service names
    const existingServices = await prisma.service.findMany({
      where: { businessId, name: { in: Array.from(serviceNames) } },
      select: { name: true },
    });
    if (existingServices.length > 0) {
      throw new ApiError(409, `Service name(s) already exist: ${existingServices.map(s => s.name).join(', ')}`, ErrorCodes.CONFLICT);
    }

    // Create services and branch assignments in transaction
    const services = await prisma.$transaction(async (tx) => {
      const createdServices = [];
      for (const item of input.items) {
        const service = await tx.service.create({
          data: {
            businessId,
            categoryId: item.categoryId,
            name: item.name,
            description: item.description,
            durationMinutes: item.durationMinutes,
            price: new Prisma.Decimal(item.price),
            employeeAssignmentMode: item.employeeAssignmentMode,
            showPriceToCustomer: item.showPriceToCustomer ?? true,
            depositPolicyType: item.depositPolicyType,
            depositAmount: item.depositAmount ? new Prisma.Decimal(item.depositAmount) : null,
            status: 'ACTIVE',
          },
        });
        createdServices.push(service);

        // Create branch assignments
        await tx.serviceBranchAssignment.createMany({
          data: item.branchIds.map(branchId => ({
            serviceId: service.id,
            branchId,
            isActive: true,
            durationMinutes: item.durationMinutes,
            price: new Prisma.Decimal(item.price),
            bufferMinutes: 0,
          })),
        });
      }

      // Audit log
      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: 'SERVICES_BATCH_CREATED',
        entityType: 'Service',
        newValues: { items: input.items.map(i => ({ name: i.name, branchIds: i.branchIds })) },
      }, tx);

      return createdServices;
    });

    return services;
  }

  /**
   * Batch create staff members
   */
  async createStaff(
    businessId: string,
    userId: string,
    input: StaffBatchCreateInput
  ) {
    const membership = await this.verifyOwnerOrAdmin(businessId, userId);
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw new ApiError(404, 'Business not found', ErrorCodes.BUSINESS_NOT_FOUND);

    // Validate batch size
    if (input.items.length > MAX_BATCH_SIZE) {
      throw new ApiError(400, `Batch size cannot exceed ${MAX_BATCH_SIZE} items`, ErrorCodes.VALIDATION_ERROR);
    }

    // Validate all items
    const allBranchIds = new Set<string>();
    const allServiceIds = new Set<string>();
    const allCategoryIds = new Set<string>();

    for (const item of input.items) {
      allBranchIds.add(item.branchId);
      if (item.serviceIds) item.serviceIds.forEach(id => allServiceIds.add(id));
      if (item.categoryIds) item.categoryIds.forEach(id => allCategoryIds.add(id));
    }

    // Validate branches
    const branches = await prisma.branch.findMany({
      where: { id: { in: Array.from(allBranchIds) }, businessId },
      select: { id: true, name: true, isActive: true },
    });
    if (branches.length !== allBranchIds.size) {
      throw new ApiError(400, 'One or more branches not found or not in this business', ErrorCodes.BRANCH_NOT_IN_BUSINESS);
    }
    for (const b of branches) if (!b.isActive) throw new ApiError(400, `Branch is not active`, ErrorCodes.BAD_REQUEST);

    // Validate services
    if (allServiceIds.size > 0) {
      const services = await prisma.service.findMany({
        where: { id: { in: Array.from(allServiceIds) }, businessId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (services.length !== allServiceIds.size) {
        throw new ApiError(400, 'One or more services not found or not active', ErrorCodes.VALIDATION_ERROR);
      }
    }

    // Validate categories
    if (allCategoryIds.size > 0) {
      const categories = await prisma.serviceCategory.findMany({
        where: { id: { in: Array.from(allCategoryIds) }, businessId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (categories.length !== allCategoryIds.size) {
        throw new ApiError(400, 'One or more categories not found or not active', ErrorCodes.VALIDATION_ERROR);
      }
    }

    const staffMembers = await prisma.$transaction(async (tx) => {
      const created = [];
      for (const item of input.items) {
        const staff = await tx.staff.create({
          data: {
            businessId,
            branchId: item.branchId,
            firstName: item.firstName,
            lastName: item.lastName,
            email: item.email,
            phone: item.phone,
            title: item.title,
            bio: item.bio,
            status: 'ACTIVE',
          },
        });

        if (item.serviceIds && item.serviceIds.length > 0) {
          await tx.staffServiceQualification.createMany({
            data: item.serviceIds.map(serviceId => ({
              staffId: staff.id,
              serviceId,
              isActive: true,
            })),
          });
        }

        if (item.categoryIds && item.categoryIds.length > 0) {
          await tx.staffCategoryQualification.createMany({
            data: item.categoryIds.map(categoryId => ({
              staffId: staff.id,
              categoryId,
              isActive: true,
            })),
          });
        }

        created.push(staff);
      }

      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: 'STAFF_BATCH_CREATED',
        entityType: 'Staff',
        newValues: { count: input.items.length },
      }, tx);

      return created;
    });

    return staffMembers;
  }

  /**
   * Batch create payment methods
   */
  async createPaymentMethods(
    businessId: string,
    userId: string,
    input: PaymentMethodBatchCreateInput
  ) {
    const membership = await this.verifyOwnerOrAdmin(businessId, userId);
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw new ApiError(404, 'Business not found', ErrorCodes.BUSINESS_NOT_FOUND);

    // Validate batch size
    if (input.items.length > MAX_BATCH_SIZE) {
      throw new ApiError(400, `Batch size cannot exceed ${MAX_BATCH_SIZE} items`, ErrorCodes.VALIDATION_ERROR);
    }

    const names = new Set<string>();
    for (const item of input.items) {
      if (names.has(item.name)) {
        throw new ApiError(400, `Duplicate payment method name: ${item.name}`, ErrorCodes.CONFLICT);
      }
      names.add(item.name);
    }

    const existing = await prisma.paymentMethod.findMany({
      where: { businessId, name: { in: Array.from(names) } },
      select: { name: true },
    });
    if (existing.length > 0) {
      throw new ApiError(409, `Payment method name(s) already exist: ${existing.map(e => e.name).join(', ')}`, ErrorCodes.CONFLICT);
    }

    const methods = await prisma.$transaction(async (tx) => {
      await tx.paymentMethod.createMany({
        data: input.items.map(item => ({
          businessId,
          name: item.name,
          type: item.type,
          accountName: item.accountName,
          accountNumber: item.accountNumber,
          instructions: item.instructions,
          isActive: item.isActive ?? true,
          displayOrder: item.displayOrder ?? 0,
        })),
      });

      const created = await tx.paymentMethod.findMany({
        where: { businessId, name: { in: Array.from(names) } },
        orderBy: { displayOrder: 'asc' },
      });

      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: 'PAYMENT_METHODS_BATCH_CREATED',
        entityType: 'PaymentMethod',
        newValues: { items: input.items },
      }, tx);

      return created;
    });

    return methods;
  }

  private async verifyOwnerOrAdmin(businessId: string, userId: string) {
    const membership = await prisma.businessMember.findUnique({
      where: { businessId_userId: { businessId, userId } },
      include: {
        userRoles: { include: { role: true } },
      },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      throw new ApiError(403, 'Not a member of this business', ErrorCodes.NOT_BUSINESS_MEMBER);
    }

    const roleSystemKeys = membership.userRoles
      .map(ur => ur.role.systemKey)
      .filter((key): key is string => Boolean(key));

    const isOwnerOrAdmin = roleSystemKeys.some(key => ['OWNER', 'ADMIN'].includes(key));

    if (!isOwnerOrAdmin) {
      throw new ApiError(403, 'Only business owner or admin can perform batch creation', ErrorCodes.INSUFFICIENT_PERMISSIONS);
    }

    return membership;
  }
}

export const batchCreateService = new BatchCreateService();