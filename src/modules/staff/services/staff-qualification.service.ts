import { prisma } from '../../../libs/prisma';
import { ApiError, ErrorCodes } from '../../../utils/api-error';
import { auditLogService } from '../../business/services/audit-log.service';
import { ProficiencyLevel } from '@prisma/client';
import { staffService } from './staff.service';

export class StaffQualificationService {
  async addCategoryQualification(businessId: string, staffId: string, userId: string, categoryId: string) {
    const auth = await staffService.getMembershipAndUserRoles(businessId, userId);
    const staff = await staffService.getStaffById(businessId, staffId);

    // Branch manager scope check
    if (!auth.isOwnerOrAdmin && auth.isBranchManager && !auth.allowedBranchIds.has(staff.branchId)) {
      throw ApiError.forbidden('Cannot manage qualifications for staff outside authorized branch', ErrorCodes.FORBIDDEN);
    }

    // Category must be active and assigned to the staff's branch
    const categoryAssignment = await prisma.serviceCategoryBranchAssignment.findFirst({
      where: {
        categoryId,
        branchId: staff.branchId,
        isActive: true,
        category: { businessId, status: 'ACTIVE' },
      },
    });

    if (!categoryAssignment) {
      throw ApiError.badRequest('Category is not available or active at this staff\'s branch', ErrorCodes.BAD_REQUEST);
    }

    const existing = await prisma.staffCategoryQualification.findUnique({
      where: { staffId_categoryId: { staffId, categoryId } },
    });

    if (existing && existing.isActive) {
      throw ApiError.conflict('Staff already has an active qualification for this category', ErrorCodes.CONFLICT);
    }

    return prisma.$transaction(async (tx) => {
      let qualification;
      if (existing) {
        qualification = await tx.staffCategoryQualification.update({
          where: { id: existing.id },
          data: { isActive: true },
        });
      } else {
        qualification = await tx.staffCategoryQualification.create({
          data: { staffId, categoryId, isActive: true },
        });
      }

      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: 'STAFF_CATEGORY_QUALIFICATION_ADDED',
        entityType: 'StaffCategoryQualification',
        entityId: qualification.id,
        newValues: { staffId, categoryId },
      }, tx);

      return qualification;
    });
  }

  async removeCategoryQualification(businessId: string, staffId: string, userId: string, categoryId: string) {
    const auth = await staffService.getMembershipAndUserRoles(businessId, userId);
    const staff = await staffService.getStaffById(businessId, staffId);

    if (!auth.isOwnerOrAdmin && auth.isBranchManager && !auth.allowedBranchIds.has(staff.branchId)) {
      throw ApiError.forbidden('Cannot manage qualifications for staff outside authorized branch', ErrorCodes.FORBIDDEN);
    }

    const existing = await prisma.staffCategoryQualification.findUnique({
      where: { staffId_categoryId: { staffId, categoryId } },
    });

    if (!existing || !existing.isActive) return;

    return prisma.$transaction(async (tx) => {
      const qualification = await tx.staffCategoryQualification.update({
        where: { id: existing.id },
        data: { isActive: false },
      });

      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: 'STAFF_CATEGORY_QUALIFICATION_REMOVED',
        entityType: 'StaffCategoryQualification',
        entityId: qualification.id,
        oldValues: { staffId, categoryId, isActive: true },
        newValues: { staffId, categoryId, isActive: false },
      }, tx);

      return qualification;
    });
  }

  async addServiceQualification(businessId: string, staffId: string, userId: string, serviceId: string, proficiencyLevel: ProficiencyLevel) {
    const auth = await staffService.getMembershipAndUserRoles(businessId, userId);
    const staff = await staffService.getStaffById(businessId, staffId);

    if (!auth.isOwnerOrAdmin && auth.isBranchManager && !auth.allowedBranchIds.has(staff.branchId)) {
      throw ApiError.forbidden('Cannot manage qualifications for staff outside authorized branch', ErrorCodes.FORBIDDEN);
    }

    // Service must be active and assigned to the staff's branch
    const serviceAssignment = await prisma.serviceBranchAssignment.findFirst({
      where: {
        serviceId,
        branchId: staff.branchId,
        isActive: true,
        service: { businessId, status: 'ACTIVE' },
      },
    });

    if (!serviceAssignment) {
      throw ApiError.badRequest('Service is not available or active at this staff\'s branch', ErrorCodes.BAD_REQUEST);
    }

    const existing = await prisma.staffServiceQualification.findUnique({
      where: { staffId_serviceId: { staffId, serviceId } },
    });

    if (existing && existing.isActive && existing.proficiencyLevel === proficiencyLevel) {
      throw ApiError.conflict('Staff already has an active qualification for this service with the same proficiency', ErrorCodes.CONFLICT);
    }

    return prisma.$transaction(async (tx) => {
      let qualification;
      if (existing) {
        qualification = await tx.staffServiceQualification.update({
          where: { id: existing.id },
          data: { isActive: true, proficiencyLevel },
        });
      } else {
        qualification = await tx.staffServiceQualification.create({
          data: { staffId, serviceId, proficiencyLevel, isActive: true },
        });
      }

      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: 'STAFF_SERVICE_QUALIFICATION_ADDED',
        entityType: 'StaffServiceQualification',
        entityId: qualification.id,
        newValues: { staffId, serviceId, proficiencyLevel },
      }, tx);

      return qualification;
    });
  }

  async removeServiceQualification(businessId: string, staffId: string, userId: string, serviceId: string) {
    const auth = await staffService.getMembershipAndUserRoles(businessId, userId);
    const staff = await staffService.getStaffById(businessId, staffId);

    if (!auth.isOwnerOrAdmin && auth.isBranchManager && !auth.allowedBranchIds.has(staff.branchId)) {
      throw ApiError.forbidden('Cannot manage qualifications for staff outside authorized branch', ErrorCodes.FORBIDDEN);
    }

    const existing = await prisma.staffServiceQualification.findUnique({
      where: { staffId_serviceId: { staffId, serviceId } },
    });

    if (!existing || !existing.isActive) return;

    return prisma.$transaction(async (tx) => {
      const qualification = await tx.staffServiceQualification.update({
        where: { id: existing.id },
        data: { isActive: false },
      });

      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: 'STAFF_SERVICE_QUALIFICATION_REMOVED',
        entityType: 'StaffServiceQualification',
        entityId: qualification.id,
        oldValues: { staffId, serviceId, isActive: true },
        newValues: { staffId, serviceId, isActive: false },
      }, tx);

      return qualification;
    });
  }
}

export const staffQualificationService = new StaffQualificationService();
