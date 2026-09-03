import { Request, Response, NextFunction } from 'express';
import { businessConfigurationService } from '../services/business-configuration.service';
import { successResponse } from '../../../utils/api-response';

export class BusinessConfigurationController {
  async getMyBusiness(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
        return;
      }

      const business = await businessConfigurationService.getMyBusiness(req.auth.userId);

      res.json(successResponse('Business configuration retrieved', business));
    } catch (error) {
      next(error);
    }
  }

  async updateBusiness(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
        return;
      }

      const { businessId } = req.params;
      const input = req.body;

      const business = await businessConfigurationService.updateBusiness(businessId, req.auth.userId, input);

      res.json(successResponse('Business configuration updated', business));
    } catch (error) {
      next(error);
    }
  }

  async updateBranding(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
        return;
      }

      const { businessId } = req.params;
      const input = req.body;

      const business = await businessConfigurationService.updateBranding(businessId, req.auth.userId, input);

      res.json(successResponse('Business branding updated', business));
    } catch (error) {
      next(error);
    }
  }
}

export const businessConfigurationController = new BusinessConfigurationController();