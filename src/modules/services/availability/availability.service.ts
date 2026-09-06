import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';
import { EmployeeAssignmentMode, DepositPolicyType, ServiceStatus, Prisma } from '@prisma/client';
import { ServiceBranchConfig, AvailabilityValidationResult, ServiceBranchConfigInput, EffectiveServiceConfig } from './availability.types';

export class AvailabilityService {
  /**
   * Resolves the effective service configuration for a specific branch.
   * Branch-specific values override service defaults when not null.
   */
  async resolveServiceBranchConfig(
    serviceId: string,
    branchId: string
  ): Promise<ServiceBranchConfig | null> {
    const assignment = await prisma.serviceBranchAssignment.findUnique({
      where: {
        serviceId_branchId: { serviceId, branchId },
      },
      include: {
        service: {
          include: {
            category: true,
          },
        },
        branch: true,
      },
    });

    if (!assignment || !assignment.isActive) {
      return null;
    }

    if (!assignment.service || assignment.service.status !== 'ACTIVE') {
      return null;
    }

    if (!assignment.branch || !assignment.branch.isActive) {
      return null;
    }

    if (!assignment.service.category || assignment.service.category.status !== 'ACTIVE') {
      return null;
    }

    // Check category is active at branch
    const catBranch = await prisma.serviceCategoryBranchAssignment.findUnique({
      where: {
        categoryId_branchId: {
          categoryId: assignment.service.categoryId,
          branchId,
        },
      },
    });

    if (!catBranch || !catBranch.isActive) {
      return null;
    }

    const effectiveDurationMinutes = assignment.durationMinutes ?? assignment.service.durationMinutes;
    const effectivePrice = assignment.price ? Number(assignment.price) : Number(assignment.service.price);
    const effectiveBufferMinutes = assignment.bufferMinutes;

    return {
      serviceId: assignment.serviceId,
      branchId: assignment.branchId,
      isActive: assignment.isActive,
      effectiveDurationMinutes,
      effectivePrice,
      bufferMinutes: effectiveBufferMinutes,
      employeeAssignmentMode: assignment.service.employeeAssignmentMode,
      showPriceToCustomer: assignment.service.showPriceToCustomer,
      depositPolicyType: assignment.service.depositPolicyType,
      depositAmount: assignment.service.depositAmount ? Number(assignment.service.depositAmount) : null,
    };
  }

