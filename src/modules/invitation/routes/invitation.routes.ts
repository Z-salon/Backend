import { Router } from 'express';
import { invitationController } from '../controllers/invitation.controller';
import { authenticate, optionalAuth } from '../../../middlewares/authenticate';
import { requireBusinessMembership } from '../../../middlewares/require-business-membership';
import { requirePermission } from '../../../middlewares/require-permission';
import { bodyValidator } from '../../../utils/body-validator';
import { invitationCreateSchema, invitationAcceptSchema } from '../../../validation/auth.schemas';

const router = Router();

/**
 * @openapi
 * /api/v1/businesses/{businessId}/invitations:
 *   post:
 *     tags: [Invitations]
 *     summary: Create a member invitation
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
 *             $ref: '#/components/schemas/InvitationCreateRequest'
 *     responses:
 *       201:
 *         description: Invitation created successfully
 */
router.post(
  '/businesses/:businessId/invitations',
  authenticate,
  requireBusinessMembership,
  requirePermission('MEMBER_INVITE'),
  bodyValidator(invitationCreateSchema),
  invitationController.createInvitation.bind(invitationController)
);

/**
 * @openapi
 * /api/v1/invitations/{invitationToken}/details:
 *   get:
 *     tags: [Invitations]
 *     summary: Get details of an invitation
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: invitationToken
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invitations retrieved successfully
 */
router.get(
  '/invitations/{invitationToken}/details',
  authenticate,
  requireBusinessMembership,
  requirePermission('MEMBER_INVITE'),
  invitationController.getInvitationDetails.bind(invitationController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/invitations:
 *   get:
 *     tags: [Invitations]
 *     summary: List invitations for a business
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invitations retrieved successfully
 */
router.get(
  '/businesses/:businessId/invitations',
  authenticate,
  requireBusinessMembership,
  requirePermission('MEMBER_VIEW'),
  invitationController.getInvitations.bind(invitationController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/invitations/{invitationId}:
 *   delete:
 *     tags: [Invitations]
 *     summary: Revoke an invitation
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: invitationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invitation revoked successfully
 */
router.delete(
  '/businesses/:businessId/invitations/:invitationId',
  authenticate,
  requireBusinessMembership,
  requirePermission('MEMBER_INVITE'),
  invitationController.revokeInvitation.bind(invitationController)
);

/**
 * @openapi
 * /api/v1/invitations/{invitationToken}/accept:
 *   post:
 *     tags: [Invitations]
 *     summary: Accept an invitation with a verification token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/InvitationAcceptRequest'
 *     responses:
 *       200:
 *         description: Invitation accepted successfully
 */
router.post(
  '/invitations/{invitationToken}/accept',
  optionalAuth,
  bodyValidator(invitationAcceptSchema),
  invitationController.acceptInvitation.bind(invitationController)
);

export default router;