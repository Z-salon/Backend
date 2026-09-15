import { Router } from 'express';
import { branchPhoneController } from '../controllers/branch-phone.controller';
import { authenticate } from '../../../middlewares/authenticate';
import { requireBusinessMembership } from '../../../middlewares/require-business-membership';
import { requireBranchAccess } from '../../../middlewares/require-branch-access';
import { bodyValidator } from '../../../utils/body-validator';
import { branchPhoneCreateSchema, branchPhoneUpdateSchema } from '../../../validation/auth.schemas';

const router = Router();

/**
 * @openapi
 * /api/v1/businesses/{businessId}/branches/{branchId}/phones:
 *   post:
 *     tags: [Branch Phones]
 *     summary: Create a new branch phone number
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: branchId
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
 *             required: [phoneNumber]
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 pattern: '^\+[1-9]\d{1,14}$'
 *               label:
 *                 type: string
 *                 maxLength: 50
 *               isPrimary:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       201:
 *         description: Branch phone created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Branch not found
 *       409:
 *         description: Phone number already exists
 */
router.post(
  '/businesses/:businessId/branches/:branchId/phones',
  authenticate,
  requireBusinessMembership,
  requireBranchAccess('branchId'),
  bodyValidator(branchPhoneCreateSchema),
  branchPhoneController.createBranchPhone.bind(branchPhoneController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/branches/{branchId}/phones:
 *   get:
 *     tags: [Branch Phones]
 *     summary: List branch phone numbers
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Branch phones retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Access denied
 *       404:
 *         description: Branch not found
 */
router.get(
  '/businesses/:businessId/branches/:branchId/phones',
  authenticate,
  requireBusinessMembership,
  requireBranchAccess('branchId'),
  branchPhoneController.getBranchPhones.bind(branchPhoneController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/branches/{branchId}/phones/{phoneId}:
 *   patch:
 *     tags: [Branch Phones]
 *     summary: Update a branch phone number
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: phoneId
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
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 pattern: '^\+[1-9]\d{1,14}$'
 *               label:
 *                 type: string
 *                 maxLength: 50
 *               isPrimary:
 *                 type: boolean
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Branch phone updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Access denied
 *       404:
 *         description: Phone number not found
 *       409:
 *         description: Phone number already exists
 */
router.patch(
  '/businesses/:businessId/branches/:branchId/phones/:phoneId',
  authenticate,
  requireBusinessMembership,
  requireBranchAccess('branchId'),
  branchPhoneController.updateBranchPhone.bind(branchPhoneController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/branches/{branchId}/phones/{phoneId}/set-primary:
 *   post:
 *     tags: [Branch Phones]
 *     summary: Set a phone number as primary
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: phoneId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Primary phone set successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Access denied
 *       404:
 *         description: Phone number not found
 */
router.post(
  '/businesses/:businessId/branches/:branchId/phones/:phoneId/set-primary',
  authenticate,
  requireBusinessMembership,
  requireBranchAccess('branchId'),
  branchPhoneController.setPrimaryPhone.bind(branchPhoneController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/branches/{branchId}/phones/{phoneId}:
 *   delete:
 *     tags: [Branch Phones]
 *     summary: Remove a phone number from a branch
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: phoneId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Branch phone removed successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Access denied
 *       404:
 *         description: Phone number not found
 */
router.delete(
  '/businesses/:businessId/branches/:branchId/phones/:phoneId',
  authenticate,
  requireBusinessMembership,
  requireBranchAccess('branchId'),
  branchPhoneController.removeBranchPhone.bind(branchPhoneController)
);

export default router;