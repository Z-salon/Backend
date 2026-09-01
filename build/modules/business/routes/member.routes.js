"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const member_controller_1 = require("../controllers/member.controller");
const authenticate_1 = require("../../../middlewares/authenticate");
const require_business_membership_1 = require("../../../middlewares/require-business-membership");
const require_permission_1 = require("../../../middlewares/require-permission");
const body_validator_1 = require("../../../utils/body-validator");
const auth_schemas_1 = require("../../../validation/auth.schemas");
const router = (0, express_1.Router)();
/**
 * @openapi
 * /api/v1/businesses/{businessId}/members:
 *   get:
 *     tags: [Members]
 *     summary: List members of a business
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
 *         description: Members retrieved successfully
 */
router.get('/businesses/:businessId/members', authenticate_1.authenticate, require_business_membership_1.requireBusinessMembership, (0, require_permission_1.requirePermission)('MEMBER_VIEW'), member_controller_1.memberController.getMembers.bind(member_controller_1.memberController));
/**
 * @openapi
 * /api/v1/businesses/{businessId}/members/{memberId}:
 *   get:
 *     tags: [Members]
 *     summary: Get a specific business member
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Member retrieved successfully
 */
router.get('/businesses/:businessId/members/:memberId', authenticate_1.authenticate, require_business_membership_1.requireBusinessMembership, (0, require_permission_1.requirePermission)('MEMBER_VIEW'), member_controller_1.memberController.getMember.bind(member_controller_1.memberController));
/**
 * @openapi
 * /api/v1/businesses/{businessId}/members/{memberId}:
 *   patch:
 *     tags: [Members]
 *     summary: Update a member record
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Member updated successfully
 */
router.patch('/businesses/:businessId/members/:memberId', authenticate_1.authenticate, require_business_membership_1.requireBusinessMembership, (0, require_permission_1.requirePermission)('MEMBER_UPDATE'), (0, body_validator_1.bodyValidator)(auth_schemas_1.memberUpdateSchema), member_controller_1.memberController.updateMember.bind(member_controller_1.memberController));
/**
 * @openapi
 * /api/v1/businesses/{businessId}/members/{memberId}/status:
 *   patch:
 *     tags: [Members]
 *     summary: Change member status
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Member status updated
 */
router.patch('/businesses/:businessId/members/:memberId/status', authenticate_1.authenticate, require_business_membership_1.requireBusinessMembership, (0, require_permission_1.requirePermission)('MEMBER_SUSPEND'), (0, body_validator_1.bodyValidator)(auth_schemas_1.memberStatusSchema), member_controller_1.memberController.updateMemberStatus.bind(member_controller_1.memberController));
/**
 * @openapi
 * /api/v1/businesses/{businessId}/members/{memberId}:
 *   delete:
 *     tags: [Members]
 *     summary: Remove a member from the business
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Member removed successfully
 */
router.delete('/businesses/:businessId/members/:memberId', authenticate_1.authenticate, require_business_membership_1.requireBusinessMembership, (0, require_permission_1.requirePermission)('MEMBER_REMOVE'), member_controller_1.memberController.removeMember.bind(member_controller_1.memberController));
exports.default = router;
