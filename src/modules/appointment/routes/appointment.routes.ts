import { Router } from 'express';
import { appointmentController } from '../controllers/appointment.controller';
import { serviceUsageController } from '../controllers/service-usage.controller';
import { paymentReceiptController } from '../../payment/controllers/payment-receipt.controller';
import { paymentMethodController } from '../../payment/controllers/payment-method.controller';
import { appointmentPaymentController } from '../../payment/controllers/appointment-payment.controller';
import { authenticate } from '../../../middlewares/authenticate';
import { requireBusinessMembership } from '../../../middlewares/require-business-membership';
import { requirePermission } from '../../../middlewares/require-permission';
import { bodyValidator } from '../../../utils/body-validator';
import {
  appointmentCreateSchema,
  appointmentUpdateSchema,
  appointmentStaffAssignSchema,
  appointmentStatusTransitionSchema,
  appointmentWalkInSchema,
  appointmentStaffBookingSchema,
  appointmentRescheduleSchema,
  appointmentServiceChangeSchema,
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
 //requirePermission('APPOINTMENT_CREATE'),
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
  bodyValidator(appointmentWalkInSchema),
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
  bodyValidator(appointmentStaffBookingSchema),
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
 //requirePermission('APPOINTMENT_CREATE'),
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
 //requirePermission('APPOINTMENT_CREATE'),
  appointmentController.matchCustomerByPhone.bind(appointmentController)
);

// Direct appointment routes (require appointment ID)
/**
 * @openapi
 * /api/v1/businesses/{businessId}/appointments/{appointmentId}:
 *   get:
 *     tags: [Appointments]
 *     summary: Get appointment by ID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: appointmentId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Appointment retrieved successfully }
 *       401: { description: Authentication required }
 *       404: { description: Appointment not found }
 *       403: { description: Access denied }
 */
