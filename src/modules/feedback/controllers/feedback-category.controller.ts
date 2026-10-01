import { Request, Response, NextFunction } from 'express';
import { feedbackCategoryService } from '../services/feedback-category.service';
import { successResponse } from '../../../utils/api-response';

export class FeedbackCategoryController {
  async createCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId } = req.params;
      const userId = req.auth!.userId;
      const category = await feedbackCategoryService.createCategory(businessId, userId, req.body);
      res.status(201).json(successResponse('Feedback category created', category));
    } catch (error) {
      next(error);
    }
  }

  async listCategories(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId } = req.params;
      const userId = req.auth!.userId;
      const categories = await feedbackCategoryService.listCategories(businessId, userId);
      res.json(successResponse('Feedback categories retrieved', categories));
    } catch (error) {
      next(error);
    }
  }

  async updateCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const { categoryId } = req.params;
      const userId = req.auth!.userId;
      const category = await feedbackCategoryService.updateCategory(categoryId, userId, req.body);
      res.json(successResponse('Feedback category updated', category));
    } catch (error) {
      next(error);
    }
  }
}

export const feedbackCategoryController = new FeedbackCategoryController();
