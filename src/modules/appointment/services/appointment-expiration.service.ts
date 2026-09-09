import { prisma } from '../../../libs/prisma';
import { AppointmentStatus, AppointmentActorType } from '@prisma/client';

export class AppointmentExpirationService {
  /**
   * Finds all stale PENDING appointments and transitions them to EXPIRED.
   * Can be run periodically by a cron job or scheduler.
   */
  async expireStalePendingAppointments(): Promise<number> {
    let expiredCount = 0;

    // Get all branches that have pending expiration configured
    const branches = await prisma.branchBookingConfig.findMany({
      where: {
        pendingAppointmentExpirationMinutes: { gt: 0 }
      },
      select: {
        branchId: true,
        pendingAppointmentExpirationMinutes: true
      }
    });

    for (const config of branches) {
      const expirationDate = new Date();
      expirationDate.setMinutes(expirationDate.getMinutes() - config.pendingAppointmentExpirationMinutes);

      // Find eligible PENDING appointments
      const staleAppointments = await prisma.appointment.findMany({
        where: {
          branchId: config.branchId,
          status: AppointmentStatus.PENDING,
          createdAt: {
            lt: expirationDate
          }
        },
        select: {
          id: true,
          businessId: true,
          status: true
        }
      });

      for (const appointment of staleAppointments) {
        try {
          await prisma.$transaction(async (tx) => {
            // Update status
            await tx.appointment.update({
              where: { id: appointment.id },
              data: { status: AppointmentStatus.EXPIRED }
            });

            // Create status history
            await tx.appointmentStatusHistory.create({
              data: {
                appointmentId: appointment.id,
                statusFrom: appointment.status,
                statusTo: AppointmentStatus.EXPIRED,
                actorId: null, // System action
                actorType: AppointmentActorType.SYSTEM,
                reason: `Appointment expired after ${config.pendingAppointmentExpirationMinutes} minutes of being pending.`,
              }
            });
            
          });
          expiredCount++;
        } catch (error) {
          console.error(`Failed to expire appointment ${appointment.id}:`, error);
        }
      }
    }

    return expiredCount;
  }
}

export const appointmentExpirationService = new AppointmentExpirationService();
