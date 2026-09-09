import { Router } from 'express';
import { appointmentController } from '../controllers/appointment.controller';
import { authenticate } from '../../../middlewares/authenticate';
import { requireBusinessMembership } from '../../../middlewares/require-business-membership';
import { requirePermission } from '../../../middlewares/require-permission';
import { bodyValidator } from '../../../utils/body-validator';
import {
  appointmentCreateSchema,
  appointmentUpdateSchema,
  appointmentStatusUpdateSchema,
  appointmentListQuerySchema,
  appointmentStaffAssignSchema,
  appointmentStatusTransitionSchema,
} from '../validation/appointment.schemas';

const router = Router();

// Customer-facing online booking
/**
 * @openapi
 * /api/v1/businesses/{businessId}/appointments:
 *   post:
 *     tags: [Appointments]
 *     summary: Create an online appointment (customer booking)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [branchId, customerId, serviceId, scheduledStart, scheduledEnd]
 *             properties:
 *               branchId: { type: string, format: uuid }
 *               customerId: { type: string, format: uuid }
 *               serviceId: { type: string, format: uuid }
 *               staffId: { type: string, format: uuid }
 *               scheduledStart: { type: string, format: date-time }
 *               scheduledEnd: { type: string, format: date-time }
 *               notes: { type: string }
 *               internalNotes: { type: string }
 *               bookingSource: { type: string, enum: [ONLINE, STAFF, PHONE, WALK_IN], default: ONLINE }
 *     responses:
 *       201: { description: Appointment created successfully }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       403: { description: Business membership required }
 *       404: { description: Business, branch, customer, or service not found }
 *       409: { description: Time slot conflict }
 */
