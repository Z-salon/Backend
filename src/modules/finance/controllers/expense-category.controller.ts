import { Request, Response, NextFunction } from 'express';
import { expenseCategoryService } from '../services/expense-category.service';
import { successResponse } from '../../../utils/api-response';

export class ExpenseCategoryController {
  async createCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId } = req.params;
      const userId = req.auth!.userId;
      const category = await expenseCategoryService.createCategory(businessId, userId, req.body);
      res.status(201).json(successResponse('Expense category created', category));
    } catch (error) {
      next(error);
    }
  }

  async listCategories(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId } = req.params;
      const includeInactive = req.query.includeInactive === 'true';
      const categories = await expenseCategoryService.listCategories(businessId, { includeInactive });
      res.json(successResponse('Expense categories retrieved', categories));
    } catch (error) {
      next(error);
    }
  }

  async updateCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId, categoryId } = req.params;
      const userId = req.auth!.userId;
      const category = await expenseCategoryService.updateCategory(categoryId, businessId, userId, req.body);
      res.json(successResponse('Expense category updated', category));
    } catch (error) {
      next(error);
    }
  }
}

export const expenseCategoryController = new ExpenseCategoryController();
