import { Router } from 'express';
import { refundRequestController } from '../controllers/refund-request.controller';
import { authenticate } from '../../../middlewares/authenticate';
import { requireBusinessMembership } from '../../../middlewares/require-business-membership';

const router = Router();

/**
 * @openapi
 * /api/v1/businesses/{businessId}/refund-requests:
 *   get:
 *     tags: [Refunds]
 *     summary: List refund requests for a business
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: status, schema: { type: string, enum: [PENDING, APPROVED, REJECTED, COMPLETED] } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
 *     responses:
 *       200: { description: Refund requests retrieved }
 *       401: { description: Authentication required }
 *       403: { description: Business membership required }
 */
router.get(
  '/businesses/:businessId/refund-requests',
  authenticate,
  requireBusinessMembership,
  refundRequestController.listRefundRequests.bind(refundRequestController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/refund-requests/{refundRequestId}:
 *   get:
 *     tags: [Refunds]
 *     summary: Get a single refund request
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: refundRequestId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Refund request retrieved }
 *       401: { description: Authentication required }
 *       403: { description: Business membership required }
 *       404: { description: Not found }
 */
router.get(
  '/businesses/:businessId/refund-requests/:refundRequestId',
  authenticate,
  requireBusinessMembership,
  refundRequestController.getRefundRequest.bind(refundRequestController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/refund-requests/{refundRequestId}/approve:
 *   post:
 *     tags: [Refunds]
 *     summary: Approve a refund request
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: refundRequestId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Refund approved }
 *       400: { description: Cannot approve (already rejected) }
 *       401: { description: Authentication required }
 *       403: { description: Business membership required }
 *       404: { description: Refund request not found }
 */
router.post(
  '/businesses/:businessId/refund-requests/:refundRequestId/approve',
  authenticate,
  requireBusinessMembership,
  refundRequestController.approveRefund.bind(refundRequestController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/refund-requests/{refundRequestId}/reject:
 *   post:
 *     tags: [Refunds]
 *     summary: Reject a refund request
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: refundRequestId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rejectionReason: { type: string }
 *     responses:
 *       200: { description: Refund rejected }
 *       400: { description: Cannot reject (already approved) }
 *       401: { description: Authentication required }
 *       403: { description: Business membership required }
 *       404: { description: Refund request not found }
 */
router.post(
  '/businesses/:businessId/refund-requests/:refundRequestId/reject',
  authenticate,
  requireBusinessMembership,
  refundRequestController.rejectRefund.bind(refundRequestController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/appointments/{appointmentId}/refundable:
 *   get:
 *     tags: [Refunds]
 *     summary: Get the refundable balance for an appointment
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: appointmentId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Refundable balance retrieved }
 */
router.get(
  '/businesses/:businessId/appointments/:appointmentId/refundable',
  authenticate,
  requireBusinessMembership,
  refundRequestController.getRefundableAmount.bind(refundRequestController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/refund-requests:
 *   post:
 *     tags: [Refunds]
 *     summary: Create a refund request
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [appointmentId]
 *             properties:
 *               appointmentId: { type: string, format: uuid }
 *               amount: { type: number }
 *               paymentId: { type: string, format: uuid }
 *               reason: { type: string }
 *     responses:
 *       201: { description: Refund request created }
 *       400: { description: Policy/eligibility/amount invalid }
 */
router.post(
  '/businesses/:businessId/refund-requests',
  authenticate,
  requireBusinessMembership,
  refundRequestController.createRefundRequest.bind(refundRequestController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/refund-requests/{refundRequestId}/complete:
 *   post:
 *     tags: [Refunds]
 *     summary: Confirm an approved refund was transferred outside Z-Salon
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: refundRequestId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount: { type: number }
 *               reference: { type: string }
 *               note: { type: string }
 *     responses:
 *       200: { description: Refund completed }
 *       400: { description: Not approved, or amount exceeds the approved amount }
 */
router.post(
  '/businesses/:businessId/refund-requests/:refundRequestId/complete',
  authenticate,
  requireBusinessMembership,
  refundRequestController.completeRefund.bind(refundRequestController)
);

export default router;
