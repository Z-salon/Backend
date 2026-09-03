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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = exports.AuthService = void 0;
const argon2_1 = __importDefault(require("argon2"));
const prisma_1 = require("../../../libs/prisma");
const otp_service_1 = require("./otp.service");
const session_service_1 = require("./session.service");
const phone_1 = require("../../../utils/phone");
const otp_1 = require("../../../libs/otp");
const api_error_1 = require("../../../utils/api-error");
class AuthService {
    register(data) {
        return __awaiter(this, void 0, void 0, function* () {
            const normalizedPhone = (0, phone_1.normalizePhone)(data.phone);
            const existingUser = yield prisma_1.prisma.user.findUnique({
                where: { phone: normalizedPhone },
            });
            if (existingUser) {
                throw new api_error_1.ApiError(409, 'User already exists', api_error_1.ErrorCodes.USER_ALREADY_EXISTS);
            }
            const passwordHash = yield argon2_1.default.hash(data.password);
            yield prisma_1.prisma.registrationRequest.upsert({
                where: { phone: normalizedPhone },
                update: {
                    passwordHash,
                    businessName: data.business.name,
                    currency: data.business.currency,
                    timezone: data.business.timezone,
                    status: 'PENDING',
                    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
                },
                create: {
                    phone: normalizedPhone,
                    passwordHash,
                    businessName: data.business.name,
                    currency: data.business.currency,
                    timezone: data.business.timezone,
                    status: 'PENDING',
                    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
                },
            });
            yield otp_service_1.otpService.requestOtp(normalizedPhone, 'PHONE_VERIFICATION');
        });
    }
    registerInvitation(invitationToken, data) {
        return __awaiter(this, void 0, void 0, function* () {
            // ============================================================
            // 1. Validate password
            // ============================================================
            if (!data.password ||
                data.password.length < 8) {
                throw new api_error_1.ApiError(400, 'Password must be at least 8 characters long', api_error_1.ErrorCodes.BAD_REQUEST);
            }
            // ============================================================
            // 2. Hash invitation token
            // ============================================================
            const tokenHash = (0, otp_1.hashVerificationToken)(invitationToken);
            // ============================================================
            // 3. Find invitation
            // ============================================================
            const invitation = yield prisma_1.prisma.businessInvitation.findUnique({
                where: {
                    tokenHash,
                },
                select: {
                    id: true,
                    phone: true,
                    status: true,
                    expiresAt: true,
                    business: {
                        select: {
                            id: true,
                            status: true,
                        },
                    },
                },
            });
            // ============================================================
            // 4. Invitation not found
            // ============================================================
            if (!invitation) {
                throw new api_error_1.ApiError(404, 'Invitation not found', api_error_1.ErrorCodes.INVITATION_NOT_FOUND);
            }
            // ============================================================
            // 5. Invitation status
            // ============================================================
            if (invitation.status ===
                'ACCEPTED') {
                throw new api_error_1.ApiError(409, 'This invitation has already been accepted', api_error_1.ErrorCodes.CONFLICT);
            }
            if (invitation.status ===
                'REVOKED') {
                throw new api_error_1.ApiError(410, 'This invitation has been revoked', api_error_1.ErrorCodes.INVITATION_REVOKED);
            }
            // ============================================================
            // 6. Expiration
            // ============================================================
            if (invitation.expiresAt <=
                new Date()) {
                if (invitation.status ===
                    'PENDING') {
                    yield prisma_1.prisma.businessInvitation.update({
                        where: {
                            id: invitation.id,
                        },
                        data: {
                            status: 'EXPIRED',
                        },
                    });
                }
                throw new api_error_1.ApiError(410, 'Invitation has expired', api_error_1.ErrorCodes.INVITATION_EXPIRED);
            }
            // ============================================================
            // 7. Business must still be active
            // ============================================================
            if (invitation.business.status !==
                'ACTIVE') {
                throw new api_error_1.ApiError(403, 'Business is no longer active', api_error_1.ErrorCodes.BUSINESS_SUSPENDED);
            }
            // ============================================================
            // 8. Phone comes ONLY from invitation
            // ============================================================
            const normalizedPhone = (0, phone_1.normalizePhone)(invitation.phone);
            // ============================================================
            // 9. Check whether user already exists
            // ============================================================
            const existingUser = yield prisma_1.prisma.user.findUnique({
                where: {
                    phone: normalizedPhone,
                },
                select: {
                    id: true,
                    status: true,
                },
            });
            if (existingUser) {
                throw new api_error_1.ApiError(409, 'An account already exists for this invitation. Please log in to accept the invitation.', api_error_1.ErrorCodes.USER_ALREADY_EXISTS);
            }
            // ============================================================
            // 10. Hash password
            // ============================================================
            const passwordHash = yield argon2_1.default.hash(data.password);
            // ============================================================
            // 11. Create user + request OTP
            // ============================================================
            //
            // IMPORTANT:
            // Do not put otpService.requestOtp()
            // inside a Prisma transaction if it sends SMS.
            //
            yield prisma_1.prisma.user.create({
                data: {
                    phone: normalizedPhone,
                    passwordHash,
                    status: 'PENDING_VERIFICATION',
                },
            });
            // ============================================================
            // 12. Request OTP
            // ============================================================
            yield otp_service_1.otpService.requestOtp(normalizedPhone, 'PHONE_VERIFICATION');
            // ============================================================
            // 13. Return
            // ============================================================
            return {
                message: 'Registration started. Please verify your phone number using the OTP.',
                phone: normalizedPhone,
            };
        });
    }
    registerVerify(phone, otp, deviceInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            const normalizedPhone = (0, phone_1.normalizePhone)(phone);
            const registrationRequest = yield prisma_1.prisma.registrationRequest.findUnique({
                where: { phone: normalizedPhone },
            });
            if (!registrationRequest) {
                throw new api_error_1.ApiError(400, 'Registration request not found', api_error_1.ErrorCodes.BAD_REQUEST);
            }
            const verificationToken = yield otp_service_1.otpService.verifyOtp(normalizedPhone, otp, 'PHONE_VERIFICATION');
            if (!verificationToken) {
                throw new api_error_1.ApiError(400, 'Invalid or expired verification token', api_error_1.ErrorCodes.OTP_INVALID);
            }
            // const result = await prisma.$transaction(async (tx) => {
            let user = yield prisma_1.prisma.user.findUnique({
                where: { phone: normalizedPhone },
            });
            if (!user) {
                user = yield prisma_1.prisma.user.create({
                    data: {
                        phone: normalizedPhone,
                        passwordHash: registrationRequest.passwordHash,
                        phoneVerifiedAt: new Date(),
                        status: 'ACTIVE',
                    },
                });
            }
            else if (user.status === 'PENDING_VERIFICATION') {
                user = yield prisma_1.prisma.user.update({
                    where: { id: user.id },
                    data: {
                        passwordHash: registrationRequest.passwordHash,
                        phoneVerifiedAt: new Date(),
                        status: 'ACTIVE',
                    },
                });
            }
            if (user.status !== 'ACTIVE') {
                throw new api_error_1.ApiError(403, 'User account is suspended', api_error_1.ErrorCodes.USER_SUSPENDED);
            }
            const slug = registrationRequest.businessName
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)/g, '')
                + '-' + Date.now().toString(36);
            const business = yield prisma_1.prisma.business.create({
                data: {
                    name: registrationRequest.businessName,
                    slug,
                    currency: registrationRequest.currency,
                    timezone: registrationRequest.timezone,
                    status: 'ACTIVE',
                    owner_id: user.id,
                },
            });
            yield prisma_1.prisma.branch.create({
                data: {
                    businessId: business.id,
                    name: 'Main Branch',
                    isActive: true,
                },
            });
            const member = yield prisma_1.prisma.businessMember.create({
                data: {
                    businessId: business.id,
                    userId: user.id,
                    status: 'ACTIVE',
                    joinedAt: new Date(),
                },
            });
            // return {
            //   user: {
            //     id: user.id,
            //     phone: user.phone,
            //     phoneVerifiedAt: user.phoneVerifiedAt,
            //   },
            //   memberId: member.id,
            //   businessId: business.id,
            // };
            // );
            yield this.createDefaultRolesAndPermissions(prisma_1.prisma, business.id, member.id);
            yield prisma_1.prisma.registrationRequest.delete({ where: { id: registrationRequest.id } });
            const session = yield session_service_1.sessionService.createSession(user.id, deviceInfo === null || deviceInfo === void 0 ? void 0 : deviceInfo.deviceName, deviceInfo === null || deviceInfo === void 0 ? void 0 : deviceInfo.userAgent, deviceInfo === null || deviceInfo === void 0 ? void 0 : deviceInfo.ipAddress);
            return {
                user: user,
                accessToken: session.accessToken,
                refreshToken: session.refreshToken,
            };
        });
    }
    login(phone, password, deviceInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            const normalizedPhone = (0, phone_1.normalizePhone)(phone);
            const user = yield prisma_1.prisma.user.findUnique({
                where: { phone: normalizedPhone },
            });
            if (!user || !user.passwordHash) {
                throw new api_error_1.ApiError(401, 'Invalid phone number or password.', api_error_1.ErrorCodes.INVALID_CREDENTIALS);
            }
            if (user.status === 'PENDING_VERIFICATION') {
                throw new api_error_1.ApiError(403, 'Please verify your phone number before logging in', api_error_1.ErrorCodes.PHONE_NOT_VERIFIED);
            }
            if (user.status !== 'ACTIVE') {
                throw new api_error_1.ApiError(403, 'User account is suspended', api_error_1.ErrorCodes.USER_SUSPENDED);
            }
            const passwordValid = yield argon2_1.default.verify(user.passwordHash, password);
            if (!passwordValid) {
                throw new api_error_1.ApiError(401, 'Invalid phone number or password.', api_error_1.ErrorCodes.INVALID_CREDENTIALS);
            }
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
            if (!challenge || (0, otp_1.hashVerificationToken)(verificationToken) !== challenge.verificationTokenHash) {
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
    requestPasswordReset(phone) {
        return __awaiter(this, void 0, void 0, function* () {
            const normalizedPhone = (0, phone_1.normalizePhone)(phone);
            const user = yield prisma_1.prisma.user.findUnique({
                where: { phone: normalizedPhone },
            });
            if (user) {
                yield otp_service_1.otpService.requestOtp(normalizedPhone, 'PASSWORD_RESET');
            }
            return {
                message: 'If an account exists, a verification code has been sent.',
            };
        });
    }
    verifyPasswordReset(phone, otp) {
        return __awaiter(this, void 0, void 0, function* () {
            const normalizedPhone = (0, phone_1.normalizePhone)(phone);
            const passwordResetToken = yield otp_service_1.otpService.verifyOtp(normalizedPhone, otp, 'PASSWORD_RESET');
            return {
                passwordResetToken,
            };
        });
    }
    resetPassword(passwordResetToken, newPassword) {
        return __awaiter(this, void 0, void 0, function* () {
            const tokenHash = (0, otp_1.hashVerificationToken)(passwordResetToken);
            const challenge = yield prisma_1.prisma.otpChallenge.findFirst({
                where: {
                    purpose: 'PASSWORD_RESET',
                    status: 'VERIFIED',
                    verificationTokenHash: tokenHash,
                },
                orderBy: { verifiedAt: 'desc' },
            });
            if (!challenge) {
                throw new api_error_1.ApiError(400, 'Invalid or expired password reset token', api_error_1.ErrorCodes.OTP_INVALID);
            }
            const user = yield prisma_1.prisma.user.findUnique({
                where: { phone: challenge.phone },
            });
            if (!user) {
                throw new api_error_1.ApiError(404, 'User not found', api_error_1.ErrorCodes.USER_NOT_FOUND);
            }
            const passwordHash = yield argon2_1.default.hash(newPassword);
            yield prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                yield tx.user.update({
                    where: { id: user.id },
                    data: { passwordHash },
                });
                yield tx.otpChallenge.update({
                    where: { id: challenge.id },
                    data: { status: 'CONSUMED', consumedAt: new Date() },
                });
                yield tx.session.updateMany({
                    where: {
                        userId: user.id,
                        status: 'ACTIVE',
                    },
                    data: {
                        status: 'REVOKED',
                        revokedAt: new Date(),
                        revokeReason: 'Password reset completed',
                    },
                });
            }));
        });
    }
    changePassword(userId, currentPassword, newPassword) {
        return __awaiter(this, void 0, void 0, function* () {
            const user = yield prisma_1.prisma.user.findUnique({ where: { id: userId } });
            if (!user || !user.passwordHash) {
                throw new api_error_1.ApiError(401, 'Current password is invalid.', api_error_1.ErrorCodes.INVALID_CREDENTIALS);
            }
            const currentPasswordValid = yield argon2_1.default.verify(user.passwordHash, currentPassword);
            if (!currentPasswordValid) {
                throw new api_error_1.ApiError(401, 'Current password is invalid.', api_error_1.ErrorCodes.INVALID_CREDENTIALS);
            }
            const passwordHash = yield argon2_1.default.hash(newPassword);
            yield prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                yield tx.user.update({
                    where: { id: userId },
                    data: { passwordHash },
                });
                yield tx.session.updateMany({
                    where: { userId, status: 'ACTIVE' },
                    data: {
                        status: 'REVOKED',
                        revokedAt: new Date(),
                        revokeReason: 'Password changed on another device',
                    },
                });
            }));
        });
    }
    changePhoneRequest(userId, currentPassword, newPhone) {
        return __awaiter(this, void 0, void 0, function* () {
            const normalizedPhone = (0, phone_1.normalizePhone)(newPhone);
            const user = yield prisma_1.prisma.user.findUnique({ where: { id: userId } });
            if (!user || !user.passwordHash) {
                throw new api_error_1.ApiError(401, 'Current password is invalid.', api_error_1.ErrorCodes.INVALID_CREDENTIALS);
            }
            const isValid = yield argon2_1.default.verify(user.passwordHash, currentPassword);
            if (!isValid) {
                throw new api_error_1.ApiError(401, 'Current password is invalid.', api_error_1.ErrorCodes.INVALID_CREDENTIALS);
            }
            const duplicateUser = yield prisma_1.prisma.user.findUnique({ where: { phone: normalizedPhone } });
            if (duplicateUser && duplicateUser.id !== userId) {
                throw new api_error_1.ApiError(409, 'Phone number is already in use.', api_error_1.ErrorCodes.USER_ALREADY_EXISTS);
            }
            yield otp_service_1.otpService.requestOtp(normalizedPhone, 'PHONE_CHANGE');
        });
    }
    changePhoneVerify(userId, newPhone, otp) {
        return __awaiter(this, void 0, void 0, function* () {
            const normalizedPhone = (0, phone_1.normalizePhone)(newPhone);
            const user = yield prisma_1.prisma.user.findUnique({ where: { id: userId } });
            if (!user) {
                throw new api_error_1.ApiError(404, 'User not found', api_error_1.ErrorCodes.USER_NOT_FOUND);
            }
            yield otp_service_1.otpService.verifyOtp(normalizedPhone, otp, 'PHONE_CHANGE');
            yield prisma_1.prisma.user.update({
                where: { id: userId },
                data: {
                    phone: normalizedPhone,
                    phoneVerifiedAt: new Date(),
                },
            });
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
            var _a;
            // Get seeded permissions
            const permissions = yield tx.permission.findMany({
                select: {
                    id: true,
                    code: true,
                },
            });
            const permissionMap = new Map(permissions.map((p) => [
                p.code,
                p.id,
            ]));
            const allPermissionCodes = Array.from(permissionMap.keys());
            // ==========================================
            // DEFAULT BUSINESS ROLES
            // ==========================================
            const defaultRoles = [
                {
                    name: 'Owner',
                    systemKey: 'OWNER',
                    description: 'Business owner with full access',
                    permissionCodes: allPermissionCodes,
                },
                {
                    name: 'Admin',
                    systemKey: 'ADMIN',
                    description: 'Business administrator',
                    permissionCodes: allPermissionCodes.filter((code) => ![
                        'FINANCE_REFUND',
                        'FINANCE_ADJUSTMENT',
                    ].includes(code)),
                },
                {
                    name: 'Branch Manager',
                    systemKey: 'BRANCH_MANAGER',
                    description: 'Manages a specific branch',
                    permissionCodes: [
                        'BOOKING_VIEW',
                        'BOOKING_CREATE',
                        'BOOKING_UPDATE',
                        'BOOKING_CANCEL',
                        'BOOKING_CHECK_IN',
                        'BOOKING_START',
                        'BOOKING_COMPLETE',
                        'BOOKING_MARK_NO_SHOW',
                        'BOOKING_MANAGE_WAITLIST',
                        'CUSTOMER_VIEW',
                        'CUSTOMER_CREATE',
                        'CUSTOMER_UPDATE',
                        'STAFF_VIEW',
                        'STAFF_MANAGE_SCHEDULE',
                        'SERVICE_VIEW',
                        'BRANCH_VIEW',
                        'FINANCE_VIEW',
                    ],
                },
                {
                    name: 'Receptionist',
                    systemKey: 'RECEPTIONIST',
                    description: 'Front desk receptionist',
                    permissionCodes: [
                        'BOOKING_VIEW',
                        'BOOKING_CREATE',
                        'BOOKING_UPDATE',
                        'BOOKING_CANCEL',
                        'BOOKING_CHECK_IN',
                        'CUSTOMER_VIEW',
                        'CUSTOMER_CREATE',
                        'CUSTOMER_UPDATE',
                        'SERVICE_VIEW',
                        'STAFF_VIEW',
                    ],
                },
            ];
            // ==========================================
            // CREATE ROLES + PERMISSIONS
            // ==========================================
            const createdRoles = [];
            for (const roleData of defaultRoles) {
                // 1. Create role
                const role = yield tx.role.upsert({
                    where: {
                        businessId_systemKey: {
                            businessId,
                            systemKey: roleData.systemKey,
                        },
                    },
                    update: {
                        name: roleData.name,
                        description: roleData.description,
                        type: 'SYSTEM',
                        isActive: true,
                    },
                    create: {
                        businessId,
                        name: roleData.name,
                        description: roleData.description,
                        type: 'SYSTEM',
                        systemKey: roleData.systemKey,
                        isActive: true,
                    },
                });
                // 2. Validate permissions
                const missingPermissions = roleData.permissionCodes.filter((code) => !permissionMap.has(code));
                if (missingPermissions.length > 0) {
                    throw new Error(`Missing permissions for role ${roleData.systemKey}: ` +
                        missingPermissions.join(', '));
                }
                // 3. Convert codes to IDs
                const permissionIds = roleData.permissionCodes.map((code) => permissionMap.get(code));
                // 4. Insert relationships in ONE query
                if (permissionIds.length > 0) {
                    yield tx.rolePermission.createMany({
                        data: permissionIds.map((permissionId) => ({
                            roleId: role.id,
                            permissionId,
                        })),
                        skipDuplicates: true,
                    });
                }
                createdRoles.push({
                    role,
                    systemKey: roleData.systemKey,
                });
            }
            // ==========================================
            // ASSIGN OWNER ROLE
            // ==========================================
            const ownerRole = (_a = createdRoles.find((r) => r.systemKey === 'OWNER')) === null || _a === void 0 ? void 0 : _a.role;
            if (!ownerRole) {
                throw new Error('Owner role was not created');
            }
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
