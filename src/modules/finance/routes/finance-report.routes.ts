import { Router } from 'express';
import { financeReportController } from '../controllers/finance-report.controller';
import { authenticate } from '../../../middlewares/authenticate';
import { requireBusinessMembership } from '../../../middlewares/require-business-membership';
import { requireAnyPermission } from '../../../middlewares/require-permission';

const router = Router();

/** Anyone who may see finance (or reports) can read operational reports. */
const canViewReports = requireAnyPermission(['FINANCE_VIEW', 'FINANCE_VIEW_REPORTS', 'REPORT_VIEW']);



/**
 * @openapi
 * /api/v1/businesses/{businessId}/finance/summary:
 *   get:
 *     tags: [Finance]
 *     summary: Financial summary with branch/service/payment-method/expense-category/date breakdowns
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: from, schema: { type: string, description: 'ISO date or datetime; date-only spans whole days in the business timezone' } }
 *       - { in: query, name: to, schema: { type: string } }
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Financial summary retrieved }
 *       403: { description: Not authorized for this branch or finance permission missing }
 */
router.get(
  '/businesses/:businessId/finance/summary',
  authenticate,
  requireBusinessMembership,
  canViewReports,
  financeReportController.getSummary.bind(financeReportController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/finance/revenue:
 *   get:
 *     tags: [Finance]
 *     summary: Revenue report (earned amount, broken down by date/branch/service)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: from, schema: { type: string, description: 'ISO date or datetime; date-only spans whole days in the business timezone' } }
 *       - { in: query, name: to, schema: { type: string } }
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Revenue report retrieved }
 */
router.get(
  '/businesses/:businessId/finance/revenue',
  authenticate,
  requireBusinessMembership,
  canViewReports,
  financeReportController.getRevenueReport.bind(financeReportController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/finance/collections:
 *   get:
 *     tags: [Finance]
 *     summary: Payment collection report (verified payments minus completed refunds)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: from, schema: { type: string, description: 'ISO date or datetime; date-only spans whole days in the business timezone' } }
 *       - { in: query, name: to, schema: { type: string } }
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Collection report retrieved }
 */
router.get(
  '/businesses/:businessId/finance/collections',
  authenticate,
  requireBusinessMembership,
  canViewReports,
  financeReportController.getCollectionReport.bind(financeReportController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/finance/refunds:
 *   get:
 *     tags: [Finance]
 *     summary: Refund report (requested vs approved vs completed vs rejected)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: from, schema: { type: string, description: 'ISO date or datetime; date-only spans whole days in the business timezone' } }
 *       - { in: query, name: to, schema: { type: string } }
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Refund report retrieved }
 */
router.get(
  '/businesses/:businessId/finance/refunds',
  authenticate,
  requireBusinessMembership,
  canViewReports,
  financeReportController.getRefundReport.bind(financeReportController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/finance/outstanding:
 *   get:
 *     tags: [Finance]
 *     summary: Current outstanding balance owed by customers, per appointment
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
 *     responses:
 *       200: { description: Outstanding report retrieved }
 */
router.get(
  '/businesses/:businessId/finance/outstanding',
  authenticate,
  requireBusinessMembership,
  canViewReports,
  financeReportController.getOutstandingReport.bind(financeReportController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/finance/expenses:
 *   get:
 *     tags: [Finance]
 *     summary: Expense report (incurred vs paid) broken down by category/branch/date
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: from, schema: { type: string, description: 'ISO date or datetime; date-only spans whole days in the business timezone' } }
 *       - { in: query, name: to, schema: { type: string } }
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Expense report retrieved }
 */
router.get(
  '/businesses/:businessId/finance/expenses',
  authenticate,
  requireBusinessMembership,
  canViewReports,
  financeReportController.getExpenseReport.bind(financeReportController)
);

export default router;
