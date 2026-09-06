import { Request, Response, NextFunction } from 'express';
import { prisma } from '../libs/prisma';
import { ApiError, ErrorCodes } from '../utils/api-error';

export function requireBranchAccess(branchIdParam: string = 'branchId') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.auth) {
        throw new ApiError(401, 'Authentication required', ErrorCodes.UNAUTHORIZED);
      }

      if (!req.businessMember) {
        throw new ApiError(401, 'business membership required', ErrorCodes.UNAUTHORIZED);
      }



      const branchId = req.params[branchIdParam];
      
      if (!branchId) {
        throw new ApiError(400, 'Branch ID is required', ErrorCodes.BAD_REQUEST);
      }

      const { businessId, roleIds } = req.businessMember;

      const branch = await prisma.branch.findFirst({
        where: {
          id: branchId,
          businessId,
          isActive: true,
        },
        select: { id: true },
      });

      if (!branch) {
        throw new ApiError(404, 'Branch not found', ErrorCodes.NOT_FOUND);
      }

      const userRoles = await prisma.userRole.findMany({
        where: {
          businessMemberId: req.businessMember.id,
          role: {
            businessId,
            isActive: true,
          },
        },
        include: {
          branches: {
            select: { branchId: true },
          },
          role: {
            select: { id: true },
          },
        },
      });

      const hasBusinessScope = userRoles.some((ur: { scopeType: string; }) => ur.scopeType === 'BUSINESS');
      
      if (hasBusinessScope) {
        next();
        return;
      }

      const allowedBranchIds = new Set(
        userRoles
          .filter((ur: { scopeType: string; }) => ur.scopeType === 'BRANCH')
          .flatMap((ur: { branches: any[]; }) => ur.branches.map((b: { branchId: any; }) => b.branchId))
      );

      if (!allowedBranchIds.has(branchId)) {
        throw new ApiError(
          403,
          'Access denied to this branch',
          ErrorCodes.FORBIDDEN,
          { branchId }
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}