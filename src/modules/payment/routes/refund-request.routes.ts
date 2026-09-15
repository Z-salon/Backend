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
 *       - { in: query, name: status, schema: { type: string, enum: [PENDING, APPROVED, REJECTED] } }
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

export default router;
