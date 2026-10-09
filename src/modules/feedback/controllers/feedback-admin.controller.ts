import { Request, Response, NextFunction } from 'express';
import { feedbackAdminService } from '../services/feedback-admin.service';
import { feedbackRequestService } from '../services/feedback-request.service';
import { successResponse } from '../../../utils/api-response';

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export class FeedbackAdminController {
  async listFeedback(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId } = req.params;
      const userId = req.auth!.userId;
      const { page, limit, from_date, to_date, branch_id, category_id, is_anonymous } = req.query;

      const result = await feedbackAdminService.listFeedback(businessId, userId, {
        page: page ? parseInt(page as string, 10) : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        fromDate: parseDate(from_date),
        toDate: parseDate(to_date),
        branchId: typeof branch_id === 'string' ? branch_id : undefined,
        categoryId: typeof category_id === 'string' ? category_id : undefined,
        isAnonymous: is_anonymous === undefined ? undefined : is_anonymous === 'true',
      });

      res.json({ success: true, message: 'Feedback retrieved', data: result.data, meta: result.meta });
    } catch (error) {
      next(error);
    }
  }

  async getFeedbackDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId, submissionId } = req.params;
      const userId = req.auth!.userId;
      const data = await feedbackAdminService.getFeedbackDetail(businessId, userId, submissionId);
      res.json(successResponse('Feedback retrieved', data));
    } catch (error) {
      next(error);
    }
  }

  async getSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId } = req.params;
      const userId = req.auth!.userId;
      const data = await feedbackAdminService.getFeedbackSettings(businessId, userId);
      res.json(successResponse('Feedback settings retrieved', data));
    } catch (error) {
      next(error);
    }
  }

  async updateSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId } = req.params;
      const userId = req.auth!.userId;
      const data = await feedbackAdminService.updateFeedbackSettings(businessId, userId, req.body);
      res.json(successResponse('Feedback settings updated', data));
    } catch (error) {
      next(error);
    }
  }

  async getAppointmentFeedbackRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId, appointmentId } = req.params;
      const userId = req.auth!.userId;
      const data = await feedbackRequestService.getAppointmentFeedbackRequest(businessId, appointmentId, userId);
      res.json(successResponse('Appointment feedback request retrieved', data));
    } catch (error) {
      next(error);
    }
  }

  async ensureAppointmentFeedbackRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId, appointmentId } = req.params;
      const userId = req.auth!.userId;
      await feedbackRequestService.generateFeedbackRequest(appointmentId, userId);
      const data = await feedbackRequestService.getAppointmentFeedbackRequest(businessId, appointmentId, userId);
      res.status(200).json(successResponse('Appointment feedback request ensured', data));
    } catch (error) {
      next(error);
    }
  }

  async revokeAppointmentFeedbackRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId, appointmentId } = req.params;
      const userId = req.auth!.userId;
      const data = await feedbackRequestService.revokeFeedbackRequest(businessId, appointmentId, userId);
      res.json(successResponse('Appointment feedback request revoked', data));
    } catch (error) {
      next(error);
    }
  }
}

export const feedbackAdminController = new FeedbackAdminController();
