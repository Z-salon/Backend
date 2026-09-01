import { Request, Response, NextFunction } from 'express';
import { prisma } from '../libs/prisma';
import { ApiError, ErrorCodes } from '../utils/api-error';

export function requirePermission(permissionCode: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.auth || !req.businessMember) {
        throw new ApiError(401, 'Authentication and business membership required', ErrorCodes.UNAUTHORIZED);
      }

      const { businessId, roleIds } = req.businessMember;

      const rolesWithPermissions = await prisma.role.findMany({
        where: {
          id: { in: roleIds },
          businessId,
          isActive: true,
        },
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      });

      const hasPermission = rolesWithPermissions.some((role: { permissions: any[]; }) =>
        role.permissions.some((rp: { permission: { code: string; }; }) => rp.permission.code === permissionCode)
      );

      if (!hasPermission) {
        throw new ApiError(
          403,
          `Permission '${permissionCode}' required`,
          ErrorCodes.INSUFFICIENT_PERMISSIONS,
          { permission: permissionCode }
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireAnyPermission(permissionCodes: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.auth || !req.businessMember) {
        throw new ApiError(401, 'Authentication and business membership required', ErrorCodes.UNAUTHORIZED);
      }

      const { businessId, roleIds } = req.businessMember;

      const rolesWithPermissions = await prisma.role.findMany({
        where: {
          id: { in: roleIds },
          businessId,
          isActive: true,
        },
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      });

      const hasPermission = rolesWithPermissions.some((role: { permissions: any[]; }) =>
        role.permissions.some((rp: { permission: { code: string; }; }) => permissionCodes.includes(rp.permission.code))
      );

      if (!hasPermission) {
        throw new ApiError(
          403,
          `One of permissions [${permissionCodes.join(', ')}] required`,
          ErrorCodes.INSUFFICIENT_PERMISSIONS,
          { permissions: permissionCodes }
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireAllPermissions(permissionCodes: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.auth || !req.businessMember) {
        throw new ApiError(401, 'Authentication and business membership required', ErrorCodes.UNAUTHORIZED);
      }

      const { businessId, roleIds } = req.businessMember;

      const rolesWithPermissions = await prisma.role.findMany({
        where: {
          id: { in: roleIds },
          businessId,
          isActive: true,
        },
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      });

      const allPermissionCodes = new Set(
        rolesWithPermissions.flatMap((role: { permissions: any[]; }) =>
          role.permissions.map((rp: { permission: { code: any; }; }) => rp.permission.code)
        )
      );

      const missingPermissions = permissionCodes.filter(code => !allPermissionCodes.has(code));

      if (missingPermissions.length > 0) {
        throw new ApiError(
          403,
          `Missing permissions: ${missingPermissions.join(', ')}`,
          ErrorCodes.INSUFFICIENT_PERMISSIONS,
          { missingPermissions }
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}