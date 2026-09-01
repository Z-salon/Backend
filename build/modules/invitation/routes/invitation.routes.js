"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const invitation_controller_1 = require("../controllers/invitation.controller");
const authenticate_1 = require("../../../middlewares/authenticate");
const require_business_membership_1 = require("../../../middlewares/require-business-membership");
const require_permission_1 = require("../../../middlewares/require-permission");
const body_validator_1 = require("../../../utils/body-validator");
const auth_schemas_1 = require("../../../validation/auth.schemas");
const router = (0, express_1.Router)();
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
router.post('/businesses/:businessId/invitations', authenticate_1.authenticate, require_business_membership_1.requireBusinessMembership, (0, require_permission_1.requirePermission)('MEMBER_INVITE'), (0, body_validator_1.bodyValidator)(auth_schemas_1.invitationCreateSchema), invitation_controller_1.invitationController.createInvitation.bind(invitation_controller_1.invitationController));
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
router.get('/businesses/:businessId/invitations', authenticate_1.authenticate, require_business_membership_1.requireBusinessMembership, (0, require_permission_1.requirePermission)('MEMBER_VIEW'), invitation_controller_1.invitationController.getInvitations.bind(invitation_controller_1.invitationController));
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
router.delete('/businesses/:businessId/invitations/:invitationId', authenticate_1.authenticate, require_business_membership_1.requireBusinessMembership, (0, require_permission_1.requirePermission)('MEMBER_INVITE'), invitation_controller_1.invitationController.revokeInvitation.bind(invitation_controller_1.invitationController));
/**
 * @openapi
 * /api/v1/invitations/accept:
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
router.post('/invitations/accept', authenticate_1.optionalAuth, (0, body_validator_1.bodyValidator)(auth_schemas_1.invitationAcceptSchema), invitation_controller_1.invitationController.acceptInvitation.bind(invitation_controller_1.invitationController));
exports.default = router;
