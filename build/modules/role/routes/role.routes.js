"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const role_controller_1 = require("../controllers/role.controller");
const authenticate_1 = require("../../../middlewares/authenticate");
const require_business_membership_1 = require("../../../middlewares/require-business-membership");
const require_permission_1 = require("../../../middlewares/require-permission");
const body_validator_1 = require("../../../utils/body-validator");
const auth_schemas_1 = require("../../../validation/auth.schemas");
const router = (0, express_1.Router)();
/**
 * @openapi
 * /api/v1/businesses/{businessId}/roles:
 *   get:
 *     tags: [Roles]
 *     summary: List roles for a business
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
 *         description: Roles retrieved successfully
 */
router.get('/businesses/:businessId/roles', authenticate_1.authenticate, require_business_membership_1.requireBusinessMembership, (0, require_permission_1.requirePermission)('ROLE_VIEW'), role_controller_1.roleController.getRoles.bind(role_controller_1.roleController));
/**
 * @openapi
 * /api/v1/businesses/{businessId}/roles/{roleId}:
 *   get:
 *     tags: [Roles]
 *     summary: Retrieve a specific role
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Role retrieved successfully
 */
router.get('/businesses/:businessId/roles/:roleId', authenticate_1.authenticate, require_business_membership_1.requireBusinessMembership, (0, require_permission_1.requirePermission)('ROLE_VIEW'), role_controller_1.roleController.getRole.bind(role_controller_1.roleController));
/**
 * @openapi
 * /api/v1/businesses/{businessId}/roles:
 *   post:
 *     tags: [Roles]
 *     summary: Create a new role
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Role created successfully
 */
router.post('/businesses/:businessId/roles', authenticate_1.authenticate, require_business_membership_1.requireBusinessMembership, (0, require_permission_1.requirePermission)('ROLE_CREATE'), (0, body_validator_1.bodyValidator)(auth_schemas_1.roleCreateSchema), role_controller_1.roleController.createRole.bind(role_controller_1.roleController));
/**
 * @openapi
 * /api/v1/businesses/{businessId}/roles/{roleId}:
 *   patch:
 *     tags: [Roles]
 *     summary: Update a role
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Role updated successfully
 */
router.patch('/businesses/:businessId/roles/:roleId', authenticate_1.authenticate, require_business_membership_1.requireBusinessMembership, (0, require_permission_1.requirePermission)('ROLE_UPDATE'), (0, body_validator_1.bodyValidator)(auth_schemas_1.roleUpdateSchema), role_controller_1.roleController.updateRole.bind(role_controller_1.roleController));
/**
 * @openapi
 * /api/v1/businesses/{businessId}/roles/{roleId}/permissions:
 *   put:
 *     tags: [Roles]
 *     summary: Replace role permissions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Role permissions updated
 */
router.put('/businesses/:businessId/roles/:roleId/permissions', authenticate_1.authenticate, require_business_membership_1.requireBusinessMembership, (0, require_permission_1.requirePermission)('ROLE_UPDATE'), (0, body_validator_1.bodyValidator)(auth_schemas_1.rolePermissionSchema), role_controller_1.roleController.updateRolePermissions.bind(role_controller_1.roleController));
/**
 * @openapi
 * /api/v1/businesses/{businessId}/roles/{roleId}:
 *   delete:
 *     tags: [Roles]
 *     summary: Delete a role
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Role deleted successfully
 */
router.delete('/businesses/:businessId/roles/:roleId', authenticate_1.authenticate, require_business_membership_1.requireBusinessMembership, (0, require_permission_1.requirePermission)('ROLE_DELETE'), role_controller_1.roleController.deleteRole.bind(role_controller_1.roleController));
/**
 * @openapi
 * /api/v1/businesses/{businessId}/members/{memberId}/roles:
 *   post:
 *     tags: [Roles]
 *     summary: Assign a role to a member
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
 *       201:
 *         description: Role assigned successfully
 */
router.post('/businesses/:businessId/members/:memberId/roles', authenticate_1.authenticate, require_business_membership_1.requireBusinessMembership, (0, require_permission_1.requirePermission)('ROLE_ASSIGN'), (0, body_validator_1.bodyValidator)(auth_schemas_1.roleAssignmentSchema), role_controller_1.roleController.assignRole.bind(role_controller_1.roleController));
/**
 * @openapi
 * /api/v1/businesses/{businessId}/members/{memberId}/roles/{userRoleId}:
 *   delete:
 *     tags: [Roles]
 *     summary: Remove a role assignment from a member
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
 *       - in: path
 *         name: userRoleId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Role assignment removed successfully
 */
router.delete('/businesses/:businessId/members/:memberId/roles/:userRoleId', authenticate_1.authenticate, require_business_membership_1.requireBusinessMembership, (0, require_permission_1.requirePermission)('ROLE_ASSIGN'), role_controller_1.roleController.removeRoleAssignment.bind(role_controller_1.roleController));
exports.default = router;
