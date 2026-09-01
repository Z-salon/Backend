import { Request, Response, NextFunction } from 'express';
import { roleService } from '../services/role.service';
import { successResponse } from '../../../utils/api-response';

export class RoleController {
  async getRoles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const roles = await roleService.getRoles(businessId);

      res.json(successResponse('Roles retrieved', roles));
    } catch (error) {
      next(error);
    }
  }

  async getRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { businessId, roleId } = req.params;
      const role = await roleService.getRole(businessId, roleId);

      res.json(successResponse('Role retrieved', role));
    } catch (error) {
      next(error);
    }
  }

  async createRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const { name, description, permissionCodes } = req.body;

      const role = await roleService.createRole(businessId, { name, description, permissionCodes });

      res.status(201).json(successResponse('Role created', role));
    } catch (error) {
      next(error);
    }
  }

  async updateRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { businessId, roleId } = req.params;
      const role = await roleService.updateRole(businessId, roleId, req.body);

      res.json(successResponse('Role updated', role));
    } catch (error) {
      next(error);
    }
  }

  async updateRolePermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { businessId, roleId } = req.params;
      const { permissionCodes } = req.body;

      const role = await roleService.updateRolePermissions(businessId, roleId, permissionCodes);

      res.json(successResponse('Role permissions updated', role));
    } catch (error) {
      next(error);
    }
  }

  async deleteRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { businessId, roleId } = req.params;

      await roleService.deleteRole(businessId, roleId);

      res.json(successResponse('Role deleted'));
    } catch (error) {
      next(error);
    }
  }

  async assignRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { businessId, memberId } = req.params;
      const { roleId, scopeType, branchIds } = req.body;

      const userRole = await roleService.assignRole(businessId, memberId, { roleId, scopeType, branchIds });

      res.status(201).json(successResponse('Role assigned', userRole));
    } catch (error) {
      next(error);
    }
  }

  async removeRoleAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { businessId, memberId, userRoleId } = req.params;
      const currentUserId = req.auth!.userId;

      await roleService.removeRoleAssignment(businessId, memberId, userRoleId, currentUserId);

      res.json(successResponse('Role assignment removed'));
    } catch (error) {
      next(error);
    }
  }
}

export const roleController = new RoleController();