import { Request, Response, NextFunction } from 'express';
import { feedbackRequestService } from '../services/feedback-request.service';
import { successResponse } from '../../../utils/api-response';

/**
 * Customer-facing feedback endpoints. The token in the URL/body is the only
 * authorization mechanism, so nothing here requires a logged-in user.
 */
export class PublicFeedbackController {
  async getForm(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;
      const data = await feedbackRequestService.getFormByToken(token);
      res.json(successResponse('Feedback form retrieved', data));
    } catch (error) {
      next(error);
    }
  }

  async submit(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await feedbackRequestService.submitFeedback(req.body);
      res.status(201).json(successResponse('Feedback submitted successfully', data));
    } catch (error) {
      next(error);
    }
  }
}

export const publicFeedbackController = new PublicFeedbackController();
