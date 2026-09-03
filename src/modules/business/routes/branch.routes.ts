import { Router } from 'express';
import { branchController } from '../controllers/branch.controller';
import { authenticate } from '../../../middlewares/authenticate';
import { requireBusinessMembership } from '../../../middlewares/require-business-membership';
import { requirePermission, requireAnyPermission } from '../../../middlewares/require-permission';
import { requireBranchAccess } from '../../../middlewares/require-branch-access';
import { bodyValidator } from '../../../utils/body-validator';
import {
  branchCreateSchema,
  branchUpdateSchema,
  branchWeeklyHoursSchema,
  branchDateOverrideCreateSchema,
  branchDateOverrideUpdateSchema,
  branchBookingConfigUpdateSchema,
} from '../../../validation/auth.schemas';

const router = Router();

// Branch Management
/**
 * @openapi
 * /api/v1/businesses/{businessId}/branches:
 *   post:
 *     tags: [Branch Management]
 *     summary: Create a new branch
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
 *               address:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 500
 *               timezone:
 *                 type: string
 *     responses:
 *       201:
 *         description: Branch created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions (Owner/Admin required)
 *       404:
 *         description: Business not found
 *       409:
 *         description: Branch name already exists
 */
router.post(
  '/businesses/:businessId/branches',
  authenticate,
  requireBusinessMembership,
  requirePermission('BRANCH_CREATE'),
  bodyValidator(branchCreateSchema),
  branchController.createBranch.bind(branchController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/branches:
 *   get:
 *     tags: [Branch Management]
 *     summary: List branches for a business
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
 *         description: Branches retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Not a member of this business
 *       404:
 *         description: Business not found
 */
router.get(
  '/businesses/:businessId/branches',
  authenticate,
  requireBusinessMembership,
  requireAnyPermission(['BRANCH_VIEW', 'BUSINESS_VIEW']),
  branchController.getBusinessBranches.bind(branchController)
);

/**
 * @openapi
 * /api/v1/branches/{branchId}:
 *   get:
 *     tags: [Branch Management]
 *     summary: Get branch details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Branch retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Access denied
 *       404:
 *         description: Branch not found
 */
router.get(
  '/branches/:branchId',
  authenticate,
  requireBranchAccess('branchId'),
  branchController.getBranch.bind(branchController)
);

/**
 * @openapi
 * /api/v1/branches/{branchId}:
 *   patch:
 *     tags: [Branch Management]
 *     summary: Update branch
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: branchId
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
 *               address:
 *                 type: string
 *                 maxLength: 500
 *               timezone:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Branch updated successfully
 *       400:
 *         description: Invalid input or no changes provided
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Branch not found
 *       409:
 *         description: Branch name already exists
 */
router.patch(
  '/branches/:branchId',
  authenticate,
  requireBranchAccess('branchId'),
  bodyValidator(branchUpdateSchema),
  branchController.updateBranch.bind(branchController)
);

// Weekly Working Hours
/**
 * @openapi
 * /api/v1/branches/{branchId}/weekly-hours:
 *   get:
 *     tags: [Branch Working Hours]
 *     summary: Get weekly working hours for a branch
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Weekly hours retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Access denied
 *       404:
 *         description: Branch not found
 */
router.get(
  '/branches/:branchId/weekly-hours',
  authenticate,
  requireBranchAccess('branchId'),
  branchController.getWeeklyHours.bind(branchController)
);

/**
 * @openapi
 * /api/v1/branches/{branchId}/weekly-hours:
 *   put:
 *     tags: [Branch Working Hours]
 *     summary: Create or replace weekly working hours for a branch
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: branchId
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
 *               days:
 *                 type: array
 *                 minItems: 7
 *                 maxItems: 7
 *                 items:
 *                   type: object
 *                   properties:
 *                     dayOfWeek:
 *                       type: integer
 *                       minimum: 0
 *                       maximum: 6
 *                     isClosed:
 *                       type: boolean
 *                       default: false
 *                     intervals:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           start:
 *                             type: string
 *                             pattern: '^([01]\d|2[0-3]):([0-5]\d)$'
 *                           end:
 *                             type: string
 *                             pattern: '^([01]\d|2[0-3]):([0-5]\d)$'
 *     responses:
 *       200:
 *         description: Weekly hours updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Branch not found
 */
router.put(
  '/branches/:branchId/weekly-hours',
  authenticate,
  requireBranchAccess('branchId'),
  bodyValidator(branchWeeklyHoursSchema),
  branchController.updateWeeklyHours.bind(branchController)
);

// Temporary Date Overrides
/**
 * @openapi
 * /api/v1/branches/{branchId}/date-overrides:
 *   post:
 *     tags: [Branch Date Overrides]
 *     summary: Create a temporary date override
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: branchId
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
 *               date:
 *                 type: string
 *                 pattern: '^\d{4}-\d{2}-\d{2}$'
 *               isClosed:
 *                 type: boolean
 *                 default: false
 *               intervals:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     start:
 *                       type: string
 *                       pattern: '^([01]\d|2[0-3]):([0-5]\d)$'
 *                     end:
 *                       type: string
 *                       pattern: '^([01]\d|2[0-3]):([0-5]\d)$'
 *     responses:
 *       201:
 *         description: Date override created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Branch not found
 *       409:
 *         description: Date override already exists
 */
router.post(
  '/branches/:branchId/date-overrides',
  authenticate,
  requireBranchAccess('branchId'),
  bodyValidator(branchDateOverrideCreateSchema),
  branchController.createDateOverride.bind(branchController)
);

/**
 * @openapi
 * /api/v1/branches/{branchId}/date-overrides:
 *   get:
 *     tags: [Branch Date Overrides]
 *     summary: Get date overrides for a branch
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: upcoming
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Date overrides retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Access denied
 *       404:
 *         description: Branch not found
 */
router.get(
  '/branches/:branchId/date-overrides',
  authenticate,
  requireBranchAccess('branchId'),
  branchController.getDateOverrides.bind(branchController)
);

/**
 * @openapi
 * /api/v1/branches/{branchId}/date-overrides/{overrideId}:
 *   patch:
 *     tags: [Branch Date Overrides]
 *     summary: Update a date override
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: overrideId
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
 *               date:
 *                 type: string
 *                 pattern: '^\d{4}-\d{2}-\d{2}$'
 *               isClosed:
 *                 type: boolean
 *               intervals:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     start:
 *                       type: string
 *                       pattern: '^([01]\d|2[0-3]):([0-5]\d)$'
 *                     end:
 *                       type: string
 *                       pattern: '^([01]\d|2[0-3]):([0-5]\d)$'
 *     responses:
 *       200:
 *         description: Date override updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Date override not found
 *       409:
 *         description: Date override already exists for this date
 */
router.patch(
  '/branches/:branchId/date-overrides/:overrideId',
  authenticate,
  requireBranchAccess('branchId'),
  bodyValidator(branchDateOverrideUpdateSchema),
  branchController.updateDateOverride.bind(branchController)
);

/**
 * @openapi
 * /api/v1/branches/{branchId}/date-overrides/{overrideId}:
 *   delete:
 *     tags: [Branch Date Overrides]
 *     summary: Delete a date override
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: overrideId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Date override deleted successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Date override not found
 */
router.delete(
  '/branches/:branchId/date-overrides/:overrideId',
  authenticate,
  requireBranchAccess('branchId'),
  branchController.deleteDateOverride.bind(branchController)
);

// Branch Booking Configuration
/**
 * @openapi
 * /api/v1/branches/{branchId}/booking-config:
 *   get:
 *     tags: [Branch Booking Configuration]
 *     summary: Get booking configuration for a branch
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Booking configuration retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Access denied
 *       404:
 *         description: Branch not found
 */
router.get(
  '/branches/:branchId/booking-config',
  authenticate,
  requireBranchAccess('branchId'),
  branchController.getBookingConfig.bind(branchController)
);

/**
 * @openapi
 * /api/v1/branches/{branchId}/booking-config:
 *   patch:
 *     tags: [Branch Booking Configuration]
 *     summary: Update booking configuration for a branch
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: branchId
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
 *               onlineBookingEnabled:
 *                 type: boolean
 *               walkInEnabled:
 *                 type: boolean
 *               bookingApprovalRequired:
 *                 type: boolean
 *               minimumAdvanceBookingMinutes:
 *                 type: integer
 *                 minimum: 0
 *               maximumAdvanceBookingDays:
 *                 type: integer
 *                 minimum: 1
 *               cancellationWindowMinutes:
 *                 type: integer
 *                 minimum: 0
 *               reschedulingEnabled:
 *                 type: boolean
 *               bookingBufferMinutes:
 *                 type: integer
 *                 minimum: 0
 *               waitlistEnabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Booking configuration updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Branch not found
 */
router.patch(
  '/branches/:branchId/booking-config',
  authenticate,
  requireBranchAccess('branchId'),
  bodyValidator(branchBookingConfigUpdateSchema),
  branchController.updateBookingConfig.bind(branchController)
);

export default router;