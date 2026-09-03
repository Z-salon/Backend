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
exports.invitationService = exports.InvitationService = void 0;
const prisma_1 = require("../../../libs/prisma");
const phone_1 = require("../../../utils/phone");
const api_error_1 = require("../../../utils/api-error");
const otp_1 = require("../../../libs/otp");
const sms_service_1 = require("../../auth/sms/sms.service");
const env_1 = require("../../../config/env");
class InvitationService {
    buildInvitationUrl(token) {
        return `${env_1.config.frontendUrl.replace(/\/$/, '')}/invitation/${token}`;
    }
    createInvitation(data) {
        return __awaiter(this, void 0, void 0, function* () {
            const normalizedPhone = (0, phone_1.normalizePhone)(data.phone);
            // ==========================================
            // 1. Generate secure token BEFORE transaction
            // ==========================================
            const invitationToken = (0, otp_1.generateVerificationToken)();
            const invitationTokenHash = (0, otp_1.hashVerificationToken)(invitationToken);
            // ==========================================
            // 2. Calculate expiration
            // ==========================================
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);
            // ==========================================
            // 3. DATABASE TRANSACTION
            // ==========================================
            const result = yield prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                // --------------------------------------
                // BUSINESS VALIDATION
                // --------------------------------------
                const business = yield tx.business.findUnique({
                    where: {
                        id: data.businessId,
                    },
                    select: {
                        id: true,
                        status: true,
                        name: true,
                    },
                });
                if (!business ||
                    business.status !== 'ACTIVE') {
                    throw new api_error_1.ApiError(404, 'Business not found or not active', api_error_1.ErrorCodes.BUSINESS_NOT_FOUND);
                }
                // --------------------------------------
                // INVITER VALIDATION
                // --------------------------------------
                const inviterMembership = yield tx.businessMember.findFirst({
                    where: {
                        id: data.invitedByMemberId,
                        businessId: data.businessId,
                        status: 'ACTIVE',
                    },
                    select: {
                        id: true,
                    },
                });
                if (!inviterMembership) {
                    throw new api_error_1.ApiError(403, 'Inviter is not an active member of this business', api_error_1.ErrorCodes.NOT_BUSINESS_MEMBER);
                }
                // --------------------------------------
                // ROLE VALIDATION
                // --------------------------------------
                const roleIds = [
                    ...new Set(data.roles.map((role) => role.roleId)),
                ];
                const roles = yield tx.role.findMany({
                    where: {
                        id: {
                            in: roleIds,
                        },
                        businessId: data.businessId,
                        isActive: true,
                    },
                    select: {
                        id: true,
                    },
                });
                if (roles.length !== roleIds.length) {
                    const foundRoleIds = new Set(roles.map((role) => role.id));
                    const invalidRoleIds = roleIds.filter((roleId) => !foundRoleIds.has(roleId));
                    throw new api_error_1.ApiError(400, `Roles not found or inactive: ${invalidRoleIds.join(', ')}`, api_error_1.ErrorCodes.ROLE_NOT_FOUND);
                }
                // --------------------------------------
                // SCOPE VALIDATION
                // --------------------------------------
                for (const roleData of data.roles) {
                    if (roleData.scopeType ===
                        'BUSINESS' &&
                        roleData.branchIds &&
                        roleData.branchIds.length > 0) {
                        throw new api_error_1.ApiError(400, 'BUSINESS scope cannot have branch assignments', api_error_1.ErrorCodes.INVALID_SCOPE_CONFIGURATION);
                    }
                    if (roleData.scopeType ===
                        'BRANCH' &&
                        (!roleData.branchIds ||
                            roleData.branchIds.length === 0)) {
                        throw new api_error_1.ApiError(400, 'BRANCH scope requires at least one branch', api_error_1.ErrorCodes.INVALID_SCOPE_CONFIGURATION);
                    }
                }
                // --------------------------------------
                // BRANCH VALIDATION
                // --------------------------------------
                const branchIds = [
                    ...new Set(data.roles
                        .filter((role) => role.scopeType ===
                        'BRANCH')
                        .flatMap((role) => role.branchIds || [])),
                ];
                if (branchIds.length > 0) {
                    const branches = yield tx.branch.findMany({
                        where: {
                            id: {
                                in: branchIds,
                            },
                            businessId: data.businessId,
                            isActive: true,
                        },
                        select: {
                            id: true,
                        },
                    });
                    if (branches.length !==
                        branchIds.length) {
                        const foundBranchIds = new Set(branches.map((branch) => branch.id));
                        const invalidBranchIds = branchIds.filter((branchId) => !foundBranchIds.has(branchId));
                        throw new api_error_1.ApiError(400, `Branches not found or inactive: ${invalidBranchIds.join(', ')}`, api_error_1.ErrorCodes.BRANCH_NOT_IN_BUSINESS);
                    }
                }
                // --------------------------------------
                // CHECK EXISTING BUSINESS MEMBER
                // --------------------------------------
                const existingUser = yield tx.user.findUnique({
                    where: {
                        phone: normalizedPhone,
                    },
                    select: {
                        id: true,
                    },
                });
                if (existingUser) {
                    const existingMember = yield tx.businessMember.findFirst({
                        where: {
                            userId: existingUser.id,
                            businessId: data.businessId,
                            status: 'ACTIVE',
                        },
                        select: {
                            id: true,
                        },
                    });
                    if (existingMember) {
                        throw new api_error_1.ApiError(409, 'This user is already an active member of this business', api_error_1.ErrorCodes.CONFLICT);
                    }
                }
                // --------------------------------------
                // CHECK ACTIVE INVITATION
                // --------------------------------------
                const activeInvitation = yield tx.businessInvitation.findFirst({
                    where: {
                        businessId: data.businessId,
                        phone: normalizedPhone,
                        status: 'PENDING',
                        expiresAt: {
                            gt: new Date(),
                        },
                    },
                    select: {
                        id: true,
                    },
                });
                if (activeInvitation) {
                    throw new api_error_1.ApiError(409, 'An active invitation already exists for this phone number', api_error_1.ErrorCodes.CONFLICT);
                }
                // --------------------------------------
                // CREATE INVITATION
                // --------------------------------------
                const invitation = yield tx.businessInvitation.create({
                    data: {
                        businessId: data.businessId,
                        phone: normalizedPhone,
                        status: 'PENDING',
                        expiresAt,
                        invitedByMemberId: data.invitedByMemberId,
                        tokenHash: invitationTokenHash,
                    },
                });
                // --------------------------------------
                // CREATE INVITATION ROLES
                // --------------------------------------
                for (const roleData of data.roles) {
                    const invitationRole = yield tx.invitationRole.create({
                        data: {
                            invitationId: invitation.id,
                            roleId: roleData.roleId,
                            scopeType: roleData.scopeType,
                        },
                    });
                    // ----------------------------------
                    // CREATE BRANCH ASSIGNMENTS
                    // ----------------------------------
                    if (roleData.scopeType ===
                        'BRANCH' &&
                        roleData.branchIds) {
                        const uniqueBranchIds = [
                            ...new Set(roleData.branchIds),
                        ];
                        yield tx.invitationRoleBranch.createMany({
                            data: uniqueBranchIds.map((branchId) => ({
                                invitationRoleId: invitationRole.id,
                                branchId,
                            })),
                            skipDuplicates: true,
                        });
                    }
                }
                return {
                    invitation,
                    businessName: business.name,
                };
            }));
            // ==========================================
            // 4. BUILD URL AFTER TRANSACTION
            // ==========================================
            const invitationUrl = this.buildInvitationUrl(invitationToken);
            // ==========================================
            // 5. SEND SMS AFTER TRANSACTION
            // ==========================================
            try {
                yield (0, sms_service_1.sendInvitationLinkSms)(normalizedPhone, invitationUrl);
            }
            catch (error) {
                // IMPORTANT:
                // Invitation already exists.
                // Do not rollback or delete it.
                console.error('Failed to send invitation SMS', {
                    invitationId: result.invitation.id,
                    phone: normalizedPhone,
                    error,
                });
                // For now, do not fail the
                // invitation creation request.
                //
                // Later this can be replaced
                // with your notification retry/outbox.
            }
            // ==========================================
            // 6. RETURN SAFE RESPONSE
            // ==========================================
            return {
                id: result.invitation.id,
                phone: result.invitation.phone,
                status: result.invitation.status,
                expiresAt: result.invitation.expiresAt,
                businessName: result.businessName,
                createdAt: result.invitation.createdAt,
            };
        });
    }
    getInvitationDetails(invitationToken) {
        return __awaiter(this, void 0, void 0, function* () {
            const tokenHash = yield (0, otp_1.hashVerificationToken)(invitationToken);
            const invitation = yield prisma_1.prisma.businessInvitation.findFirst({
                where: {
                    tokenHash,
                    status: 'PENDING',
                },
                include: {
                    business: {
                        select: {
                            id: true,
                            name: true,
                            status: true,
                        },
                    },
                    roles: {
                        include: {
                            role: {
                                select: {
                                    id: true,
                                    name: true,
                                    systemKey: true,
                                },
                            },
                            branches: {
                                include: {
                                    branch: {
                                        select: {
                                            id: true,
                                            name: true,
                                            isActive: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            });
            if (!invitation) {
                throw new api_error_1.ApiError(404, 'Invitation not found', api_error_1.ErrorCodes.INVITATION_NOT_FOUND);
            }
            if (invitation.status === 'REVOKED') {
                throw new api_error_1.ApiError(410, 'This invitation has been revoked', api_error_1.ErrorCodes.INVITATION_REVOKED);
            }
            if (invitation.status === 'ACCEPTED') {
                throw new api_error_1.ApiError(409, 'This invitation has already been accepted', api_error_1.ErrorCodes.INVITATION_ALREADY_ACCEPTED);
            }
            if (invitation.status === 'EXPIRED' ||
                invitation.expiresAt <= new Date()) {
                if (invitation.status === 'PENDING') {
                    yield prisma_1.prisma.businessInvitation.update({
                        where: {
                            id: invitation.id,
                        },
                        data: {
                            status: 'EXPIRED',
                        },
                    });
                }
                throw new api_error_1.ApiError(410, 'This invitation has expired', api_error_1.ErrorCodes.INVITATION_EXPIRED);
            }
            // ==========================================
            // CHECK EXPIRATION
            // ==========================================
            if (invitation.expiresAt <=
                new Date()) {
                yield prisma_1.prisma.businessInvitation.update({
                    where: {
                        id: invitation.id,
                    },
                    data: {
                        status: 'EXPIRED',
                    },
                });
                throw new api_error_1.ApiError(410, 'This invitation has expired', api_error_1.ErrorCodes.INVITATION_EXPIRED);
            }
            // ==========================================
            // CHECK BUSINESS
            // ==========================================
            if (invitation.business.status !==
                'ACTIVE') {
                throw new api_error_1.ApiError(403, 'This business is no longer active', api_error_1.ErrorCodes.BUSINESS_NOT_FOUND);
            }
            // ==========================================
            // RETURN SAFE DETAILS
            // ==========================================
            return {
                invitationId: invitation.id,
                business: {
                    id: invitation.business.id,
                    name: invitation.business.name,
                },
                phone: invitation.phone,
                expiresAt: invitation.expiresAt,
                status: invitation.status,
                roles: invitation.roles.map((invitationRole) => ({
                    role: {
                        id: invitationRole.role.id,
                        name: invitationRole.role.name,
                    },
                    scopeType: invitationRole.scopeType,
                    branches: invitationRole.branches.map((item) => ({
                        id: item.branch.id,
                        name: item.branch.name,
                    })),
                })),
                requiresAuthentication: true,
            };
        });
    }
    acceptInvitation(invitationToken, authUserId, verificationToken) {
        return __awaiter(this, void 0, void 0, function* () {
            // ============================================================
            // 1. Hash invitation token
            // ============================================================
            const invitationTokenHash = (0, otp_1.hashVerificationToken)(invitationToken);
            // ============================================================
            // 2. Find invitation
            // ============================================================
            const invitation = yield prisma_1.prisma.businessInvitation.findUnique({
                where: {
                    tokenHash: invitationTokenHash,
                },
                include: {
                    roles: {
                        include: {
                            branches: true,
                        },
                    },
                    business: {
                        select: {
                            id: true,
                            status: true,
                        },
                    },
                },
            });
            // ============================================================
            // 3. Invitation must exist
            // ============================================================
            if (!invitation) {
                throw new api_error_1.ApiError(404, 'Invitation not found', api_error_1.ErrorCodes.INVITATION_NOT_FOUND);
            }
            // ============================================================
            // 4. Check invitation status
            // ============================================================
            if (invitation.status === 'ACCEPTED') {
                throw new api_error_1.ApiError(409, 'This invitation has already been accepted', api_error_1.ErrorCodes.CONFLICT);
            }
            if (invitation.status === 'REVOKED') {
                throw new api_error_1.ApiError(410, 'This invitation has been revoked', api_error_1.ErrorCodes.INVITATION_REVOKED);
            }
            // ============================================================
            // 5. Check expiration
            // ============================================================
            if (invitation.expiresAt <= new Date()) {
                // Update only if still pending.
                if (invitation.status === 'PENDING') {
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
            // 6. Check business
            // ============================================================
            if (invitation.business.status !== 'ACTIVE') {
                throw new api_error_1.ApiError(403, 'Business is not active', api_error_1.ErrorCodes.BUSINESS_SUSPENDED);
            }
            // ============================================================
            // 7. Authentication / verification
            //
            // There are two valid paths:
            //
            // A. Existing user:
            //      authUserId
            //
            // B. Invitation registration:
            //      verificationToken
            //
            // ============================================================
            let authenticatedUserId;
            let challengeId = null;
            // ============================================================
            // PATH A: AUTHENTICATED USER
            // ============================================================
            if (authUserId) {
                const authUser = yield prisma_1.prisma.user.findUnique({
                    where: {
                        id: authUserId,
                    },
                    select: {
                        id: true,
                        phone: true,
                        status: true,
                    },
                });
                if (!authUser) {
                    throw new api_error_1.ApiError(401, 'Authenticated user not found', api_error_1.ErrorCodes.USER_NOT_FOUND);
                }
                if (authUser.status !== 'ACTIVE') {
                    throw new api_error_1.ApiError(403, 'User account is not active', api_error_1.ErrorCodes.USER_SUSPENDED);
                }
                // IMPORTANT:
                // The authenticated user's phone must match
                // the phone to which the invitation was sent.
                if ((0, phone_1.normalizePhone)(authUser.phone) !==
                    (0, phone_1.normalizePhone)(invitation.phone)) {
                    throw new api_error_1.ApiError(403, 'Invitation phone does not match the authenticated user', api_error_1.ErrorCodes.INVITATION_PHONE_MISMATCH);
                }
                authenticatedUserId = authUser.id;
            }
            // ============================================================
            // PATH B: VERIFIED INVITATION REGISTRATION
            // ============================================================
            else if (verificationToken) {
                const tokenHash = (0, otp_1.hashVerificationToken)(verificationToken);
                const challenge = yield prisma_1.prisma.otpChallenge.findFirst({
                    where: {
                        phone: (0, phone_1.normalizePhone)(invitation.phone),
                        purpose: 'INVITATION_ACCEPTANCE',
                        status: 'VERIFIED',
                        verificationTokenHash: tokenHash,
                    },
                    select: {
                        id: true,
                        phone: true,
                    },
                });
                if (!challenge) {
                    throw new api_error_1.ApiError(400, 'Invalid or expired verification token', api_error_1.ErrorCodes.OTP_INVALID);
                }
                challengeId = challenge.id;
                const user = yield prisma_1.prisma.user.findUnique({
                    where: {
                        phone: (0, phone_1.normalizePhone)(invitation.phone),
                    },
                    select: {
                        id: true,
                        status: true,
                    },
                });
                if (!user) {
                    throw new api_error_1.ApiError(404, 'User not found. Please complete registration first.', api_error_1.ErrorCodes.USER_NOT_FOUND);
                }
                if (user.status !== 'ACTIVE') {
                    throw new api_error_1.ApiError(403, 'User account is not active', api_error_1.ErrorCodes.USER_SUSPENDED);
                }
                authenticatedUserId = user.id;
            }
            // ============================================================
            // NO AUTHENTICATION
            // ============================================================
            else {
                throw new api_error_1.ApiError(401, 'Authentication required. Please log in or complete registration first.', api_error_1.ErrorCodes.UNAUTHORIZED);
            }
            // ============================================================
            // 8. TRANSACTION
            //
            // Everything from here is database-only.
            // No SMS.
            // No external API.
            // ============================================================
            return prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                // ----------------------------------------------------------
                // Re-check invitation inside transaction
                //
                // This protects against two requests accepting the same
                // invitation at the same time.
                // ----------------------------------------------------------
                const currentInvitation = yield tx.businessInvitation.findUnique({
                    where: {
                        id: invitation.id,
                    },
                    select: {
                        id: true,
                        businessId: true,
                        status: true,
                        expiresAt: true,
                        phone: true,
                    },
                });
                if (!currentInvitation) {
                    throw new api_error_1.ApiError(404, 'Invitation not found', api_error_1.ErrorCodes.INVITATION_NOT_FOUND);
                }
                if (currentInvitation.status !==
                    'PENDING') {
                    if (currentInvitation.status ===
                        'ACCEPTED') {
                        throw new api_error_1.ApiError(409, 'This invitation has already been accepted', api_error_1.ErrorCodes.CONFLICT);
                    }
                    throw new api_error_1.ApiError(410, 'This invitation is no longer valid', api_error_1.ErrorCodes.INVITATION_NOT_FOUND);
                }
                if (currentInvitation.expiresAt <=
                    new Date()) {
                    yield tx.businessInvitation.update({
                        where: {
                            id: currentInvitation.id,
                        },
                        data: {
                            status: 'EXPIRED',
                        },
                    });
                    throw new api_error_1.ApiError(410, 'Invitation has expired', api_error_1.ErrorCodes.INVITATION_EXPIRED);
                }
                // ----------------------------------------------------------
                // Find user
                // ----------------------------------------------------------
                const user = yield tx.user.findUnique({
                    where: {
                        id: authenticatedUserId,
                    },
                    select: {
                        id: true,
                        phone: true,
                        status: true,
                    },
                });
                if (!user) {
                    throw new api_error_1.ApiError(404, 'User not found', api_error_1.ErrorCodes.USER_NOT_FOUND);
                }
                if (user.status !== 'ACTIVE') {
                    throw new api_error_1.ApiError(403, 'User account is not active', api_error_1.ErrorCodes.USER_SUSPENDED);
                }
                // ----------------------------------------------------------
                // FINAL phone check inside transaction
                // ----------------------------------------------------------
                if ((0, phone_1.normalizePhone)(user.phone) !==
                    (0, phone_1.normalizePhone)(currentInvitation.phone)) {
                    throw new api_error_1.ApiError(403, 'Invitation phone does not match the authenticated user', api_error_1.ErrorCodes.INVITATION_PHONE_MISMATCH);
                }
                // ----------------------------------------------------------
                // Find existing membership
                // ----------------------------------------------------------
                const existingMember = yield tx.businessMember.findUnique({
                    where: {
                        businessId_userId: {
                            businessId: currentInvitation.businessId,
                            userId: user.id,
                        },
                    },
                });
                let member;
                // ----------------------------------------------------------
                // Existing inactive membership
                // ----------------------------------------------------------
                if (existingMember) {
                    if (existingMember.status ===
                        'ACTIVE') {
                        throw new api_error_1.ApiError(409, 'Already a member of this business', api_error_1.ErrorCodes.CONFLICT);
                    }
                    member =
                        yield tx.businessMember.update({
                            where: {
                                id: existingMember.id,
                            },
                            data: {
                                status: 'ACTIVE',
                                joinedAt: new Date(),
                            },
                        });
                }
                // ----------------------------------------------------------
                // New membership
                // ----------------------------------------------------------
                else {
                    member =
                        yield tx.businessMember.create({
                            data: {
                                businessId: currentInvitation.businessId,
                                userId: user.id,
                                status: 'ACTIVE',
                                joinedAt: new Date(),
                            },
                        });
                }
                // ==========================================================
                // 9. ASSIGN INVITATION ROLES
                // ==========================================================
                // for (
                //   const invRole of invitation.roles
                // ) {
                //   // --------------------------------------------------------
                //   // Check if role assignment already exists
                //   // --------------------------------------------------------
                //   let userRole =
                //     await tx.userRole.findFirst({
                //       where: {
                //         businessMemberId:
                //           member.id,
                //         roleId:
                //           invRole.roleId,
                //         scopeType:
                //           invRole.scopeType,
                //       },
                //     });
                //   // --------------------------------------------------------
                //   // Create role assignment
                //   // --------------------------------------------------------
                //   if (!userRole) {
                //     userRole =
                //       await tx.userRole.create({
                //         data: {
                //           businessMemberId:
                //             member.id,
                //           roleId:
                //             invRole.roleId,
                //           scopeType:
                //             invRole.scopeType,
                //         },
                //       });
                //   }
                //   // --------------------------------------------------------
                //   // Branch assignments
                //   // --------------------------------------------------------
                //   if (
                //     invRole.scopeType ===
                //       'BRANCH' &&
                //     invRole.branches.length > 0
                //   ) {
                //     const branchIds =
                //       invRole.branches.map(
                //         (branch) =>
                //           branch.branchId
                //       );
                //     // If your UserRoleBranch model has a
                //     // unique constraint on:
                //     //
                //     // userRoleId + branchId
                //     //
                //     // this is the cleanest approach.
                //     await tx.userRoleBranch.createMany({
                //       data:
                //         branchIds.map(
                //           (branchId) => ({
                //             userRoleId:
                //               userRole.id,
                //             branchId,
                //           })
                //         ),
                //       skipDuplicates:
                //         true,
                //     });
                //   }
                // }
                for (const invRole of invitation.roles) {
                    // --------------------------------------------------------
                    // Upsert role assignment (avoids manual find + create)
                    // --------------------------------------------------------
                    const userRole = yield tx.userRole.upsert({
                        where: {
                            businessMemberId_roleId_scopeType: {
                                businessMemberId: member.id,
                                roleId: invRole.roleId,
                                scopeType: invRole.scopeType,
                            },
                        },
                        update: {}, // nothing to update if exists
                        create: {
                            businessMemberId: member.id,
                            roleId: invRole.roleId,
                            scopeType: invRole.scopeType,
                        },
                    });
                    // --------------------------------------------------------
                    // Branch assignments (only if BRANCH scope)
                    // --------------------------------------------------------
                    if (invRole.scopeType === 'BRANCH' && invRole.branches.length > 0) {
                        const branchIds = invRole.branches.map(b => b.branchId);
                        yield tx.userRoleBranch.createMany({
                            data: branchIds.map(branchId => ({
                                userRoleId: userRole.id,
                                branchId,
                            })),
                            skipDuplicates: true, // ensures uniqueness if constraint exists
                        });
                    }
                }
                // ==========================================================
                // 10. MARK INVITATION AS ACCEPTED
                // ==========================================================
                yield tx.businessInvitation.update({
                    where: {
                        id: currentInvitation.id,
                    },
                    data: {
                        status: 'ACCEPTED',
                        acceptedAt: new Date(),
                        acceptedByUserId: user.id,
                    },
                });
                // ==========================================================
                // 11. CONSUME OTP CHALLENGE
                // ==========================================================
                if (challengeId) {
                    yield tx.otpChallenge.update({
                        where: {
                            id: challengeId,
                        },
                        data: {
                            status: 'CONSUMED',
                        },
                    });
                }
                // ==========================================================
                // 12. RESULT
                // ==========================================================
                return {
                    businessId: currentInvitation.businessId,
                    memberId: member.id,
                    invitationId: currentInvitation.id,
                };
            }));
        });
    }
    getInvitations(businessId, status) {
        return __awaiter(this, void 0, void 0, function* () {
            const where = { businessId };
            if (status)
                where.status = status;
            return prisma_1.prisma.businessInvitation.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                include: {
                    roles: {
                        include: {
                            role: { select: { id: true, name: true, systemKey: true } },
                            branches: { include: { branch: { select: { id: true, name: true } } } },
                        },
                    },
                    invitedByMember: {
                        include: { user: { select: { id: true, phone: true } } },
                    },
                },
            });
        });
    }
    resendInvitation(invitationId, businessId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                const invitation = yield tx.businessInvitation.findFirst({
                    where: { id: invitationId, businessId },
                    include: {
                        roles: { include: { role: true, branches: true } },
                        business: { select: { name: true, status: true } },
                    },
                });
                if (!invitation) {
                    throw new api_error_1.ApiError(404, 'Invitation not found', api_error_1.ErrorCodes.INVITATION_NOT_FOUND);
                }
                if (invitation.status !== 'PENDING') {
                    throw new api_error_1.ApiError(400, 'Can only resend pending invitations', api_error_1.ErrorCodes.INVALID_SCOPE_CONFIGURATION);
                }
                const newExpiresAt = new Date();
                newExpiresAt.setDate(newExpiresAt.getDate() + 7);
                const updatedInvitation = yield tx.businessInvitation.update({
                    where: { id: invitationId },
                    data: { expiresAt: newExpiresAt },
                });
                const invitationToken = (0, otp_1.generateVerificationToken)();
                const invitationUrl = this.buildInvitationUrl(invitationToken);
                yield (0, sms_service_1.sendInvitationLinkSms)(invitation.phone, invitationUrl);
                return Object.assign(Object.assign({}, updatedInvitation), { invitationUrl });
            }));
        });
    }
    revokeInvitation(invitationId, businessId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                const invitation = yield tx.businessInvitation.findFirst({
                    where: { id: invitationId, businessId },
                });
                if (!invitation) {
                    throw new api_error_1.ApiError(404, 'Invitation not found', api_error_1.ErrorCodes.INVITATION_NOT_FOUND);
                }
                if (invitation.status !== 'PENDING') {
                    throw new api_error_1.ApiError(400, 'Can only revoke pending invitations', api_error_1.ErrorCodes.INVALID_SCOPE_CONFIGURATION);
                }
                return tx.businessInvitation.update({
                    where: { id: invitationId },
                    data: { status: 'REVOKED', revokedAt: new Date() },
                });
            }));
        });
    }
}
exports.InvitationService = InvitationService;
exports.invitationService = new InvitationService();
