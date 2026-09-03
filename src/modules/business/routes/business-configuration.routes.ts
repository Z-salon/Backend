import { Router } from 'express';
import { businessConfigurationController } from '../controllers/business-configuration.controller';
import { authenticate } from '../../../middlewares/authenticate';
import { requireBusinessMembership } from '../../../middlewares/require-business-membership';
import { requirePermission } from '../../../middlewares/require-permission';
import { bodyValidator } from '../../../utils/body-validator';
import { businessUpdateSchema, businessBrandingSchema } from '../../../validation/auth.schemas';

const router = Router();

/**
 * @openapi
 * /api/v1/businesses/me:
 *   get:
 *     tags: [Business Configuration]
 *     summary: Get current user's business configuration
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Business configuration retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Not a member of any business or insufficient permissions
 *       404:
 *         description: No active business membership found
 */
router.get(
  '/businesses/me',
  authenticate,
  businessConfigurationController.getMyBusiness.bind(businessConfigurationController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}:
 *   patch:
 *     tags: [Business Configuration]
 *     summary: Update business configuration (name, currency, timezone)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *               currency:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 3
 *               timezone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Business configuration updated successfully
 *       400:
 *         description: Invalid input or no changes provided
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions (Owner/Admin required)
 *       404:
 *         description: Business not found
 */
router.patch(
  '/businesses/:businessId',
  authenticate,
  requireBusinessMembership,
  requirePermission('BUSINESS_UPDATE'),
  bodyValidator(businessUpdateSchema),
  businessConfigurationController.updateBusiness.bind(businessConfigurationController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/branding:
 *   patch:
 *     tags: [Business Configuration]
 *     summary: Update business branding and public information
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               logoUrl:
 *                 type: string
 *                 format: uri
 *               coverImageUrl:
 *                 type: string
 *                 format: uri
 *               primaryColor:
 *                 type: string
 *                 pattern: '^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$'
 *               secondaryColor:
 *                 type: string
 *                 pattern: '^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$'
 *               description:
 *                 type: string
 *                 maxLength: 1000
 *               aboutUs:
 *                 type: string
 *                 maxLength: 5000
 *               address:
 *                 type: string
 *                 maxLength: 500
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               website:
 *                 type: string
 *                 format: uri
 *               facebookUrl:
 *                 type: string
 *                 format: uri
 *               instagramUrl:
 *                 type: string
 *                 format: uri
 *               telegramUrl:
 *                 type: string
 *                 format: uri
 *               tiktokUrl:
 *                 type: string
 *                 format: uri
 *     responses:
 *       200:
 *         description: Business branding updated successfully
 *       400:
 *         description: Invalid input or no changes provided
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions (Owner/Admin required)
 *       404:
 *         description: Business not found
 */
router.patch(
  '/businesses/:businessId/branding',
  authenticate,
  requireBusinessMembership,
  requirePermission('BUSINESS_MANAGE_BRANDING'),
  bodyValidator(businessBrandingSchema),
  businessConfigurationController.updateBranding.bind(businessConfigurationController)
);

export default router;