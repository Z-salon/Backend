import { Request, Response, NextFunction } from 'express';
import { serviceCategoryService } from '../services/service-category.service';
import { successResponse } from '../../../utils/api-response';

export class ServiceCategoryController {
  async createCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.params.businessId;
      const userId = req.auth!.userId;
      const result = await serviceCategoryService.createCategory(businessId, userId, req.body);
      res.status(201).json(successResponse('Service category created successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async getCategories(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.params.businessId;
      const userId = req.auth!.userId;
      const { branchId, status, includeInactive } = req.query;

      const result = await serviceCategoryService.getCategories(businessId, userId, {
        branchId: branchId as string,
        status: status as any,
        includeInactive: includeInactive === 'true',
      });

      res.status(200).json(successResponse('Service categories retrieved successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async getCategoryById(req: Request, res: Response, next: NextFunction) {
    try {
      const categoryId = req.params.categoryId;
      const userId = req.auth!.userId;
      const result = await serviceCategoryService.getCategoryById(categoryId, userId);
      res.status(200).json(successResponse('Service category details retrieved successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async updateCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const categoryId = req.params.categoryId;
      const userId = req.auth!.userId;
      const result = await serviceCategoryService.updateCategory(categoryId, userId, req.body);
      res.status(200).json(successResponse('Service category updated successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async addCategoryToBranch(req: Request, res: Response, next: NextFunction) {
    try {
      const categoryId = req.params.categoryId;
      const { branchId } = req.body;
      const userId = req.auth!.userId;
      const result = await serviceCategoryService.addCategoryToBranch(categoryId, userId, branchId);
      res.status(201).json(successResponse('Category assigned to branch successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async getCategoryBranches(req: Request, res: Response, next: NextFunction) {
    try {
      const categoryId = req.params.categoryId;
      const userId = req.auth!.userId;
      const result = await serviceCategoryService.getCategoryBranches(categoryId, userId);
      res.status(200).json(successResponse('Category branch assignments retrieved successfully', result));
    } catch (error) {
      next(error);
    }
  }

  async updateCategoryBranchAssignment(req: Request, res: Response, next: NextFunction) {
    try {
      const { categoryId, branchId } = req.params;
      const { isActive } = req.body;
      const userId = req.auth!.userId;
      const result = await serviceCategoryService.updateCategoryBranchAssignment(
        categoryId,
        branchId,
        userId,
        isActive
      );
      res.status(200).json(successResponse('Category branch assignment updated successfully', result));
    } catch (error) {
      next(error);
    }
  }
}

export const serviceCategoryController = new ServiceCategoryController();
