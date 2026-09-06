import { Router } from 'express';
import { customerController } from '../controllers/customer.controller';
import { authenticate } from '../../../middlewares/authenticate';
import { requireBusinessMembership } from '../../../middlewares/require-business-membership';

const router = Router();

// Business-scoped routes — require active business membership
/**
 * @openapi
 * /api/v1/businesses/{businessId}/customers/match:
 *   post:
 *     tags: [Customers]
 *     summary: Find a customer by phone number
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone]
 *             properties:
 *               phone: { type: string, example: '+251912345678' }
 *     responses:
 *       200: { description: Customer match result }
 *       400: { description: Invalid phone number }
 *       401: { description: Authentication required }
 *       403: { description: Business membership required }
 */
router.post('/businesses/:businessId/customers/match', authenticate, requireBusinessMembership, customerController.matchCustomer);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/customers:
 *   post:
 *     tags: [Customers]
 *     summary: Create a customer
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName]
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               phones:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [phone]
 *                   properties:
 *                     phone: { type: string, example: '+251912345678' }
 *                     isPrimary: { type: boolean, default: false }
 *     responses:
 *       201: { description: Customer created successfully }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       403: { description: Business membership required }
 */
router.post('/businesses/:businessId/customers', authenticate, requireBusinessMembership, customerController.createCustomer);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/customers:
 *   get:
 *     tags: [Customers]
 *     summary: List customers for a business
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: q, schema: { type: string } }
 *       - { in: query, name: phone, schema: { type: string } }
 *       - { in: query, name: status, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *     responses:
 *       200: { description: Customers retrieved successfully }
 *       401: { description: Authentication required }
 *       403: { description: Business membership required }
 */
router.get('/businesses/:businessId/customers', authenticate, requireBusinessMembership, customerController.getCustomers);

// Customer-scoped routes — auth only; services resolve membership internally from customer record
/**
 * @openapi
 * /api/v1/customers/{customerId}:
 *   get:
 *     tags: [Customers]
 *     summary: Get customer details
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: customerId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Customer retrieved successfully }
 *       401: { description: Authentication required }
 *       404: { description: Customer not found }
 */
router.get('/customers/:customerId', authenticate, customerController.getCustomer);

/**
 * @openapi
 * /api/v1/customers/{customerId}:
 *   patch:
 *     tags: [Customers]
 *     summary: Update customer details
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: customerId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *     responses:
 *       200: { description: Customer updated successfully }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       404: { description: Customer not found }
 */
router.patch('/customers/:customerId', authenticate, customerController.updateCustomer);

/**
 * @openapi
 * /api/v1/customers/{customerId}/archive:
 *   patch:
 *     tags: [Customers]
 *     summary: Archive a customer
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: customerId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Customer archived successfully }
 *       401: { description: Authentication required }
 *       404: { description: Customer not found }
 */
router.patch('/customers/:customerId/archive', authenticate, customerController.archiveCustomer);

// Phone management
/**
 * @openapi
 * /api/v1/customers/{customerId}/phones:
 *   post:
 *     tags: [Customers]
 *     summary: Add a phone number to a customer
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: customerId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone]
 *             properties:
 *               phone: { type: string, example: '+251912345678' }
 *               isPrimary: { type: boolean, default: false }
 *     responses:
 *       201: { description: Phone added successfully }
 *       400: { description: Invalid phone number }
 *       401: { description: Authentication required }
 *       404: { description: Customer not found }
 */
router.post('/customers/:customerId/phones', authenticate, customerController.addPhone);

/**
 * @openapi
 * /api/v1/customers/{customerId}/phones/{phoneId}:
 *   delete:
 *     tags: [Customers]
 *     summary: Delete a customer phone number
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: customerId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: phoneId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Phone deleted successfully }
 *       401: { description: Authentication required }
 *       404: { description: Customer or phone not found }
 */
router.delete('/customers/:customerId/phones/:phoneId', authenticate, customerController.deletePhone);

/**
 * @openapi
 * /api/v1/customers/{customerId}/phones/{phoneId}/primary:
 *   patch:
 *     tags: [Customers]
 *     summary: Set a customer phone as primary
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: customerId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: phoneId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Primary phone updated successfully }
 *       401: { description: Authentication required }
 *       404: { description: Customer or phone not found }
 */
router.patch('/customers/:customerId/phones/:phoneId/primary', authenticate, customerController.setPrimaryPhone);

export default router;
