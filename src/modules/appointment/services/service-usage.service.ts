import { prisma } from '../../../libs/prisma';
import { ApiError } from '../../../utils/api-error';

export class ServiceUsageService {
  /**
   * Record a service history and products used during a service appointment.
   * Staff can add these records to any CHECKED_IN, IN_PROGRESS, or COMPLETED appointment.
   */
  async addServiceUsage(
    appointmentId: string,
    businessId: string,
    recordedById: string,
    data: {
      serviceId?: string;
      serviceName: string;
      serviceDetails?: string;
      productsUsed?: any; // JSON array of {name, quantity, unit}
      notes?: string;
    }
  ) {
    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });

    if (!appointment || appointment.businessId !== businessId) {
      throw ApiError.notFound('Appointment not found');
    }

    const allowedStatuses = ['CHECKED_IN', 'IN_PROGRESS', 'COMPLETED'];
    if (!allowedStatuses.includes(appointment.status)) {
      throw ApiError.badRequest(
        `Service usage can only be recorded for appointments in: ${allowedStatuses.join(', ')}`
      );
    }

    if (!data.serviceName?.trim()) {
      throw ApiError.badRequest('Service name is required');
    }

    return prisma.serviceUsage.create({
      data: {
        appointmentId,
        businessId,
        branchId: appointment.branchId,
        serviceId: data.serviceId,
        serviceName: data.serviceName.trim(),
        serviceDetails: data.serviceDetails,
        productsUsed: data.productsUsed,
        notes: data.notes,
        recordedById,
      },
    });
  }

  /**
   * List all service usages for an appointment.
   */
  async getServiceUsages(appointmentId: string, businessId: string) {
    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment || appointment.businessId !== businessId) {
      throw ApiError.notFound('Appointment not found');
    }

    return prisma.serviceUsage.findMany({
      where: { appointmentId },
      orderBy: { recordedAt: 'asc' },
      include: {
        recordedBy: { select: { id: true, phone: true } },
      },
    });
  }

  /**
   * Update a service usage entry.
   */
  async updateServiceUsage(
    usageId: string,
    businessId: string,
    actorId: string,
    data: {
      serviceName?: string;
      serviceDetails?: string;
      productsUsed?: any;
      notes?: string;
    }
  ) {
    const usage = await prisma.serviceUsage.findUnique({ where: { id: usageId } });
    if (!usage || usage.businessId !== businessId) {
      throw ApiError.notFound('Service usage record not found');
    }

    return prisma.serviceUsage.update({
      where: { id: usageId },
      data: {
        ...(data.serviceName ? { serviceName: data.serviceName.trim() } : {}),
        ...(data.serviceDetails !== undefined ? { serviceDetails: data.serviceDetails } : {}),
        ...(data.productsUsed !== undefined ? { productsUsed: data.productsUsed } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
    });
  }

  /**
   * Delete a service usage entry.
   */
  async deleteServiceUsage(usageId: string, businessId: string) {
    const usage = await prisma.serviceUsage.findUnique({ where: { id: usageId } });
    if (!usage || usage.businessId !== businessId) {
      throw ApiError.notFound('Service usage record not found');
    }

    await prisma.serviceUsage.delete({ where: { id: usageId } });
    return { success: true };
  }
}

export const serviceUsageService = new ServiceUsageService();
