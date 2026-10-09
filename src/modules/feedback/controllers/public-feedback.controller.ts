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
      const headerKey = req.header('idempotency-key') || req.header('Idempotency-Key');
      const idempotencyKey = (headerKey || req.body.idempotency_key || req.body.idempotencyKey) as string | undefined;

      const data = await feedbackRequestService.submitFeedback({
        ...req.body,
        idempotency_key: idempotencyKey,
      });
      res.status(201).json(successResponse('Feedback submitted successfully', data));
    } catch (error) {
      next(error);
    }
  }
}

export const publicFeedbackController = new PublicFeedbackController();
