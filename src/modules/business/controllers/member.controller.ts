import { Request, Response, NextFunction } from 'express';
import { memberService } from '../services/member.service';
import { successResponse } from '../../../utils/api-response';

export class MemberController {
  async getMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const members = await memberService.getMembers(businessId);

      res.json(successResponse('Members retrieved', members));
    } catch (error) {
      next(error);
    }
  }

  async getMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { businessId, memberId } = req.params;
      const member = await memberService.getMember(businessId, memberId);

      res.json(successResponse('Member retrieved', member));
    } catch (error) {
      next(error);
    }
  }

  async updateMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { businessId, memberId } = req.params;
      const member = await memberService.updateMember(businessId, memberId, req.body);

      res.json(successResponse('Member updated', member));
    } catch (error) {
      next(error);
    }
  }

  async updateMemberStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { businessId, memberId } = req.params;
      const { status } = req.body;
      const currentUserId = req.auth!.userId;

      const member = await memberService.updateMemberStatus(businessId, memberId, status, currentUserId);

      res.json(successResponse('Member status updated', member));
    } catch (error) {
      next(error);
    }
  }

  async removeMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { businessId, memberId } = req.params;
      const currentUserId = req.auth!.userId;

      const member = await memberService.removeMember(businessId, memberId, currentUserId);

      res.json(successResponse('Member removed', member));
    } catch (error) {
      next(error);
    }
  }
}

export const memberController = new MemberController();