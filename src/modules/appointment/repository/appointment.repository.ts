import { Prisma, AppointmentStatus } from '@prisma/client';
import { prisma } from '../../../libs/prisma';
import { AppointmentListQuery, AppointmentListResponse, AppointmentResponse } from '../types';

export class AppointmentRepository {
  async create(data: Prisma.AppointmentCreateInput) {
    return prisma.appointment.create({
      data,
      include: this.getDefaultInclude(),
    });
  }

  async findById(id: string) {
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: this.getDefaultInclude(),
    });

    return appointment ? this.transformAppointments([appointment])[0] : null;
  }

  async findByIdWithHistory(id: string) {
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        ...this.getDefaultInclude(),
        statusHistory: {
          orderBy: { transitionTimestamp: 'asc' },
          include: { actor: { select: { id: true, phone: true } } },
        },
      },
    });

    return appointment ? this.transformAppointments([appointment])[0] : null;
  }

  async findMany(query: AppointmentListQuery): Promise<AppointmentListResponse> {
    const {
      branchId,
      customerId,
      serviceId,
      staffId,
      status,
      bookingSource,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = query;

    const where: any = {};

    if (branchId) where.branchId = branchId;
    if (customerId) where.customerId = customerId;
    if (serviceId) where.serviceId = serviceId;
    if (staffId) where.staff = { some: { staffId } };
    if (status) where.status = status;
    if (bookingSource) where.bookingSource = bookingSource;

    if (startDate || endDate) {
      where.scheduledStart = {};
      if (startDate) where.scheduledStart.gte = startDate;
      if (endDate) where.scheduledStart.lte = endDate;
    }

    const skip = (page - 1) * limit;

    const [total, appointments] = await Promise.all([
      prisma.appointment.count({ where }),
      prisma.appointment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { scheduledStart: 'desc' },
        include: this.getDefaultInclude(),
      }),
    ]);

    return {
      data: this.transformAppointments(appointments),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private transformAppointments(appointments: any[]): AppointmentResponse[] {
    const result: AppointmentResponse[] = [];
    for (const appointment of appointments) {
      const transformedStaff = appointment.staff.map((as: any) => ({
        id: as.staff.id,
        firstName: as.staff.firstName,
        lastName: as.staff.lastName,
      }));
      result.push({
        ...appointment,
        staff: transformedStaff,
      });
    }
    return result;
  }

  async update(id: string, data: any) {
    const appointment = await prisma.appointment.update({
      where: { id },
      data,
      include: this.getDefaultInclude(),
    });

    return this.transformAppointments([appointment])[0];
  }

  async updateStatus(id: string, status: AppointmentStatus, timestampField?: string) {
    const data: any = { status };
    if (timestampField) {
      data[timestampField] = new Date();
    }
    return prisma.appointment.update({
      where: { id },
      data,
      include: this.getDefaultInclude(),
    });
  }

  async addStatusHistory(data: {
    appointmentId: string;
    statusFrom: AppointmentStatus | null;
    statusTo: AppointmentStatus;
    actorId?: string;
    actorType: 'USER' | 'SYSTEM';
    reason?: string;
  }) {
    return prisma.appointmentStatusHistory.create({
      data: {
        appointmentId: data.appointmentId,
        statusFrom: data.statusFrom,
        statusTo: data.statusTo,
        actorId: data.actorId,
        actorType: data.actorType,
        reason: data.reason,
      },
    });
  }

  async getStatusHistory(appointmentId: string) {
    return prisma.appointmentStatusHistory.findMany({
      where: { appointmentId },
      orderBy: { transitionTimestamp: 'asc' },
      include: { actor: { select: { id: true, phone: true } } },
    });
  }

  async getAppointmentStaff(appointmentId: string) {
    return prisma.appointmentStaff.findMany({
      where: { appointmentId },
      include: { staff: true },
    });
  }

  async addAppointmentStaff(appointmentId: string, staffId: string) {
    return prisma.appointmentStaff.create({
      data: { appointmentId, staffId },
      include: { staff: true },
    });
  }

  async removeAppointmentStaff(appointmentId: string, staffId: string) {
    return prisma.appointmentStaff.delete({
      where: { appointmentId_staffId: { appointmentId, staffId } },
    });
  }

  async getAppointmentsByBranchAndDate(branchId: string, startDate: Date, endDate: Date) {
    return prisma.appointment.findMany({
      where: {
        branchId,
        scheduledStart: {
          gte: startDate,
          lt: endDate,
        },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
      include: {
        staff: { include: { staff: true } },
        service: { select: { id: true, durationMinutes: true } },
      },
    });
  }

  async getAppointmentsByStaffAndDate(staffId: string, startDate: Date, endDate: Date) {
    return prisma.appointment.findMany({
      where: {
        staff: { some: { staffId } },
        scheduledStart: {
          gte: startDate,
          lt: endDate,
        },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
      include: {
        service: { select: { id: true, name: true, durationMinutes: true } },
        customer: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async countByBranchAndDateRange(branchId: string, startDate: Date, endDate: Date, status?: string) {
    return prisma.appointment.count({
      where: {
        branchId,
        scheduledStart: {
          gte: startDate,
          lt: endDate,
        },
        ...(status ? { status: status as any } : {}),
      },
    });
  }

  private getDefaultInclude() {
    return {
      customer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phones: { select: { phone: true, isPrimary: true } },
        },
      },
      service: {
        select: {
          id: true,
          name: true,
          durationMinutes: true,
          price: true,
        },
      },
      staff: {
        include: {
          staff: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    };
  }
}

export const appointmentRepository = new AppointmentRepository();