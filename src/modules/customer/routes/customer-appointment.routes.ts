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
/**
 * @openapi
 * /api/v1/customer/appointments/{id}/receipt:
 *   post:
 *     tags: [Customer Payment Receipts]
 *     summary: Submit a payment receipt
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [paymentMethodId, submittedAmount, receiptImageUrl]
 *             properties:
 *               paymentMethodId: { type: string, format: uuid }
 *               submittedAmount: { oneOf: [{ type: number }, { type: string }] }
 *               receiptImageUrl: { type: string, format: uri }
 *               customerNote: { type: string }
 *     responses:
 *       201: { description: Receipt submitted for verification }
 *       400: { description: Invalid receipt data }
 *       401: { description: Authentication required }
 *       404: { description: Appointment not found }
 */
router.post(
  '/appointments/:id/receipt',
  authenticate,
  paymentReceiptController.submitReceipt.bind(paymentReceiptController)
);

/**
 * @openapi
 * /api/v1/customer/appointments/{id}/receipt:
 *   get:
 *     tags: [Customer Payment Receipts]
 *     summary: Get the customer's payment receipt
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses:
 *       200: { description: Receipt retrieved successfully }
 *       401: { description: Authentication required }
 *       404: { description: Appointment or receipt not found }
 */
router.get(
  '/appointments/:id/receipt',
  authenticate,
  paymentReceiptController.getMyReceipt.bind(paymentReceiptController)
);

export default router;