router.post(
  '/businesses/:businessId/appointments',
  authenticate,
  requireBusinessMembership,
  requirePermission('APPOINTMENT_CREATE'),
  bodyValidator(appointmentCreateSchema),
  appointmentController.createAppointment.bind(appointmentController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/appointments/walk-in:
 *   post:
 *     tags: [Appointments]
 *     summary: Create a walk-in appointment
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [branchId, customerId, serviceId, scheduledStart, scheduledEnd]
 *             properties:
 *               branchId: { type: string, format: uuid }
 *               customerId: { type: string, format: uuid }
 *               serviceId: { type: string, format: uuid }
 *               staffId: { type: string, format: uuid }
 *               scheduledStart: { type: string, format: date-time }
 *               scheduledEnd: { type: string, format: date-time }
 *               notes: { type: string }
 *               internalNotes: { type: string }
 *     responses:
 *       201: { description: Walk-in appointment created successfully }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       403: { description: Business membership required }
 *       404: { description: Business, branch, customer, or service not found }
 *       409: { description: Time slot conflict }
 */
router.post(
  '/businesses/:businessId/appointments/walk-in',
  authenticate,
  requireBusinessMembership,
  requirePermission('APPOINTMENT_CREATE'),
  bodyValidator(appointmentCreateSchema),
  appointmentController.createWalkIn.bind(appointmentController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/appointments/staff-booking:
 *   post:
 *     tags: [Appointments]
 *     summary: Create a staff-assisted appointment (phone or in-person)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [branchId, customerId, serviceId, scheduledStart, scheduledEnd, bookingSource]
 *             properties:
 *               branchId: { type: string, format: uuid }
 *               customerId: { type: string, format: uuid }
 *               serviceId: { type: string, format: uuid }
 *               staffId: { type: string, format: uuid }
 *               scheduledStart: { type: string, format: date-time }
 *               scheduledEnd: { type: string, format: date-time }
 *               notes: { type: string }
 *               internalNotes: { type: string }
 *               bookingSource: { type: string, enum: [STAFF, PHONE] }
 *     responses:
 *       201: { description: Staff-assisted appointment created successfully }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       403: { description: Business membership required }
 *       404: { description: Business, branch, customer, or service not found }
 *       409: { description: Time slot conflict }
 */
router.post(
  '/businesses/:businessId/appointments/staff-booking',
  authenticate,
  requireBusinessMembership,
  requirePermission('APPOINTMENT_CREATE'),
  bodyValidator(appointmentCreateSchema),
  appointmentController.createStaffBooking.bind(appointmentController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/appointments/match-customer:
 *   post:
 *     tags: [Appointments]
 *     summary: Match customer by phone (for walk-in/phone booking)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone]
 *             properties:
 *               phone: { type: string }
 *               firstName: { type: string }
 *               lastName: { type: string }
 *     responses:
 *       200: { description: Customer matched or created }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       403: { description: Business membership required }
 */
router.post(
  '/businesses/:businessId/appointments/match-customer',
  authenticate,
  requireBusinessMembership,
  requirePermission('APPOINTMENT_CREATE'),
  appointmentController.matchCustomer.bind(appointmentController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/appointments/match-customer-phone:
 *   post:
 *     tags: [Appointments]
 *     summary: Match customer by phone only (lookup)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone]
 *             properties:
 *               phone: { type: string }
 *     responses:
 *       200: { description: Customer matched or not found }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       403: { description: Business membership required }
 */
router.post(
  '/businesses/:businessId/appointments/match-customer-phone',
  authenticate,
  requireBusinessMembership,
  requirePermission('APPOINTMENT_CREATE'),
  appointmentController.matchCustomerByPhone.bind(appointmentController)
);

// Direct appointment routes (require appointment ID)
/**
 * @openapi
 * /api/v1/appointments/{appointmentId}:
 *   get:
 *     tags: [Appointments]
 *     summary: Get appointment by ID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: appointmentId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Appointment retrieved successfully }
 *       401: { description: Authentication required }
 *       404: { description: Appointment not found }
 *       403: { description: Access denied }
 */
router.get(
  '/appointments/:appointmentId',
  authenticate,
  appointmentController.getAppointment.bind(appointmentController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/appointments:
 *   get:
 *     tags: [Appointments]
 *     summary: List appointments with filters
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *       - { in: query, name: customerId, schema: { type: string, format: uuid } }
 *       - { in: query, name: serviceId, schema: { type: string, format: uuid } }
 *       - { in: query, name: staffId, schema: { type: string, format: uuid } }
 *       - { in: query, name: status, schema: { type: string } }
 *       - { in: query, name: bookingSource, schema: { type: string } }
 *       - { in: query, name: startDate, schema: { type: string, format: date-time } }
 *       - { in: query, name: endDate, schema: { type: string, format: date-time } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       200: { description: Appointments retrieved successfully }
 *       401: { description: Authentication required }
 *       403: { description: Business membership required }
 */
router.get(
  '/businesses/:businessId/appointments',
  authenticate,
  requireBusinessMembership,
  requirePermission('APPOINTMENT_VIEW'),
  appointmentController.getAppointments.bind(appointmentController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/appointments/{appointmentId}/reschedule:
 *   patch:
 *     tags: [Appointments]
 *     summary: Reschedule an appointment (business)
 *     security: [{ bearerAuth: [] }]
 */
router.patch(
  '/businesses/:businessId/appointments/:appointmentId/reschedule',
  authenticate,
  requireBusinessMembership,
  requirePermission('APPOINTMENT_UPDATE'),
  appointmentController.rescheduleAppointment.bind(appointmentController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/appointments/{appointmentId}/service:
 *   patch:
 *     tags: [Appointments]
 *     summary: Change appointment service (business)
 *     security: [{ bearerAuth: [] }]
 */
router.patch(
  '/businesses/:businessId/appointments/:appointmentId/service',
  authenticate,
  requireBusinessMembership,
  requirePermission('APPOINTMENT_UPDATE'),
  appointmentController.editService.bind(appointmentController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/appointments/{appointmentId}/cancel:
 *   post:
 *     tags: [Appointments]
 *     summary: Cancel an appointment (business)
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/businesses/:businessId/appointments/:appointmentId/cancel',
  authenticate,
  requireBusinessMembership,
  requirePermission('APPOINTMENT_UPDATE'),
  appointmentController.cancelAppointment.bind(appointmentController)
);

/**
 * @openapi
 * /api/v1/appointments/{appointmentId}:
 *   patch:
 *     tags: [Appointments]
 *     summary: Update appointment (reschedule, change staff, add notes)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: appointmentId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               scheduledStart: { type: string, format: date-time }
 *               scheduledEnd: { type: string, format: date-time }
 *               staffId: { type: string, format: uuid, nullable: true }
 *               notes: { type: string, nullable: true }
 *               internalNotes: { type: string, nullable: true }
 *               status: { type: string }
 *     responses:
 *       200: { description: Appointment updated successfully }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       404: { description: Appointment not found }
 *       403: { description: Access denied }
 *       409: { description: Time slot conflict }
 */
router.patch(
  '/appointments/:appointmentId',
  authenticate,
  bodyValidator(appointmentUpdateSchema),
  appointmentController.updateAppointment.bind(appointmentController)
);

/**
 * @openapi
 * /api/v1/appointments/{appointmentId}/status:
 *   patch:
 *     tags: [Appointments]
 *     summary: Transition appointment status
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: appointmentId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string }
 *               reason: { type: string }
 *     responses:
 *       200: { description: Appointment status updated successfully }
 *       400: { description: Invalid status transition }
 *       401: { description: Authentication required }
 *       404: { description: Appointment not found }
 *       403: { description: Access denied }
 */
router.patch(
  '/appointments/:appointmentId/status',
  authenticate,
  bodyValidator(appointmentStatusTransitionSchema),
  appointmentController.transitionStatus.bind(appointmentController)
);

/**
 * @openapi
 * /api/v1/appointments/{appointmentId}/status-history:
 *   get:
 *     tags: [Appointments]
 *     summary: Get appointment status history
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: appointmentId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Status history retrieved successfully }
 *       401: { description: Authentication required }
 *       404: { description: Appointment not found }
 *       403: { description: Access denied }
 */
router.get(
  '/appointments/:appointmentId/status-history',
  authenticate,
  appointmentController.getStatusHistory.bind(appointmentController)
);

/**
 * @openapi
 * /api/v1/appointments/{appointmentId}/staff:
 *   post:
 *     tags: [Appointments]
 *     summary: Assign staff to appointment
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: appointmentId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [staffId]
 *             properties:
 *               staffId: { type: string, format: uuid }
 *     responses:
 *       200: { description: Staff assigned successfully }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       404: { description: Appointment or staff not found }
 *       403: { description: Access denied }
 *       409: { description: Staff has conflicting appointment }
 */
router.post(
  '/appointments/:appointmentId/staff',
  authenticate,
  bodyValidator(appointmentStaffAssignSchema),
  appointmentController.assignStaff.bind(appointmentController)
);

/**
 * @openapi
 * /api/v1/appointments/{appointmentId}/staff:
 *   delete:
 *     tags: [Appointments]
 *     summary: Unassign staff from appointment
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: appointmentId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Staff unassigned successfully }
 *       401: { description: Authentication required }
 *       404: { description: Appointment not found }
 *       403: { description: Access denied }
 */
router.delete(
  '/appointments/:appointmentId/staff',
  authenticate,
  appointmentController.unassignStaff.bind(appointmentController)
);

export default router;