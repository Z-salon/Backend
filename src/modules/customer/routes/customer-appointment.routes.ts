import { Router } from 'express';
import { customerAppointmentController } from '../controllers/customer-appointment.controller';
import { paymentReceiptController } from '../../payment/controllers/payment-receipt.controller';
import { authenticate } from '../../../middlewares/authenticate';

const router = Router();

/**
 * @openapi
 * /api/v1/customer/appointments:
 *   get:
 *     tags: [Customer Appointments]
 *     summary: Get all appointments for the authenticated customer
 *     security: [{ bearerAuth: [] }]
 */
router.get('/appointments', authenticate, customerAppointmentController.getCustomerAppointments);

/**
 * @openapi
 * /api/v1/customer/appointments/{appointmentId}:
 *   get:
 *     tags: [Customer Appointments]
 *     summary: Get a specific appointment for the authenticated customer
 *     security: [{ bearerAuth: [] }]
 */
router.get('/appointments/:appointmentId', authenticate, customerAppointmentController.getCustomerAppointment);

/**
 * @openapi
 * /api/v1/customer/appointments/{appointmentId}/reschedule:
 *   patch:
 *     tags: [Customer Appointments]
 *     summary: Reschedule an appointment
 *     security: [{ bearerAuth: [] }]
 */
router.patch('/appointments/:appointmentId/reschedule', authenticate, customerAppointmentController.rescheduleAppointment);

/**
 * @openapi
 * /api/v1/customer/appointments/{appointmentId}/cancel:
 *   post:
 *     tags: [Customer Appointments]
 *     summary: Cancel an appointment
 *     security: [{ bearerAuth: [] }]
 */
router.post('/appointments/:appointmentId/cancel', authenticate, customerAppointmentController.cancelAppointment);

/**
 * @openapi
 * /api/v1/customer/appointments/{appointmentId}/history:
 *   get:
 *     tags: [Customer Appointments]
 *     summary: Get appointment history
 *     security: [{ bearerAuth: [] }]
 */
router.get('/appointments/:appointmentId/history', authenticate, customerAppointmentController.getAppointmentHistory);

// Payment receipt routes (customer-facing)
router.post(
  '/appointments/:id/receipt',
  authenticate,
  paymentReceiptController.submitReceipt.bind(paymentReceiptController)
);

router.get(
  '/appointments/:id/receipt',
  authenticate,
  paymentReceiptController.getMyReceipt.bind(paymentReceiptController)
);

export default router;
