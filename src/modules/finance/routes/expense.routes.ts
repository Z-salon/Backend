import { Router } from 'express';
import { expenseController } from '../controllers/expense.controller';
import { expenseCategoryController } from '../controllers/expense-category.controller';
import { authenticate } from '../../../middlewares/authenticate';
import { requireBusinessMembership } from '../../../middlewares/require-business-membership';
import { requireAnyPermission, requirePermission } from '../../../middlewares/require-permission';
import { bodyValidator } from '../../../utils/body-validator';
import {
  expenseCategoryCreateSchema,
  expenseCategoryUpdateSchema,
  expenseCreateSchema,
  expensePaymentSchema,
  expenseUpdateSchema,
  expenseVoidSchema,
} from '../validation/expense.schemas';

const router = Router();

const canViewFinance = requireAnyPermission(['FINANCE_VIEW', 'FINANCE_VIEW_REPORTS']);
const canRecordExpense = requirePermission('FINANCE_RECORD_EXPENSE');

// ------------------------------------------------------------------ categories

/**
 * @openapi
 * /api/v1/businesses/{businessId}/expense-categories:
 *   post:
 *     tags: [Finance]
 *     summary: Create an expense category
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       201: { description: Expense category created }
 *       403: { description: FINANCE_RECORD_EXPENSE required }
 *       409: { description: Duplicate category name }
 */
router.post(
  '/businesses/:businessId/expense-categories',
  authenticate,
  requireBusinessMembership,
  canRecordExpense,
  bodyValidator(expenseCategoryCreateSchema),
  expenseCategoryController.createCategory.bind(expenseCategoryController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/expense-categories:
 *   get:
 *     tags: [Finance]
 *     summary: List expense categories
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: includeInactive, schema: { type: boolean } }
 *     responses:
 *       200: { description: Expense categories retrieved }
 */
router.get(
  '/businesses/:businessId/expense-categories',
  authenticate,
  requireBusinessMembership,
  canViewFinance,
  expenseCategoryController.listCategories.bind(expenseCategoryController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/expense-categories/{categoryId}:
 *   patch:
 *     tags: [Finance]
 *     summary: Update or deactivate an expense category
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: categoryId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Expense category updated }
 *       403: { description: FINANCE_RECORD_EXPENSE required }
 *       404: { description: Category not found }
 */
router.patch(
  '/businesses/:businessId/expense-categories/:categoryId',
  authenticate,
  requireBusinessMembership,
  canRecordExpense,
  bodyValidator(expenseCategoryUpdateSchema),
  expenseCategoryController.updateCategory.bind(expenseCategoryController)
);

// ------------------------------------------------------------------ expenses

/**
 * @openapi
 * /api/v1/businesses/{businessId}/expenses:
 *   post:
 *     tags: [Finance]
 *     summary: Record an expense
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       201: { description: Expense created }
 *       400: { description: Invalid branch/category/amount }
 *       403: { description: FINANCE_RECORD_EXPENSE required }
 */
router.post(
  '/businesses/:businessId/expenses',
  authenticate,
  requireBusinessMembership,
  canRecordExpense,
  bodyValidator(expenseCreateSchema),
  expenseController.createExpense.bind(expenseController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/expenses:
 *   get:
 *     tags: [Finance]
 *     summary: List expenses (branch-scoped)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: from, schema: { type: string } }
 *       - { in: query, name: to, schema: { type: string } }
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *       - { in: query, name: categoryId, schema: { type: string, format: uuid } }
 *       - { in: query, name: status, schema: { type: string, enum: [UNPAID, PARTIALLY_PAID, PAID, VOIDED] } }
 *     responses:
 *       200: { description: Expenses retrieved }
 *       403: { description: Cannot access this branch }
 */
router.get(
  '/businesses/:businessId/expenses',
  authenticate,
  requireBusinessMembership,
  canViewFinance,
  expenseController.listExpenses.bind(expenseController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/expenses/{expenseId}:
 *   get:
 *     tags: [Finance]
 *     summary: Get a single expense
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: expenseId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Expense retrieved }
 *       404: { description: Expense not found }
 */
router.get(
  '/businesses/:businessId/expenses/:expenseId',
  authenticate,
  requireBusinessMembership,
  canViewFinance,
  expenseController.getExpense.bind(expenseController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/expenses/{expenseId}:
 *   patch:
 *     tags: [Finance]
 *     summary: Update an expense
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: expenseId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Expense updated }
 *       400: { description: Voided expense, or amount below amount paid }
 *       403: { description: FINANCE_RECORD_EXPENSE required }
 */
router.patch(
  '/businesses/:businessId/expenses/:expenseId',
  authenticate,
  requireBusinessMembership,
  canRecordExpense,
  bodyValidator(expenseUpdateSchema),
  expenseController.updateExpense.bind(expenseController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/expenses/{expenseId}/payments:
 *   post:
 *     tags: [Finance]
 *     summary: Record cash paid against an expense (partial or full)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: expenseId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Expense payment recorded }
 *       400: { description: Payment exceeds the remaining unpaid balance }
 */
router.post(
  '/businesses/:businessId/expenses/:expenseId/payments',
  authenticate,
  requireBusinessMembership,
  canRecordExpense,
  bodyValidator(expensePaymentSchema),
  expenseController.recordExpensePayment.bind(expenseController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/expenses/{expenseId}/void:
 *   post:
 *     tags: [Finance]
 *     summary: Void an expense (soft delete, preserved for audit)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: expenseId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Expense voided }
 */
router.post(
  '/businesses/:businessId/expenses/:expenseId/void',
  authenticate,
  requireBusinessMembership,
  canRecordExpense,
  bodyValidator(expenseVoidSchema),
  expenseController.voidExpense.bind(expenseController)
);

export default router;
