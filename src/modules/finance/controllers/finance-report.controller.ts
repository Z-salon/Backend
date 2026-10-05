import { Request, Response, NextFunction } from 'express';
import { financeReportService } from '../services/finance-report.service';
import { successResponse } from '../../../utils/api-response';

function parseQuery(req: Request) {
  const from = (req.query.from || req.query.from_date) as string | undefined;
  const to = (req.query.to || req.query.to_date) as string | undefined;
  const branchId = (req.query.branchId || req.query.branch_id) as string | undefined;
  const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
  return { from, to, branchId, page, limit };
}

export class FinanceReportController {
  async getSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId } = req.params;
      const userId = req.auth!.userId;
      const report = await financeReportService.getSummary(businessId, userId, parseQuery(req));
      res.json(successResponse('Financial summary retrieved', report));
    } catch (error) {
      next(error);
    }
  }

  async getRevenueReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId } = req.params;
      const userId = req.auth!.userId;
      const report = await financeReportService.getRevenueReport(businessId, userId, parseQuery(req));
      res.json(successResponse('Revenue report retrieved', report));
    } catch (error) {
      next(error);
    }
  }

  async getCollectionReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId } = req.params;
      const userId = req.auth!.userId;
      const report = await financeReportService.getCollectionReport(businessId, userId, parseQuery(req));
      res.json(successResponse('Collection report retrieved', report));
    } catch (error) {
      next(error);
    }
  }

  async getRefundReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId } = req.params;
      const userId = req.auth!.userId;
      const report = await financeReportService.getRefundReport(businessId, userId, parseQuery(req));
      res.json(successResponse('Refund report retrieved', report));
    } catch (error) {
      next(error);
    }
  }

  async getOutstandingReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId } = req.params;
      const userId = req.auth!.userId;
      const report = await financeReportService.getOutstandingReport(businessId, userId, parseQuery(req));
      res.json(successResponse('Outstanding report retrieved', report));
    } catch (error) {
      next(error);
    }
  }

  async getExpenseReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId } = req.params;
      const userId = req.auth!.userId;
      const report = await financeReportService.getExpenseReport(businessId, userId, parseQuery(req));
      res.json(successResponse('Expense report retrieved', report));
    } catch (error) {
      next(error);
    }
  }
}

export const financeReportController = new FinanceReportController();
