import { Request, Response, NextFunction } from 'express';
import { invitationService } from '../services/invitation.service';
import { successResponse } from '../../../utils/api-response';

export class InvitationController {
  async createInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phone, roles } = req.body;
      const businessId = req.params.businessId;
      const invitedByMemberId = req.businessMember!.id;

      const invitation = await invitationService.createInvitation({
        businessId,
        invitedByMemberId,
        phone,
        roles,
      });

      res.status(201).json(successResponse('Invitation sent successfully', invitation));
    } catch (error) {
      next(error);
    }
  }

  async getInvitationDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {

      const { invitationToken } = req.params;

      const invitationDetails = await invitationService.getInvitationDetails(invitationToken);

      res.json(successResponse('Invitation details retrieved', invitationDetails));
    } catch (error) {
      next(error);
    }
  }

  async acceptInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {verificationToken } = req.body;
      const authUserId = req.auth?.userId;
      const invitationToken = req.params.invitationToken;

      const result = await invitationService.acceptInvitation(invitationToken, authUserId, verificationToken);

      res.json(successResponse('Invitation accepted successfully', result));
    } catch (error) {
      next(error);
    }
  }


  async getInvitations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const { status } = req.query;

      const invitations = await invitationService.getInvitations(businessId, status as string);

      res.json(successResponse('Invitations retrieved', invitations));
    } catch (error) {
      next(error);
    }
  }

  async revokeInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { businessId, invitationId } = req.params;

      await invitationService.revokeInvitation(invitationId, businessId);

      res.json(successResponse('Invitation revoked'));
    } catch (error) {
      next(error);
    }
  }
}

export const invitationController = new InvitationController();