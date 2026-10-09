import { Router } from 'express';
import { appointmentFollowUpController } from '../controllers/appointment-follow-up.controller';
import { authenticate } from '../../../middlewares/authenticate';
import { requireBusinessMembership } from '../../../middlewares/require-business-membership';

const router = Router();

/**
 * @openapi
 * /api/v1/businesses/{businessId}/appointment-follow-ups:
 *   get:
 *     tags: [Appointments]
 *     summary: List appointments that need staff follow-up
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *       - { in: query, name: status, schema: { type: string, enum: [OPEN, RESOLVED, CANCELLED] } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       200: { description: Follow-up list }
 */
router.get(
  '/businesses/:businessId/appointment-follow-ups',
  authenticate,
  requireBusinessMembership,
  appointmentFollowUpController.list.bind(appointmentFollowUpController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/appointment-follow-ups/{followUpId}:
 *   patch:
 *     tags: [Appointments]
 *     summary: Record a staff follow-up outcome (CONFIRMED, CANCELLED, RESCHEDULED)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Follow-up resolved }
 */
router.patch(
  '/businesses/:businessId/appointment-follow-ups/:followUpId',
  authenticate,
  requireBusinessMembership,
  appointmentFollowUpController.resolve.bind(appointmentFollowUpController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/appointment-follow-ups/{followUpId}/reopen:
 *   post:
 *     tags: [Appointments]
 *     summary: Open a new follow-up for another contact attempt (history preserved)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Follow-up reopened }
 */
router.post(
  '/businesses/:businessId/appointment-follow-ups/:followUpId/reopen',
  authenticate,
  requireBusinessMembership,
  appointmentFollowUpController.reopen.bind(appointmentFollowUpController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/appointments/{appointmentId}/follow-up:
 *   get:
 *     tags: [Appointments]
 *     summary: Follow-up warning/indicator data for an appointment
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Follow-up state }
 */
router.get(
  '/businesses/:businessId/appointments/:appointmentId/follow-up',
  authenticate,
  requireBusinessMembership,
  appointmentFollowUpController.getForAppointment.bind(appointmentFollowUpController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/appointments/{appointmentId}/reminders:
 *   get:
 *     tags: [Appointments]
 *     summary: Reminder history for an appointment
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Reminder history }
 */
router.get(
  '/businesses/:businessId/appointments/:appointmentId/reminders',
  authenticate,
  requireBusinessMembership,
  appointmentFollowUpController.reminderHistory.bind(appointmentFollowUpController)
);

export default router;
