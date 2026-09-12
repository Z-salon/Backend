import { Router } from 'express';
import { paymentMethodController } from '../controllers/payment-method.controller';
import { authenticate } from '../../../middlewares/authenticate';

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/payment-methods:
 *   post:
 *     tags: [Payment Methods]
 *     summary: Create a payment method
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: businessId, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: 
 *             type: object
 *             properties: 
 *               name: { type: string , required: true }
 *               type: { type: string , enum: [CASH, BANK_TRANSFER, MOBILE_MONEY], required: true }
 *               accountName: { type: string }
 *               accountNumber: { type: string }
 *               instructions: { type: string }
 *               isActive: { type: boolean }
 *               displayOrder: { type: number }
 *     responses:
 *       201: { description: Payment method created successfully }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       403: { description: Insufficient permissions }
 */
router.post('/', paymentMethodController.createPaymentMethod);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/payment-methods:
 *   get:
 *     tags: [Payment Methods]
 *     summary: List payment methods
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: active, schema: { type: boolean } }
 *     responses:
 *       200: { description: Payment methods retrieved successfully }
 *       401: { description: Authentication required }
 *       403: { description: Business membership required }
 */
router.get('/', paymentMethodController.getPaymentMethods);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/payment-methods/{id}:
 *   patch:
 *     tags: [Payment Methods]
 *     summary: Update a payment method
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, additionalProperties: true }
 *     responses:
 *       200: { description: Payment method updated successfully }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       403: { description: Insufficient permissions }
 *       404: { description: Payment method not found }
 */
router.patch('/:id', paymentMethodController.updatePaymentMethod);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/payment-methods/{id}:
 *   delete:
 *     tags: [Payment Methods]
 *     summary: Delete a payment method
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Payment method deleted successfully }
 *       401: { description: Authentication required }
 *       403: { description: Insufficient permissions }
 *       404: { description: Payment method not found }
 */
router.delete('/:id', paymentMethodController.deletePaymentMethod);

export default router;
