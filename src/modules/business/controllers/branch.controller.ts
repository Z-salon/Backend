import { Request, Response, NextFunction } from 'express';
import { branchService } from '../services/branch.service';
import { successResponse } from '../../../utils/api-response';

export class BranchController {
  async createBranch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
        return;
      }

      const { businessId } = req.params;
      const input = req.body;

      const branch = await branchService.createBranch(businessId, req.auth.userId, input);

      res.status(201).json(successResponse('Branch created successfully', branch));
    } catch (error) {
      next(error);
    }
  }

  async getBusinessBranches(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
        return;
      }

      const { businessId } = req.params;
      const branches = await branchService.getBusinessBranches(businessId, req.auth.userId);

      res.json(successResponse('Branches retrieved successfully', branches));
    } catch (error) {
      next(error);
    }
  }

  async getBranch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
        return;
      }

      const { branchId } = req.params;
      const branch = await branchService.getBranch(branchId, req.auth.userId);

      res.json(successResponse('Branch retrieved successfully', branch));
    } catch (error) {
      next(error);
    }
  }

  async updateBranch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
        return;
      }

      const { branchId } = req.params;
      const input = req.body;

      const branch = await branchService.updateBranch(branchId, req.auth.userId, input);

      res.json(successResponse('Branch updated successfully', branch));
    } catch (error) {
      next(error);
    }
  }

  async getWeeklyHours(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
        return;
      }

      const { branchId } = req.params;
      const hours = await branchService.getWeeklyHours(branchId, req.auth.userId);

      res.json(successResponse('Weekly hours retrieved successfully', hours));
    } catch (error) {
      next(error);
    }
  }

  async updateWeeklyHours(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
        return;
      }

      const { branchId } = req.params;
      const input = req.body;

      const hours = await branchService.updateWeeklyHours(branchId, req.auth.userId, input);

      res.json(successResponse('Weekly hours updated successfully', hours));
    } catch (error) {
      next(error);
    }
  }

  async createDateOverride(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
        return;
      }

      const { branchId } = req.params;
      const input = req.body;

      const override = await branchService.createDateOverride(branchId, req.auth.userId, input);

      res.status(201).json(successResponse('Date override created successfully', override));
    } catch (error) {
      next(error);
    }
  }

  async getDateOverrides(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
        return;
      }

      const { branchId } = req.params;
      const { from, to, upcoming } = req.query;

      const options: { from?: Date; to?: Date; upcoming?: boolean } = {};
      if (from) options.from = new Date(from as string);
      if (to) options.to = new Date(to as string);
      if (upcoming === 'true') options.upcoming = true;

      const overrides = await branchService.getDateOverrides(branchId, req.auth.userId, options);

      res.json(successResponse('Date overrides retrieved successfully', overrides));
    } catch (error) {
      next(error);
    }
  }

  async updateDateOverride(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
        return;
      }

      const { branchId, overrideId } = req.params;
      const input = req.body;

      const override = await branchService.updateDateOverride(branchId, req.auth.userId, overrideId, input);

      res.json(successResponse('Date override updated successfully', override));
    } catch (error) {
      next(error);
    }
  }

  async deleteDateOverride(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
        return;
      }

      const { branchId, overrideId } = req.params;

      await branchService.deleteDateOverride(branchId, req.auth.userId, overrideId);

      res.json(successResponse('Date override deleted successfully'));
    } catch (error) {
      next(error);
    }
  }

  async getBookingConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
        return;
      }

      const { branchId } = req.params;
      const config = await branchService.getBookingConfig(branchId, req.auth.userId);

      res.json(successResponse('Booking configuration retrieved successfully', config));
    } catch (error) {
      next(error);
    }
  }

  async updateBookingConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
        return;
      }

      const { branchId } = req.params;
      const input = req.body;

      const config = await branchService.updateBookingConfig(branchId, req.auth.userId, input);

      res.json(successResponse('Booking configuration updated successfully', config));
    } catch (error) {
      next(error);
    }
  }
}

export const branchController = new BranchController();