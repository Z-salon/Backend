import { Router } from 'express';
import { roleController } from '../controllers/role.controller';
import { authenticate } from '../../../middlewares/authenticate';
import { requireBusinessMembership } from '../../../middlewares/require-business-membership';
import { requirePermission } from '../../../middlewares/require-permission';
import { bodyValidator } from '../../../utils/body-validator';
import { roleCreateSchema, roleUpdateSchema, rolePermissionSchema, roleAssignmentSchema } from '../../../validation/auth.schemas';

const router = Router();

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
router.get(
  '/businesses/:businessId/roles',
  authenticate,
  requireBusinessMembership,
  requirePermission('ROLE_VIEW'),
  roleController.getRoles.bind(roleController)
);

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
router.get(
  '/businesses/:businessId/roles/:roleId',
  authenticate,
  requireBusinessMembership,
  requirePermission('ROLE_VIEW'),
  roleController.getRole.bind(roleController)
);

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
router.post(
  '/businesses/:businessId/roles',
  authenticate,
  requireBusinessMembership,
  requirePermission('ROLE_CREATE'),
  bodyValidator(roleCreateSchema),
  roleController.createRole.bind(roleController)
);

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
router.patch(
  '/businesses/:businessId/roles/:roleId',
  authenticate,
  requireBusinessMembership,
  requirePermission('ROLE_UPDATE'),
  bodyValidator(roleUpdateSchema),
  roleController.updateRole.bind(roleController)
);

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
router.put(
  '/businesses/:businessId/roles/:roleId/permissions',
  authenticate,
  requireBusinessMembership,
  requirePermission('ROLE_UPDATE'),
  bodyValidator(rolePermissionSchema),
  roleController.updateRolePermissions.bind(roleController)
);

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
router.delete(
  '/businesses/:businessId/roles/:roleId',
  authenticate,
  requireBusinessMembership,
  requirePermission('ROLE_DELETE'),
  roleController.deleteRole.bind(roleController)
);

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
router.post(
  '/businesses/:businessId/members/:memberId/roles',
  authenticate,
  requireBusinessMembership,
  requirePermission('ROLE_ASSIGN'),
  bodyValidator(roleAssignmentSchema),
  roleController.assignRole.bind(roleController)
);

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
router.delete(
  '/businesses/:businessId/members/:memberId/roles/:userRoleId',
  authenticate,
  requireBusinessMembership,
  requirePermission('ROLE_ASSIGN'),
  roleController.removeRoleAssignment.bind(roleController)
);

export default router;