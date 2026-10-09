import { Router } from 'express';
import { feedbackAdminController } from '../controllers/feedback-admin.controller';
import { feedbackCategoryController } from '../controllers/feedback-category.controller';
import { authenticate } from '../../../middlewares/authenticate';
import { requireBusinessMembership } from '../../../middlewares/require-business-membership';
import { bodyValidator } from '../../../utils/body-validator';
import {
  feedbackCategoryCreateSchema,
  feedbackCategoryUpdateSchema,
  feedbackSettingsUpdateSchema,
} from '../validation/feedback.schemas';

const router = Router();

/**
 * @openapi
 * /api/v1/businesses/{businessId}/feedback/settings:
 *   get:
 *     tags: [Feedback]
 *     summary: Get feedback settings for a business (OWNER/ADMIN only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Feedback settings retrieved }
 *       401: { description: Authentication required }
 *       403: { description: Insufficient permissions }
 */
router.get(
  ['/businesses/:businessId/feedback/settings', '/businesses/:businessId/feedback-settings'],
  authenticate,
  requireBusinessMembership,
  feedbackAdminController.getSettings.bind(feedbackAdminController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/feedback/settings:
 *   patch:
 *     tags: [Feedback]
 *     summary: Update feedback settings for a business (OWNER/ADMIN only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               feedbackEnabled: { type: boolean }
 *               feedbackExpiryMode: { type: string, enum: [DAYS_7, DAYS_15, DAYS_30, CUSTOM, NEVER] }
 *               feedbackCustomExpiryDays: { type: integer, minimum: 1, maximum: 365, nullable: true }
 *     responses:
 *       200: { description: Feedback settings updated }
 *       400: { description: Invalid settings configuration }
 *       401: { description: Authentication required }
 *       403: { description: Insufficient permissions }
 */
router.patch(
  ['/businesses/:businessId/feedback/settings', '/businesses/:businessId/feedback-settings'],
  authenticate,
  requireBusinessMembership,
  bodyValidator(feedbackSettingsUpdateSchema),
  feedbackAdminController.updateSettings.bind(feedbackAdminController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/appointments/{appointmentId}/feedback-request:
 *   get:
 *     tags: [Feedback]
 *     summary: Get feedback request status and shareable link for an appointment
 *     description: >
 *       Authorized endpoint to view feedback status, link, and QR code for an appointment.
 *       Viewing this endpoint never creates a new request or rotates existing tokens.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: appointmentId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Appointment feedback request retrieved }
 *       401: { description: Authentication required }
 *       403: { description: Insufficient permissions or branch access denied }
 *       404: { description: Request not found }
 */
router.get(
  '/businesses/:businessId/appointments/:appointmentId/feedback-request',
  authenticate,
  requireBusinessMembership,
  feedbackAdminController.getAppointmentFeedbackRequest.bind(feedbackAdminController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/appointments/{appointmentId}/feedback-request:
 *   post:
 *     tags: [Feedback]
 *     summary: Ensure/create feedback request for a completed appointment (Idempotent)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: appointmentId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Feedback request ensured }
 *       400: { description: Appointment not eligible or feedback disabled }
 *       401: { description: Authentication required }
 *       403: { description: Insufficient permissions }
 */
router.post(
  '/businesses/:businessId/appointments/:appointmentId/feedback-request',
  authenticate,
  requireBusinessMembership,
  feedbackAdminController.ensureAppointmentFeedbackRequest.bind(feedbackAdminController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/appointments/{appointmentId}/feedback-request/revoke:
 *   post:
 *     tags: [Feedback]
 *     summary: Revoke an appointment feedback request
 *     description: Invalidate an active feedback request so the customer can no longer submit feedback.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: appointmentId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Feedback request revoked }
 *       401: { description: Authentication required }
 *       403: { description: Insufficient permissions }
 *       404: { description: Request not found }
 *       409: { description: Request already submitted }
 */
router.post(
  '/businesses/:businessId/appointments/:appointmentId/feedback-request/revoke',
  authenticate,
  requireBusinessMembership,
  feedbackAdminController.revokeAppointmentFeedbackRequest.bind(feedbackAdminController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/feedback:
 *   get:
 *     tags: [Feedback]
 *     summary: List feedback submissions for a business (OWNER/ADMIN only)
 *     description: >
 *       Private admin endpoint. Anonymous submissions are returned with
 *       `customer: null` and `appointment: null`; identifying context is never
 *       serialized. BRANCH_MANAGER and STAFF are denied.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
 *       - { in: query, name: from_date, schema: { type: string, format: date-time } }
 *       - { in: query, name: to_date, schema: { type: string, format: date-time } }
 *       - { in: query, name: branch_id, schema: { type: string, format: uuid } }
 *       - { in: query, name: category_id, schema: { type: string, format: uuid } }
 *       - { in: query, name: is_anonymous, schema: { type: boolean } }
 *     responses:
 *       200: { description: Feedback retrieved }
 *       401: { description: Authentication required }
 *       403: { description: Insufficient permissions (OWNER/ADMIN required) }
 */
router.get(
  '/businesses/:businessId/feedback',
  authenticate,
  requireBusinessMembership,
  feedbackAdminController.listFeedback.bind(feedbackAdminController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/feedback/{submissionId}:
 *   get:
 *     tags: [Feedback]
 *     summary: Get a single feedback submission (OWNER/ADMIN only)
 *     description: Applies the same server-side privacy rules as the list endpoint.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: submissionId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Feedback retrieved }
 *       401: { description: Authentication required }
 *       403: { description: Insufficient permissions (OWNER/ADMIN required) }
 *       404: { description: Feedback submission not found }
 */
router.get(
  '/businesses/:businessId/feedback/:submissionId',
  authenticate,
  requireBusinessMembership,
  feedbackAdminController.getFeedbackDetail.bind(feedbackAdminController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/feedback-categories:
 *   post:
 *     tags: [Feedback]
 *     summary: Create a feedback category (OWNER/ADMIN only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, type]
 *             properties:
 *               name: { type: string, maxLength: 100 }
 *               description: { type: string, nullable: true }
 *               type: { type: string, enum: [RATING, TEXT, BOOLEAN] }
 *               ratingScaleMin: { type: integer, nullable: true, minimum: 0, maximum: 10 }
 *               ratingScaleMax: { type: integer, nullable: true, minimum: 0, maximum: 10 }
 *               isEnabled: { type: boolean, default: true }
 *               sortOrder: { type: integer, default: 0 }
 *     responses:
 *       201: { description: Feedback category created }
 *       400: { description: Invalid category configuration }
 *       401: { description: Authentication required }
 *       403: { description: Insufficient permissions (OWNER/ADMIN required) }
 *       409: { description: Duplicate category name }
 */
router.post(
  '/businesses/:businessId/feedback-categories',
  authenticate,
  requireBusinessMembership,
  bodyValidator(feedbackCategoryCreateSchema),
  feedbackCategoryController.createCategory.bind(feedbackCategoryController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/feedback-categories:
 *   get:
 *     tags: [Feedback]
 *     summary: List feedback categories, including disabled ones (OWNER/ADMIN only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Feedback categories retrieved }
 *       401: { description: Authentication required }
 *       403: { description: Insufficient permissions (OWNER/ADMIN required) }
 */
router.get(
  '/businesses/:businessId/feedback-categories',
  authenticate,
  requireBusinessMembership,
  feedbackCategoryController.listCategories.bind(feedbackCategoryController)
);

/**
 * @openapi
 * /api/v1/feedback-categories/{categoryId}:
 *   patch:
 *     tags: [Feedback]
 *     summary: Update or disable a feedback category (OWNER/ADMIN only)
 *     description: >
 *       Categories are never deleted, only disabled via isEnabled=false. Once a
 *       category has responses its type and rating scale become immutable.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: categoryId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               description: { type: string, nullable: true }
 *               type: { type: string, enum: [RATING, TEXT, BOOLEAN] }
 *               ratingScaleMin: { type: integer, nullable: true }
 *               ratingScaleMax: { type: integer, nullable: true }
 *               isEnabled: { type: boolean }
 *               sortOrder: { type: integer }
 *     responses:
 *       200: { description: Feedback category updated }
 *       400: { description: Invalid category configuration }
 *       401: { description: Authentication required }
 *       403: { description: Insufficient permissions (OWNER/ADMIN required) }
 *       404: { description: Feedback category not found }
 *       409: { description: Duplicate name or category already has responses }
 */
router.patch(
  '/feedback-categories/:categoryId',
  authenticate,
  bodyValidator(feedbackCategoryUpdateSchema),
  feedbackCategoryController.updateCategory.bind(feedbackCategoryController)
);

export default router;
