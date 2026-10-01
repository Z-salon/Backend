import { Router } from 'express';
import { publicFeedbackController } from '../controllers/public-feedback.controller';
import { bodyValidator } from '../../../utils/body-validator';
import { feedbackSubmitSchema } from '../validation/feedback.schemas';

const router = Router();

/**
 * @openapi
 * /api/v1/feedback/{token}:
 *   get:
 *     tags: [Feedback]
 *     summary: Get the customer feedback form for a secure token
 *     description: >
 *       Public, customer-facing endpoint. The token is the authorization mechanism.
 *       Only enabled categories are returned. Never returns customer, appointment,
 *       branch, staff or service identifiers.
 *     parameters:
 *       - { in: path, name: token, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Feedback form retrieved }
 *       400: { description: Invalid token format }
 *       404: { description: Feedback request not found }
 *       409: { description: Feedback already submitted or appointment not completed }
 *       410: { description: Feedback link expired }
 */
router.get(
  '/:token',
  publicFeedbackController.getForm.bind(publicFeedbackController)
);

/**
 * @openapi
 * /api/v1/feedback/submit:
 *   post:
 *     tags: [Feedback]
 *     summary: Submit customer feedback for a secure token
 *     description: >
 *       Public, customer-facing endpoint. Creates one submission with its responses
 *       and marks the request SUBMITTED atomically. Each category may be answered
 *       once; the submission is rejected (409) if the request was already used and
 *       (410) if the link has expired.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, responses]
 *             properties:
 *               token: { type: string }
 *               is_anonymous: { type: boolean, default: false }
 *               responses:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [category_id]
 *                   properties:
 *                     category_id: { type: string, format: uuid }
 *                     rating_value: { type: integer }
 *                     text_response: { type: string }
 *                     boolean_response: { type: boolean }
 *     responses:
 *       201: { description: Feedback submitted }
 *       400: { description: Invalid or malformed responses }
 *       404: { description: Feedback request not found }
 *       409: { description: Feedback already submitted / appointment not completed }
 *       410: { description: Feedback link expired }
 *       422: { description: Category disabled or not part of this business }
 */
router.post(
  '/submit',
  bodyValidator(feedbackSubmitSchema),
  publicFeedbackController.submit.bind(publicFeedbackController)
);

export default router;
