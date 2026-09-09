import cron from 'node-cron';
import { appointmentExpirationService } from '../modules/appointment/services/appointment-expiration.service';

/**
 * Registers all background cron jobs for the application.
 * Call this once during server startup.
 */
export function registerScheduledJobs(): void {
  // Run every 5 minutes: expire stale PENDING appointments
  cron.schedule('*/5 * * * *', async () => {
    try {
      const count = await appointmentExpirationService.expireStalePendingAppointments();
      if (count > 0) {
        console.log(`[Scheduler] Expired ${count} stale pending appointment(s).`);
      }
    } catch (error) {
      console.error('[Scheduler] Error running appointment expiration job:', error);
    }
  });

  console.log('⏰ Background scheduler registered (appointment expiration: every 5 min).');
}
