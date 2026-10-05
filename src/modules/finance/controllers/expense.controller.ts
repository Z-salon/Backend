import { Request, Response, NextFunction } from 'express';
import { expenseService } from '../services/expense.service';
import { successResponse } from '../../../utils/api-response';
import { ExpenseStatus } from '@prisma/client';

export class ExpenseController {
  async createExpense(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId } = req.params;
      const userId = req.auth!.userId;
      const expense = await expenseService.createExpense(businessId, userId, req.body);
      res.status(201).json(successResponse('Expense created', expense));
    } catch (error) {
      next(error);
    }
  }

  async listExpenses(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId } = req.params;
      const userId = req.auth!.userId;
      const { from, to, branchId, categoryId, status, page, limit } = req.query;

      const result = await expenseService.listExpenses(businessId, userId, {
        from: from as string | undefined,
        to: to as string | undefined,
        branchId: branchId as string | undefined,
        categoryId: categoryId as string | undefined,
        status: status as ExpenseStatus | undefined,
        page: page ? parseInt(page as string, 10) : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
      });

      res.json({ success: true, data: result.data, meta: result.meta });
    } catch (error) {
      next(error);
    }
  }

  async getExpense(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId, expenseId } = req.params;
      const userId = req.auth!.userId;
      const expense = await expenseService.getExpense(expenseId, businessId, userId);
      res.json(successResponse('Expense retrieved', expense));
    } catch (error) {
      next(error);
    }
  }

  async updateExpense(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId, expenseId } = req.params;
      const userId = req.auth!.userId;
      const expense = await expenseService.updateExpense(expenseId, businessId, userId, req.body);
      res.json(successResponse('Expense updated', expense));
    } catch (error) {
      next(error);
    }
  }

  async recordExpensePayment(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId, expenseId } = req.params;
      const userId = req.auth!.userId;
      const expense = await expenseService.recordExpensePayment(expenseId, businessId, userId, req.body);
      res.json(successResponse('Expense payment recorded', expense));
    } catch (error) {
      next(error);
    }
  }

  async voidExpense(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId, expenseId } = req.params;
      const userId = req.auth!.userId;
      const expense = await expenseService.voidExpense(expenseId, businessId, userId, req.body?.reason);
      res.json(successResponse('Expense voided', expense));
    } catch (error) {
      next(error);
    }
  }
}

export const expenseController = new ExpenseController();
