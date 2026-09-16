import { Router } from 'express';
import { serviceCategoryController } from '../controllers/service-category.controller';
import { authenticate } from '../../../middlewares/authenticate';
import { requireBusinessMembership } from '../../../middlewares/require-business-membership';
import { bodyValidator } from '../../../utils/body-validator';
import {
  createServiceCategorySchema,
  updateServiceCategorySchema,
  assignCategoryBranchSchema,
  updateCategoryBranchAssignmentSchema,
  createSampleWorkSchema,
} from '../validation/service.schemas';

const router = Router();

// Business-scoped routes
/**
 * @openapi
 * /api/v1/businesses/{businessId}/service-categories:
 *   post:
 *     tags: [Service Categories]
 *     summary: Create a service category
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, branchIds]
 *             properties:
 *               name: { type: string, maxLength: 250 }
 *               description: { type: string }
 *               branchIds: { type: array, minItems: 1, items: { type: string, format: uuid } }
 *     responses:
 *       201: { description: Service category created successfully }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       403: { description: Business membership required }
 */
router.post(
  '/businesses/:businessId/service-categories',
  authenticate,
  requireBusinessMembership,
  bodyValidator(createServiceCategorySchema),
  serviceCategoryController.createCategory
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/service-categories:
 *   get:
 *     tags: [Service Categories]
 *     summary: List service categories for a business
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *       - { in: query, name: status, schema: { type: string } }
 *       - { in: query, name: includeInactive, schema: { type: boolean } }
 *     responses:
 *       200: { description: Service categories retrieved successfully }
 *       401: { description: Authentication required }
 *       403: { description: Business membership required }
 */
router.get(
  '/businesses/:businessId/service-categories',
  authenticate,
  requireBusinessMembership,
  serviceCategoryController.getCategories
);

// Direct category routes
/**
 * @openapi
 * /api/v1/service-categories/{categoryId}:
 *   get:
 *     tags: [Service Categories]
 *     summary: Get a service category
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: categoryId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Service category retrieved successfully }
 *       401: { description: Authentication required }
 *       404: { description: Service category not found }
 */
router.get(
  '/service-categories/:categoryId',
  authenticate,
  serviceCategoryController.getCategoryById
);

/**
 * @openapi
 * /api/v1/service-categories/{categoryId}:
 *   patch:
 *     tags: [Service Categories]
 *     summary: Update a service category
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: categoryId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, maxLength: 250 }
 *               description: { type: string, nullable: true }
 *               status: { type: string }
 *     responses:
 *       200: { description: Service category updated successfully }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       404: { description: Service category not found }
 */
router.patch(
  '/service-categories/:categoryId',
  authenticate,
  bodyValidator(updateServiceCategorySchema),
  serviceCategoryController.updateCategory
);

// Category branch assignment routes
/**
 * @openapi
 * /api/v1/service-categories/{categoryId}/branches:
 *   post:
 *     tags: [Service Categories]
 *     summary: Assign a category to a branch
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: categoryId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [branchId]
 *             properties:
 *               branchId: { type: string, format: uuid }
 *     responses:
 *       201: { description: Category assigned successfully }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       404: { description: Category or branch not found }
 */
router.post(
  '/service-categories/:categoryId/branches',
  authenticate,
  bodyValidator(assignCategoryBranchSchema),
  serviceCategoryController.addCategoryToBranch
);

/**
 * @openapi
 * /api/v1/service-categories/{categoryId}/branches:
 *   get:
 *     tags: [Service Categories]
 *     summary: List branches assigned to a category
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: categoryId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Category branches retrieved successfully }
 *       401: { description: Authentication required }
 *       404: { description: Service category not found }
 */
router.get(
  '/service-categories/:categoryId/branches',
  authenticate,
  serviceCategoryController.getCategoryBranches
);

/**
 * @openapi
 * /api/v1/service-categories/{categoryId}/branches/{branchId}:
 *   patch:
 *     tags: [Service Categories]
 *     summary: Update a category branch assignment
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: categoryId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: branchId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [isActive]
 *             properties:
 *               isActive: { type: boolean }
 *     responses:
 *       200: { description: Category branch assignment updated successfully }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       404: { description: Assignment not found }
 */
router.patch(
  '/service-categories/:categoryId/branches/:branchId',
  authenticate,
  bodyValidator(updateCategoryBranchAssignmentSchema),
  serviceCategoryController.updateCategoryBranchAssignment
);

// Sample Works routes
/**
 * @openapi
 * /api/v1/service-categories/{categoryId}/sample-works:
 *   post:
 *     tags: [Service Categories]
 *     summary: Add a sample work to a category
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: categoryId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, url]
 *             properties:
 *               name: { type: string }
 *               url: { type: string, format: uri }
 *               description: { type: string, nullable: true }
 *     responses:
 *       201: { description: Sample work added successfully }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       404: { description: Service category not found }
 */
router.post(
  '/service-categories/:categoryId/sample-works',
  authenticate,
  bodyValidator(createSampleWorkSchema),
  serviceCategoryController.addSampleWork.bind(serviceCategoryController)
);

/**
 * @openapi
 * /api/v1/sample-works/{sampleWorkId}:
 *   delete:
 *     tags: [Service Categories]
 *     summary: Remove a sample work
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: sampleWorkId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Sample work removed successfully }
 *       401: { description: Authentication required }
 *       404: { description: Sample work not found }
 */
router.delete(
  '/sample-works/:sampleWorkId',
  authenticate,
  serviceCategoryController.removeSampleWork.bind(serviceCategoryController)
);

export default router;