  /**
   * Validates that a service is bookable at a branch and returns the effective configuration.
   */
  async validateServiceAtBranch(
    serviceId: string,
    branchId: string
  ): Promise<AvailabilityValidationResult> {
    const config = await this.resolveServiceBranchConfig(serviceId, branchId);

    if (!config) {
      return {
        isValid: false,
        errors: ['Service is not available at this branch'],
      };
    }

    if (config.effectiveDurationMinutes <= 0) {
      return {
        isValid: false,
        errors: ['Service duration must be positive'],
      };
    }

    if (config.effectivePrice < 0) {
      return {
        isValid: false,
        errors: ['Service price cannot be negative'],
      };
    }

    if (config.bufferMinutes < 0) {
      return {
        isValid: false,
        errors: ['Buffer minutes cannot be negative'],
      };
    }

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      include: { category: true, branchAssignments: true },
    });

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });

    const business = branch ? await prisma.business.findUnique({ where: { id: branch.businessId } }) : null;

    return {
      isValid: true,
      errors: [],
      service,
      branch,
      business,
      effectiveConfig: config,
    };
  }

  /**
   * Gets the booking block duration (service duration + buffer) for a service at a branch.
   */
  async getBookingBlockMinutes(serviceId: string, branchId: string): Promise<number | null> {
    const config = await this.resolveServiceBranchConfig(serviceId, branchId);
    if (!config) return null;
    return config.effectiveDurationMinutes + config.bufferMinutes;
  }

  /**
   * Validates and creates/updates a service branch configuration.
   * Uses transaction to ensure atomicity.
   */
  async upsertServiceBranchConfig(
    input: ServiceBranchConfigInput,
    userId: string
  ): Promise<{ config: ServiceBranchConfig; isNew: boolean }> {
    // Validate service and branch belong to same business
    const [service, branch] = await Promise.all([
      prisma.service.findUnique({ where: { id: input.serviceId }, include: { category: true } }),
      prisma.branch.findUnique({ where: { id: input.branchId } }),
    ]);

    if (!service) {
      throw new ApiError(404, 'Service not found', ErrorCodes.NOT_FOUND);
    }

    if (!branch) {
      throw new ApiError(404, 'Branch not found', ErrorCodes.NOT_FOUND);
    }

    if (service.businessId !== branch.businessId) {
      throw new ApiError(400, 'Service and branch must belong to the same business', ErrorCodes.BRANCH_NOT_IN_BUSINESS);
    }

    // Validate branch is active
    if (!branch.isActive) {
      throw new ApiError(400, 'Branch is not active', ErrorCodes.BAD_REQUEST);
    }

    // Validate service is active
    if (service.status !== 'ACTIVE') {
      throw new ApiError(400, 'Service is not active', ErrorCodes.VALIDATION_ERROR);
    }

    // Validate category is active at branch
    const catBranch = await prisma.serviceCategoryBranchAssignment.findUnique({
      where: {
        categoryId_branchId: { categoryId: service.categoryId, branchId: input.branchId },
      },
    });

    if (!catBranch || !catBranch.isActive) {
      throw new ApiError(400, 'Service category is not active at this branch', ErrorCodes.VALIDATION_ERROR);
    }

    // Validate duration
    if (input.durationMinutes !== undefined && input.durationMinutes !== null && input.durationMinutes <= 0) {
      throw new ApiError(400, 'Duration must be positive', ErrorCodes.VALIDATION_ERROR);
    }

    // Validate price
    if (input.price !== undefined && input.price !== null && input.price < 0) {
      throw new ApiError(400, 'Price cannot be negative', ErrorCodes.VALIDATION_ERROR);
    }

    // Validate buffer
    if (input.bufferMinutes !== undefined && input.bufferMinutes < 0) {
      throw new ApiError(400, 'Buffer minutes cannot be negative', ErrorCodes.VALIDATION_ERROR);
    }

    // Check existing assignment
    const existing = await prisma.serviceBranchAssignment.findUnique({
      where: { serviceId_branchId: { serviceId: input.serviceId, branchId: input.branchId } },
    });

    const isNew = !existing;

    const updated = await prisma.serviceBranchAssignment.upsert({
      where: { serviceId_branchId: { serviceId: input.serviceId, branchId: input.branchId } },
      create: {
        serviceId: input.serviceId,
        branchId: input.branchId,
        isActive: input.isActive ?? true,
        durationMinutes: input.durationMinutes,
        price: input.price ? new Prisma.Decimal(input.price) : null,
        bufferMinutes: input.bufferMinutes ?? 0,
      },
      update: {
        isActive: input.isActive,
        durationMinutes: input.durationMinutes,
        price: input.price ? new Prisma.Decimal(input.price) : null,
        bufferMinutes: input.bufferMinutes,
      },
      include: {
        branch: true,
        service: { include: { category: true } },
      },
    });

    return { config: this.mapToConfig(updated), isNew };
  }

  /**
   * Gets the effective service configuration for display/booking.
   * Includes all computed values.
   */
  async getEffectiveServiceConfig(serviceId: string, branchId: string): Promise<EffectiveServiceConfig | null> {
    const config = await this.resolveServiceBranchConfig(serviceId, branchId);
    if (!config) return null;

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      include: { category: true },
    });

    if (!service) return null;

    return {
      serviceId: service.id,
      branchId,
      name: service.name,
      durationMinutes: config.effectiveDurationMinutes,
      price: config.effectivePrice,
      bufferMinutes: config.bufferMinutes,
      employeeAssignmentMode: config.employeeAssignmentMode,
      showPriceToCustomer: config.showPriceToCustomer,
      depositPolicyType: config.depositPolicyType,
      depositAmount: config.depositAmount,
      isActive: config.isActive,
    };
  }

  /**
   * Gets all effectively available services at a branch.
   */
  async getAvailableServicesAtBranch(branchId: string, categoryId?: string) {
    return prisma.service.findMany({
      where: {
        status: 'ACTIVE',
        ...(categoryId ? { categoryId } : {}),
        category: {
          status: 'ACTIVE',
          branchAssignments: {
            some: {
              branchId,
              isActive: true,
              branch: { isActive: true },
            },
          },
        },
        branchAssignments: {
          some: {
            branchId,
            isActive: true,
          },
        },
      },
      include: {
        category: { select: { id: true, name: true, description: true } },
        branchAssignments: {
          where: { branchId },
          include: { branch: { select: { id: true, name: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Gets all services with their effective configuration at a branch.
   */
  async getServicesWithEffectiveConfig(branchId: string, categoryId?: string) {
    const services = await this.getAvailableServicesAtBranch(branchId, categoryId);

    const withConfig = await Promise.all(
      services.map(async (service) => {
        const config = await this.resolveServiceBranchConfig(service.id, branchId);
        const branchAssignment = service.branchAssignments.find((ba) => ba.branchId === branchId);
        return {
          ...service,
          effectiveDurationMinutes: config?.effectiveDurationMinutes ?? service.durationMinutes,
          effectivePrice: config?.effectivePrice ?? Number(service.price),
          bufferMinutes: config?.bufferMinutes ?? 0,
          branchAssignment,
        };
      })
    );

    return withConfig;
  }

  private mapToConfig(assignment: any): ServiceBranchConfig {
    const service = assignment.service;
    const effectiveDuration = assignment.durationMinutes ?? service.durationMinutes;
    const effectivePrice = assignment.price ? Number(assignment.price) : Number(service.price);

    return {
      serviceId: assignment.serviceId,
      branchId: assignment.branchId,
      isActive: assignment.isActive,
      effectiveDurationMinutes: effectiveDuration,
      effectivePrice,
      bufferMinutes: assignment.bufferMinutes,
      employeeAssignmentMode: service.employeeAssignmentMode,
      showPriceToCustomer: service.showPriceToCustomer,
      depositPolicyType: service.depositPolicyType,
      depositAmount: service.depositAmount ? Number(service.depositAmount) : null,
    };
  }
}

export const availabilityService = new AvailabilityService();