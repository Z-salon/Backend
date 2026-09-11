import { Router } from 'express';
import { publicBookingController } from '../controllers/public-booking.controller';
import { bodyValidator } from '../../../utils/body-validator';
import { publicBookingSchema, publicReceiptSchema } from '../validation/appointment.schemas';

const router = Router();

/**
 * @openapi
 * /api/v1/public/businesses/{businessId}/bookings:
 *   post:
 *     tags: [Public Booking]
 *     summary: Create an online appointment after OTP verification (no user account required)
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [verificationToken, firstName, lastName, phone, branchId, serviceId, staffId, scheduledStart]
 *             properties:
 *               verificationToken: { type: string }
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               phone: { type: string }
 *               branchId: { type: string, format: uuid }
 *               serviceId: { type: string, format: uuid }
 *               staffId: { type: string, format: uuid }
 *               scheduledStart: { type: string, format: date-time }
 *               notes: { type: string }
 *     responses:
 *       201: { description: Appointment created }
 *       400: { description: Invalid input or OTP }
 *       409: { description: Slot unavailable }
 */
router.post(
  '/businesses/:businessId/bookings',
  bodyValidator(publicBookingSchema),
  publicBookingController.createPublicBooking.bind(publicBookingController)
);

/**
 * @openapi
 * /api/v1/public/businesses/{businessId}/appointments/{appointmentId}/payment-receipts:
 *   post:
 *     tags: [Public Booking]
 *     summary: Submit a payment receipt for a PENDING public booking
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: appointmentId, required: true, schema: { type: string, format: uuid } }
 */
router.post(
  '/businesses/:businessId/appointments/:appointmentId/payment-receipts',
  bodyValidator(publicReceiptSchema),
  publicBookingController.submitPublicReceipt.bind(publicBookingController)
);

export default router;
