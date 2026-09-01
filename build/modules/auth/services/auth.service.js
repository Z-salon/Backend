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
exports.authService = exports.AuthService = void 0;
const prisma_1 = require("../../../libs/prisma");
const session_service_1 = require("./session.service");
const phone_1 = require("../../../utils/phone");
const otp_1 = require("../../../libs/otp");
const api_error_1 = require("../../../utils/api-error");
class AuthService {
    register(data) {
        return __awaiter(this, void 0, void 0, function* () {
            const normalizedPhone = (0, phone_1.normalizePhone)(data.phone);
            const tokenHash = (0, otp_1.hashVerificationToken)(data.verificationToken);
            const challenge = yield prisma_1.prisma.otpChallenge.findFirst({
                where: {
                    phone: normalizedPhone,
                    purpose: 'REGISTRATION',
                    status: 'VERIFIED',
                },
                orderBy: { verifiedAt: 'desc' },
            });
            if (!challenge) {
                throw new api_error_1.ApiError(400, 'Invalid or expired verification token', api_error_1.ErrorCodes.OTP_INVALID);
            }
            return prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                let user = yield tx.user.findUnique({
                    where: { phone: normalizedPhone },
                });
                if (!user) {
                    user = yield tx.user.create({
                        data: {
                            phone: normalizedPhone,
                            phoneVerifiedAt: new Date(),
                            status: 'ACTIVE',
                        },
                    });
                }
                else if (user.status !== 'ACTIVE') {
                    throw new api_error_1.ApiError(403, 'User account is suspended', api_error_1.ErrorCodes.USER_SUSPENDED);
                }
                else {
                    yield tx.user.update({
                        where: { id: user.id },
                        data: { phoneVerifiedAt: new Date() },
                    });
                }
                const business = yield tx.business.create({
                    data: {
                        name: data.business.name,
                        currency: data.business.currency,
                        timezone: data.business.timezone,
                        status: 'ACTIVE',
                    },
                });
                const member = yield tx.businessMember.create({
                    data: {
                        businessId: business.id,
                        userId: user.id,
                        status: 'ACTIVE',
                        joinedAt: new Date(),
                    },
                });
                yield this.createDefaultRolesAndPermissions(tx, business.id, member.id);
                yield tx.otpChallenge.update({
                    where: { id: challenge.id },
                    data: { status: 'CONSUMED' },
                });
                const session = yield session_service_1.sessionService.createSession(user.id);
                return {
                    user: {
                        id: user.id,
                        phone: user.phone,
                        phoneVerifiedAt: user.phoneVerifiedAt,
                    },
                    accessToken: session.accessToken,
                    refreshToken: session.refreshToken,
                };
            }));
        });
    }
    loginComplete(verificationToken, deviceInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            const tokenHash = (0, otp_1.hashVerificationToken)(verificationToken);
            const challenge = yield prisma_1.prisma.otpChallenge.findFirst({
                where: {
                    purpose: 'LOGIN',
                    status: 'VERIFIED',
                },
                orderBy: { verifiedAt: 'desc' },
            });
            if (!challenge) {
                throw new api_error_1.ApiError(400, 'Invalid or expired verification token', api_error_1.ErrorCodes.OTP_INVALID);
            }
            const user = yield prisma_1.prisma.user.findUnique({
                where: { phone: challenge.phone },
            });
            if (!user) {
                throw new api_error_1.ApiError(404, 'User not found', api_error_1.ErrorCodes.USER_NOT_FOUND);
            }
            if (user.status !== 'ACTIVE') {
                throw new api_error_1.ApiError(403, 'User account is suspended', api_error_1.ErrorCodes.USER_SUSPENDED);
            }
            yield prisma_1.prisma.otpChallenge.update({
                where: { id: challenge.id },
                data: { status: 'CONSUMED' },
            });
            const session = yield session_service_1.sessionService.createSession(user.id, deviceInfo === null || deviceInfo === void 0 ? void 0 : deviceInfo.deviceName, deviceInfo === null || deviceInfo === void 0 ? void 0 : deviceInfo.userAgent, deviceInfo === null || deviceInfo === void 0 ? void 0 : deviceInfo.ipAddress);
            return {
                user: {
                    id: user.id,
                    phone: user.phone,
                    phoneVerifiedAt: user.phoneVerifiedAt,
                },
                accessToken: session.accessToken,
                refreshToken: session.refreshToken,
            };
        });
    }
    getMe(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const user = yield prisma_1.prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    phone: true,
                    phoneVerifiedAt: true,
                    status: true,
                    createdAt: true,
                    memberships: {
                        where: { status: 'ACTIVE' },
                        include: {
                            business: {
                                select: { id: true, name: true, currency: true, timezone: true, status: true },
                            },
                            userRoles: {
                                include: {
                                    role: { select: { id: true, name: true, systemKey: true } },
                                    branches: { select: { branchId: true } },
                                },
                            },
                        },
                    },
                },
            });
            if (!user) {
                throw new api_error_1.ApiError(404, 'User not found', api_error_1.ErrorCodes.USER_NOT_FOUND);
            }
            return user;
        });
    }
    createDefaultRolesAndPermissions(tx, businessId, ownerMemberId) {
        return __awaiter(this, void 0, void 0, function* () {
            const permissions = yield tx.permission.findMany({
                select: { id: true, code: true },
            });
            const permissionMap = new Map(permissions.map((p) => [p.code, p.id]));
            const allPermissionCodes = Array.from(permissionMap.keys());
            const defaultRoles = [
                { name: 'Owner', systemKey: 'OWNER', description: 'Business owner with full access', permissionCodes: allPermissionCodes },
                { name: 'Admin', systemKey: 'ADMIN', description: 'Business administrator', permissionCodes: allPermissionCodes.filter((c) => !['FINANCE_REFUND', 'FINANCE_ADJUSTMENT'].includes(c)) },
                { name: 'Branch Manager', systemKey: 'BRANCH_MANAGER', description: 'Manages a specific branch', permissionCodes: [
                        'BOOKING_VIEW', 'BOOKING_CREATE', 'BOOKING_UPDATE', 'BOOKING_CANCEL', 'BOOKING_CHECK_IN',
                        'BOOKING_START', 'BOOKING_COMPLETE', 'BOOKING_MARK_NO_SHOW', 'BOOKING_MANAGE_WAITLIST',
                        'CUSTOMER_VIEW', 'CUSTOMER_CREATE', 'CUSTOMER_UPDATE',
                        'STAFF_VIEW', 'STAFF_MANAGE_SCHEDULE',
                        'SERVICE_VIEW',
                        'BRANCH_VIEW',
                        'FINANCE_VIEW',
                    ] },
                { name: 'Receptionist', systemKey: 'RECEPTIONIST', description: 'Front desk receptionist', permissionCodes: [
                        'BOOKING_VIEW', 'BOOKING_CREATE', 'BOOKING_UPDATE', 'BOOKING_CANCEL', 'BOOKING_CHECK_IN',
                        'CUSTOMER_VIEW', 'CUSTOMER_CREATE', 'CUSTOMER_UPDATE',
                        'SERVICE_VIEW',
                        'STAFF_VIEW',
                    ] },
            ];
            const createdRoles = [];
            for (const roleData of defaultRoles) {
                const role = yield tx.role.create({
                    data: {
                        businessId,
                        name: roleData.name,
                        description: roleData.description,
                        type: 'SYSTEM',
                        systemKey: roleData.systemKey,
                        isActive: true,
                    },
                });
                const permissionIds = roleData.permissionCodes
                    .map(code => permissionMap.get(code))
                    .filter((id) => id !== undefined);
                if (permissionIds.length > 0) {
                    yield tx.rolePermission.createMany({
                        data: permissionIds.map(permissionId => ({
                            roleId: role.id,
                            permissionId,
                        })),
                    });
                }
                createdRoles.push({ role, systemKey: roleData.systemKey });
            }
            const ownerRole = createdRoles.find(r => r.systemKey === 'OWNER').role;
            yield tx.userRole.create({
                data: {
                    businessMemberId: ownerMemberId,
                    roleId: ownerRole.id,
                    scopeType: 'BUSINESS',
                },
            });
        });
    }
}
exports.AuthService = AuthService;
exports.authService = new AuthService();
