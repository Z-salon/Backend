"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.roleController = exports.RoleController = void 0;
const role_service_1 = require("../services/role.service");
const api_response_1 = require("../../../utils/api-response");
class RoleController {
    getRoles(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const businessId = req.params.businessId;
                const roles = yield role_service_1.roleService.getRoles(businessId);
                res.json((0, api_response_1.successResponse)('Roles retrieved', roles));
            }
            catch (error) {
                next(error);
            }
        });
    }
    getRole(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { businessId, roleId } = req.params;
                const role = yield role_service_1.roleService.getRole(businessId, roleId);
                res.json((0, api_response_1.successResponse)('Role retrieved', role));
            }
            catch (error) {
                next(error);
            }
        });
    }
    createRole(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const businessId = req.params.businessId;
                const { name, description, permissionCodes } = req.body;
                const role = yield role_service_1.roleService.createRole(businessId, { name, description, permissionCodes });
                res.status(201).json((0, api_response_1.successResponse)('Role created', role));
            }
            catch (error) {
                next(error);
            }
        });
    }
    updateRole(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { businessId, roleId } = req.params;
                const role = yield role_service_1.roleService.updateRole(businessId, roleId, req.body);
                res.json((0, api_response_1.successResponse)('Role updated', role));
            }
            catch (error) {
                next(error);
            }
        });
    }
    updateRolePermissions(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { businessId, roleId } = req.params;
                const { permissionCodes } = req.body;
                const role = yield role_service_1.roleService.updateRolePermissions(businessId, roleId, permissionCodes);
                res.json((0, api_response_1.successResponse)('Role permissions updated', role));
            }
            catch (error) {
                next(error);
            }
        });
    }
    deleteRole(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { businessId, roleId } = req.params;
                yield role_service_1.roleService.deleteRole(businessId, roleId);
                res.json((0, api_response_1.successResponse)('Role deleted'));
            }
            catch (error) {
                next(error);
            }
        });
    }
    assignRole(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { businessId, memberId } = req.params;
                const { roleId, scopeType, branchIds } = req.body;
                const userRole = yield role_service_1.roleService.assignRole(businessId, memberId, { roleId, scopeType, branchIds });
                res.status(201).json((0, api_response_1.successResponse)('Role assigned', userRole));
            }
            catch (error) {
                next(error);
            }
        });
    }
    removeRoleAssignment(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { businessId, memberId, userRoleId } = req.params;
                const currentUserId = req.auth.userId;
                yield role_service_1.roleService.removeRoleAssignment(businessId, memberId, userRoleId, currentUserId);
                res.json((0, api_response_1.successResponse)('Role assignment removed'));
            }
            catch (error) {
                next(error);
            }
        });
    }
}
exports.RoleController = RoleController;
exports.roleController = new RoleController();