router.get(
  '/businesses/:businessId/appointments/:appointmentId',
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
  //requirePermission('APPOINTMENT_VIEW'),
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
  bodyValidator(appointmentRescheduleSchema),
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
  bodyValidator(appointmentServiceChangeSchema),
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
 //requirePermission('APPOINTMENT_UPDATE'),
  appointmentController.cancelAppointment.bind(appointmentController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/appointments/{appointmentId}:
 *   patch:
 *     tags: [Appointments]
 *     summary: Update appointment (reschedule, change staff, add notes)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: appointmentId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
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
  '/businesses/:businessId/appointments/:appointmentId',
  authenticate,
  requireBusinessMembership,
  bodyValidator(appointmentUpdateSchema),
  appointmentController.updateAppointment.bind(appointmentController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/appointments/{appointmentId}/status:
 *   patch:
 *     tags: [Appointments]
 *     summary: Transition appointment status
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: appointmentId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
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
  '/businesses/:businessId/appointments/:appointmentId/status',
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
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
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
  '/businesses/:businessId/appointments/:appointmentId/staff',
  authenticate,
  requireBusinessMembership,
  bodyValidator(appointmentStaffAssignSchema),
  appointmentController.assignStaff.bind(appointmentController)
);

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

// No-show
/**
 * @openapi
 * /api/v1/businesses/{businessId}/appointments/{appointmentId}/no-show:
 *   post:
 *     tags: [Appointments]
 *     summary: Mark an appointment as no-show
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: appointmentId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Appointment marked as no-show }
 *       401: { description: Authentication required }
 *       403: { description: Insufficient permissions }
 *       404: { description: Appointment not found }
 */
router.post(
  '/businesses/:businessId/appointments/:appointmentId/no-show',
  authenticate,
  requireBusinessMembership,
 //requirePermission('APPOINTMENT_UPDATE'),
  appointmentController.markNoShow.bind(appointmentController)
);

// Service usage
/**
 * @openapi
 * /api/v1/businesses/{businessId}/appointments/{id}/service-usages:
 *   post:
 *     tags: [Service Usage]
 *     summary: Add service usage to an appointment
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, additionalProperties: true }
 *     responses:
 *       201: { description: Service usage added }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       403: { description: Insufficient permissions }
 *       404: { description: Appointment or service not found }
 */
router.post(
  '/businesses/:businessId/appointments/:id/service-usages',
  authenticate,
  requireBusinessMembership,
 //requirePermission('APPOINTMENT_UPDATE'),
  serviceUsageController.addServiceUsage.bind(serviceUsageController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/appointments/{id}/service-usages:
 *   get:
 *     tags: [Service Usage]
 *     summary: List service usage for an appointment
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Service usage retrieved successfully }
 *       401: { description: Authentication required }
 *       403: { description: Insufficient permissions }
 *       404: { description: Appointment not found }
 */
router.get(
  '/businesses/:businessId/appointments/:id/service-usages',
  authenticate,
  requireBusinessMembership,
  //requirePermission('APPOINTMENT_VIEW'),
  serviceUsageController.getServiceUsages.bind(serviceUsageController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/service-usages/{usageId}:
 *   patch:
 *     tags: [Service Usage]
 *     summary: Update service usage
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: usageId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, additionalProperties: true }
 *     responses:
 *       200: { description: Service usage updated }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       403: { description: Insufficient permissions }
 *       404: { description: Service usage not found }
 */
router.patch(
  '/businesses/:businessId/service-usages/:usageId',
  authenticate,
  requireBusinessMembership,
 //requirePermission('APPOINTMENT_UPDATE'),
  serviceUsageController.updateServiceUsage.bind(serviceUsageController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/service-usages/{usageId}:
 *   delete:
 *     tags: [Service Usage]
 *     summary: Delete service usage
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: usageId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Service usage deleted }
 *       401: { description: Authentication required }
 *       403: { description: Insufficient permissions }
 *       404: { description: Service usage not found }
 */
router.delete(
  '/businesses/:businessId/service-usages/:usageId',
  authenticate,
  requireBusinessMembership,
 //requirePermission('APPOINTMENT_UPDATE'),
  serviceUsageController.deleteServiceUsage.bind(serviceUsageController)
);

// Business-side payment receipt routes
/**
 * @openapi
 * /api/v1/businesses/{businessId}/receipts/pending:
 *   get:
 *     tags: [Payment Receipts]
 *     summary: List pending payment receipts
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Pending receipts retrieved successfully }
 *       401: { description: Authentication required }
 *       403: { description: Insufficient permissions }
 */
router.get(
  '/businesses/:businessId/receipts/pending',
  authenticate,
  requireBusinessMembership,
 //requirePermission('APPOINTMENT_UPDATE'),
  paymentReceiptController.listPendingReceipts.bind(paymentReceiptController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/appointments/{id}/receipt:
 *   get:
 *     tags: [Payment Receipts]
 *     summary: Get an appointment payment receipt
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Receipt retrieved successfully }
 *       401: { description: Authentication required }
 *       403: { description: Insufficient permissions }
 *       404: { description: Receipt not found }
 */
router.get(
  '/businesses/:businessId/appointments/:id/receipt',
  authenticate,
  requireBusinessMembership,
  //requirePermission('APPOINTMENT_VIEW'),
  paymentReceiptController.getReceiptForAppointment.bind(paymentReceiptController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/appointments/{id}/receipt/verify:
 *   patch:
 *     tags: [Payment Receipts]
 *     summary: Approve or reject a payment receipt
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action: { type: string, enum: [APPROVE, REJECT] }
 *               rejectionReason: { type: string }
 *               verifiedAmount: { oneOf: [{ type: number }, { type: string }] }
 *     responses:
 *       200: { description: Receipt verification completed }
 *       400: { description: Invalid verification action }
 *       401: { description: Authentication required }
 *       403: { description: Insufficient permissions }
 *       404: { description: Receipt not found }
 */
router.patch(
  '/businesses/:businessId/appointments/:id/receipt/verify',
  authenticate,
  requireBusinessMembership,
 //requirePermission('APPOINTMENT_UPDATE'),
  paymentReceiptController.verifyReceipt.bind(paymentReceiptController)
);

// Public payment methods (authenticated customer can see)
/**
 * @openapi
 * /api/v1/businesses/{businessId}/payment-methods/public:
 *   get:
 *     tags: [Payment Methods]
 *     summary: List active public payment methods
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: businessId, required: true, schema: { type: string, format: uuid } }]
 *     responses:
 *       200: { description: Payment methods retrieved successfully }
 *       401: { description: Authentication required }
 *       404: { description: Business not found }
 */
router.get(
  '/businesses/:businessId/payment-methods/public',
  authenticate,
  paymentReceiptController.getPublicPaymentMethods.bind(paymentReceiptController)
);

// Payment method management (business admin)
/**
 * @openapi
 * /api/v1/businesses/{businessId}/payment-methods:
 *   post:
 *     tags: [Payment Methods]
 *     summary: Create a payment method
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: businessId, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, additionalProperties: true }
 *     responses:
 *       201: { description: Payment method created successfully }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       403: { description: Insufficient permissions }
 */
router.post(
  '/businesses/:businessId/payment-methods',
  authenticate,
  requireBusinessMembership,
  requirePermission('MANAGE_BUSINESS_SETTINGS'),
  paymentMethodController.createPaymentMethod.bind(paymentMethodController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/payment-methods:
 *   get:
 *     tags: [Payment Methods]
 *     summary: List business payment methods
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: active, schema: { type: boolean } }
 *     responses:
 *       200: { description: Payment methods retrieved successfully }
 *       401: { description: Authentication required }
 *       403: { description: Business membership required }
 */
router.get(
  '/businesses/:businessId/payment-methods',
  authenticate,
  requireBusinessMembership,
  paymentMethodController.getPaymentMethods.bind(paymentMethodController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/payment-methods/{id}:
 *   patch:
 *     tags: [Payment Methods]
 *     summary: Update a payment method
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, additionalProperties: true }
 *     responses:
 *       200: { description: Payment method updated successfully }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       403: { description: Insufficient permissions }
 *       404: { description: Payment method not found }
 */
router.patch(
  '/businesses/:businessId/payment-methods/:id',
  authenticate,
  requireBusinessMembership,
  requirePermission('MANAGE_BUSINESS_SETTINGS'),
  paymentMethodController.updatePaymentMethod.bind(paymentMethodController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/payment-methods/{id}:
 *   delete:
 *     tags: [Payment Methods]
 *     summary: Delete a payment method
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Payment method deleted successfully }
 *       401: { description: Authentication required }
 *       403: { description: Insufficient permissions }
 *       404: { description: Payment method not found }
 */
router.delete(
  '/businesses/:businessId/payment-methods/:id',
  authenticate,
  requireBusinessMembership,
  requirePermission('MANAGE_BUSINESS_SETTINGS'),
  paymentMethodController.deletePaymentMethod.bind(paymentMethodController)
);

// Appointment payment management (actual money received)
/**
 * @openapi
 * /api/v1/businesses/{businessId}/appointments/{id}/payments:
 *   post:
 *     tags: [Appointment Payments]
 *     summary: Record an appointment payment
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [paymentMethodId, amount], additionalProperties: true }
 *     responses:
 *       201: { description: Payment recorded successfully }
 *       400: { description: Invalid payment data }
 *       401: { description: Authentication required }
 *       403: { description: Insufficient permissions }
 *       404: { description: Appointment or payment method not found }
 */
router.post(
  '/businesses/:businessId/appointments/:id/payments',
  authenticate,
  requireBusinessMembership,
 //requirePermission('APPOINTMENT_UPDATE'),
  appointmentPaymentController.createPayment.bind(appointmentPaymentController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/appointments/{id}/payments:
 *   get:
 *     tags: [Appointment Payments]
 *     summary: List payments for an appointment
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Payments retrieved successfully }
 *       401: { description: Authentication required }
 *       403: { description: Insufficient permissions }
 *       404: { description: Appointment not found }
 */
router.get(
  '/businesses/:businessId/appointments/:id/payments',
  authenticate,
  requireBusinessMembership,
  //requirePermission('APPOINTMENT_VIEW'),
  appointmentPaymentController.getPaymentsForAppointment.bind(appointmentPaymentController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/payments/{paymentId}/void:
 *   patch:
 *     tags: [Appointment Payments]
 *     summary: Void an appointment payment
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: paymentId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { reason: { type: string } } }
 *     responses:
 *       200: { description: Payment voided successfully }
 *       400: { description: Invalid request }
 *       401: { description: Authentication required }
 *       403: { description: Insufficient permissions }
 *       404: { description: Payment not found }
 */
router.patch(
  '/businesses/:businessId/payments/:paymentId/void',
  authenticate,
  requireBusinessMembership,
 //requirePermission('APPOINTMENT_UPDATE'),
  appointmentPaymentController.voidPayment.bind(appointmentPaymentController)
);

export default router;