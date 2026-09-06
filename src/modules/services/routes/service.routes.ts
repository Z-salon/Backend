import { Router } from 'express';
import { serviceController } from '../controllers/service.controller';
import { authenticate } from '../../../middlewares/authenticate';
import { requireBusinessMembership } from '../../../middlewares/require-business-membership';
import { bodyValidator } from '../../../utils/body-validator';
import {
  createServiceSchema,
  updateServiceSchema,
  assignServiceBranchSchema,
  updateServiceBranchAssignmentSchema,
} from '../validation/service.schemas';

const router = Router();

// Business-scoped service routes
/**
 * @openapi
 * /api/v1/businesses/{businessId}/services:
 *   post:
 *     tags: [Services]
 *     summary: Create a service
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [categoryId, name, durationMinutes, price, employeeAssignmentMode, branchIds]
 *             properties:
 *               categoryId: { type: string, format: uuid }
 *               name: { type: string, maxLength: 250 }
 *               description: { type: string }
 *               durationMinutes: { type: integer, minimum: 1 }
 *               price: { oneOf: [{ type: number, minimum: 0 }, { type: string }] }
 *               employeeAssignmentMode: { type: string }
 *               showPriceToCustomer: { type: boolean, default: true }
 *               depositPolicyType: { type: string, default: NONE }
 *               depositAmount: { oneOf: [{ type: number }, { type: string }], nullable: true }
 *               branchIds: { type: array, minItems: 1, items: { type: string, format: uuid } }
 *     responses:
 *       201: { description: Service created successfully }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       403: { description: Business membership required }
 */
router.post(
  '/businesses/:businessId/services',
  authenticate,
  requireBusinessMembership,
  bodyValidator(createServiceSchema),
  serviceController.createService
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/services:
 *   get:
 *     tags: [Services]
 *     summary: List services for a business
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *       - { in: query, name: categoryId, schema: { type: string, format: uuid } }
 *       - { in: query, name: status, schema: { type: string } }
 *     responses:
 *       200: { description: Services retrieved successfully }
 *       401: { description: Authentication required }
 *       403: { description: Business membership required }
 */
router.get(
  '/businesses/:businessId/services',
  authenticate,
  requireBusinessMembership,
  serviceController.getServices
);

// Direct service routes
/**
 * @openapi
 * /api/v1/services/{serviceId}:
 *   get:
 *     tags: [Services]
 *     summary: Get a service
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: serviceId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Service retrieved successfully }
 *       401: { description: Authentication required }
 *       404: { description: Service not found }
 */
router.get(
  '/services/:serviceId',
  authenticate,
  serviceController.getServiceById
);

/**
 * @openapi
 * /api/v1/services/{serviceId}:
 *   patch:
 *     tags: [Services]
 *     summary: Update a service
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: serviceId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               categoryId: { type: string, format: uuid }
 *               name: { type: string, maxLength: 250 }
 *               description: { type: string, nullable: true }
 *               durationMinutes: { type: integer, minimum: 1 }
 *               price: { oneOf: [{ type: number, minimum: 0 }, { type: string }] }
 *               employeeAssignmentMode: { type: string }
 *               showPriceToCustomer: { type: boolean }
 *               depositPolicyType: { type: string }
 *               depositAmount: { oneOf: [{ type: number }, { type: string }], nullable: true }
 *               status: { type: string }
 *     responses:
 *       200: { description: Service updated successfully }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       404: { description: Service not found }
 */
router.patch(
  '/services/:serviceId',
  authenticate,
  bodyValidator(updateServiceSchema),
  serviceController.updateService
);

// Service branch assignment routes
/**
 * @openapi
 * /api/v1/services/{serviceId}/branches:
 *   post:
 *     tags: [Services]
 *     summary: Assign a service to a branch
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: serviceId, required: true, schema: { type: string, format: uuid } }
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
 *       201: { description: Service assigned successfully }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       404: { description: Service or branch not found }
 */
router.post(
  '/services/:serviceId/branches',
  authenticate,
  bodyValidator(assignServiceBranchSchema),
  serviceController.addServiceToBranch
);

/**
 * @openapi
 * /api/v1/services/{serviceId}/branches:
 *   get:
 *     tags: [Services]
 *     summary: List branches assigned to a service
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: serviceId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Service branches retrieved successfully }
 *       401: { description: Authentication required }
 *       404: { description: Service not found }
 */
router.get(
  '/services/:serviceId/branches',
  authenticate,
  serviceController.getServiceBranches
);

/**
 * @openapi
 * /api/v1/services/{serviceId}/branches/{branchId}:
 *   patch:
 *     tags: [Services]
 *     summary: Update a service branch assignment (activate/deactivate)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: serviceId, required: true, schema: { type: string, format: uuid } }
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
 *       200: { description: Service branch assignment updated successfully }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       404: { description: Assignment not found }
 */
router.patch(
  '/services/:serviceId/branches/:branchId',
  authenticate,
  bodyValidator(updateServiceBranchAssignmentSchema),
  serviceController.updateServiceBranchAssignment
);

// Service branch configuration routes
/**
 * @openapi
 * /api/v1/services/{serviceId}/branches/{branchId}/config:
 *   patch:
 *     tags: [Services]
 *     summary: Update service branch-specific configuration (duration, price, buffer)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: serviceId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: branchId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isActive: { type: boolean }
 *               durationMinutes: { type: integer, minimum: 1, nullable: true }
 *               price: { oneOf: [{ type: number, minimum: 0 }, { type: string }], nullable: true }
 *               bufferMinutes: { type: integer, minimum: 0 }
 *     responses:
 *       200: { description: Service branch configuration updated successfully }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       404: { description: Service branch assignment not found }
 */
router.patch(
  '/services/:serviceId/branches/:branchId/config',
  authenticate,
  bodyValidator(updateServiceBranchAssignmentSchema),
  serviceController.updateServiceBranchConfig
);

/**
 * @openapi
 * /api/v1/services/{serviceId}/branches/{branchId}/effective-config:
 *   get:
 *     tags: [Services]
 *     summary: Get effective service configuration for a branch
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: serviceId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: branchId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Effective service configuration retrieved successfully }
 *       401: { description: Authentication required }
 *       404: { description: Service not available at this branch }
 */
router.get(
  '/services/:serviceId/branches/:branchId/effective-config',
  authenticate,
  serviceController.getEffectiveServiceConfig
);

export default router;
