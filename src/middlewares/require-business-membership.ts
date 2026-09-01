import { Request, Response, NextFunction } from 'express';
import { prisma } from '../libs/prisma';
import { ApiError, ErrorCodes } from '../utils/api-error';

declare global {
  namespace Express {
    interface Request {
      businessMember?: {
        id: string;
        businessId: string;
        userId: string;
        status: string;
        roleIds: string[];
      };
    }
  }
}

export function requireBusinessMembership(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  (async () => {
    try {
      const businessId = req.params.businessId;
      
      if (!businessId) {
        throw new ApiError(400, 'Business ID is required', ErrorCodes.BAD_REQUEST);
      }

      if (!req.auth) {
        throw new ApiError(401, 'Authentication required', ErrorCodes.UNAUTHORIZED);
      }

      const membership = await prisma.businessMember.findUnique({
        where: {
          businessId_userId: {
            businessId,
            userId: req.auth.userId,
          },
        },
        select: {
          id: true,
          businessId: true,
          userId: true,
          status: true,
          userRoles: {
            select: { roleId: true },
          },
        },
      });

      if (!membership) {
        throw new ApiError(403, 'Not a member of this business', ErrorCodes.NOT_BUSINESS_MEMBER);
      }

      if (membership.status !== 'ACTIVE') {
        throw new ApiError(403, 'Membership is not active', ErrorCodes.MEMBER_STATUS_INVALID);
      }

      const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: { status: true },
      });

      if (!business || business.status !== 'ACTIVE') {
        throw new ApiError(403, 'Business is not active', ErrorCodes.BUSINESS_SUSPENDED);
      }

      req.businessMember = {
        id: membership.id,
        businessId: membership.businessId,
        userId: membership.userId,
        status: membership.status,
        roleIds: membership.userRoles.map((ur: { roleId: any; }) => ur.roleId),
      };

      next();
    } catch (error) {
      next(error);
    }
  })();
}