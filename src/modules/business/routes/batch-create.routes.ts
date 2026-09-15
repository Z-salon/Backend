import { Router } from 'express';
import { batchCreateController } from '../controllers/batch-create.controller';
import { authenticate } from '../../../middlewares/authenticate';
import { requireBusinessMembership } from '../../../middlewares/require-business-membership';
import { requirePermission } from '../../../middlewares/require-permission';
import { bodyValidator } from '../../../utils/body-validator';
import { branchCreateSchema } from '../../../validation/auth.schemas';

const router = Router();

/**
 * @openapi
 * /api/v1/businesses/{businessId}/branches/batch:
 *   post:
 *     tags: [Batch Create]
 *     summary: Batch create branches
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items]
 *             properties:
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 50
 *                 items:
 *                   type: object
 *                   required: [name, address]
 *                   properties:
 *                     name:
 *                       type: string
 *                       minLength: 1
 *                       maxLength: 100
 *                     address:
 *                       type: string
 *                       minLength: 1
 *                       maxLength: 500
 *                     timezone:
 *                       type: string
 *     responses:
 *       201:
 *         description: Branches created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions (Owner/Admin required)
 *       404:
 *         description: Business not found
 *       409:
 *         description: Duplicate branch name
 */
router.post(
  '/businesses/:businessId/branches/batch',
  authenticate,
  requireBusinessMembership,
  // requirePermission('BRANCH_CREATE'),
  batchCreateController.createBranches.bind(batchCreateController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/services/batch:
 *   post:
 *     tags: [Batch Create]
 *     summary: Batch create services
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items]
 *             properties:
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 50
 *                 items:
 *                   type: object
 *                   required: [categoryId, name, durationMinutes, price, employeeAssignmentMode, branchIds]
 *                   properties:
 *                     categoryId:
 *                       type: string
 *                       format: uuid
 *                     name:
 *                       type: string
 *                       minLength: 1
 *                       maxLength: 100
 *                     description:
 *                       type: string
 *                       maxLength: 500
 *                     durationMinutes:
 *                       type: integer
 *                       minimum: 1
 *                     price:
 *                       type: number
 *                       minimum: 0
 *                     employeeAssignmentMode:
 *                       type: string
 *                       enum: [CUSTOMER_CHOOSES, SALON_ASSIGNS, ANY_AVAILABLE]
 *                     showPriceToCustomer:
 *                       type: boolean
 *                       default: true
 *                     depositPolicyType:
 *                       type: string
 *                       enum: [NONE, FIXED, PERCENTAGE, FULL]
 *                       default: NONE
 *                     depositAmount:
 *                       type: number
 *                       minimum: 0
 *                       nullable: true
 *                     branchIds:
 *                       type: array
 *                       minItems: 1
 *                       items:
 *                         type: string
 *                         format: uuid
 *     responses:
 *       201:
 *         description: Services created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions (Owner/Admin required)
 *       404:
 *         description: Business, category, or branch not found
 *       409:
 *         description: Duplicate service name
 */
router.post(
  '/businesses/:businessId/services/batch',
  authenticate,
  requireBusinessMembership,
  // requirePermission('SERVICE_CREATE'),
  batchCreateController.createServices.bind(batchCreateController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/staff/batch:
 *   post:
 *     tags: [Batch Create]
 *     summary: Batch create staff members
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items]
 *             properties:
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 50
 *                 items:
 *                   type: object
 *                   required: [branchId, firstName, lastName]
 *                   properties:
 *                     branchId:
 *                       type: string
 *                       format: uuid
 *                     firstName:
 *                       type: string
 *                       minLength: 1
 *                       maxLength: 50
 *                     lastName:
 *                       type: string
 *                       minLength: 1
 *                       maxLength: 50
 *                     email:
 *                       type: string
 *                       format: email
 *                     phone:
 *                       type: string
 *                     title:
 *                       type: string
 *                       maxLength: 50
 *                     bio:
 *                       type: string
 *                       maxLength: 500
 *                     serviceIds:
 *                       type: array
 *                       items:
 *                         type: string
 *                         format: uuid
 *                     categoryIds:
 *                       type: array
 *                       items:
 *                         type: string
 *                         format: uuid
 *     responses:
 *       201:
 *         description: Staff created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions (Owner/Admin required)
 *       404:
 *         description: Business, branch, service, or category not found
 *       409:
 *         description: Duplicate
 */
router.post(
  '/businesses/:businessId/staff/batch',
  authenticate,
  requireBusinessMembership,
  // requirePermission('STAFF_CREATE'),
  batchCreateController.createStaff.bind(batchCreateController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/payment-methods/batch:
 *   post:
 *     tags: [Batch Create]
 *     summary: Batch create payment methods
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items]
 *             properties:
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 50
 *                 items:
 *                   type: object
 *                   required: [name, type]
 *                   properties:
 *                     name:
 *                       type: string
 *                       minLength: 1
 *                       maxLength: 100
 *                     type:
 *                       type: string
 *                       enum: [CASH, CARD, MOBILE_MONEY, BANK_TRANSFER, OTHER]
 *                     accountName:
 *                       type: string
 *                       maxLength: 100
 *                     accountNumber:
 *                       type: string
 *                       maxLength: 50
 *                     instructions:
 *                       type: string
 *                       maxLength: 500
 *                     isActive:
 *                       type: boolean
 *                       default: true
 *                     displayOrder:
 *                       type: integer
 *                       minimum: 0
 *     responses:
 *       201:
 *         description: Payment methods created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions (Owner/Admin required)
 *       404:
 *         description: Business not found
 *       409:
 *         description: Duplicate payment method name
 */
router.post(
  '/businesses/:businessId/payment-methods/batch',
  authenticate,
  requireBusinessMembership,
  // requirePermission('MANAGE_PAYMENT_METHODS'),
  batchCreateController.createPaymentMethods.bind(batchCreateController)
);

export default router;