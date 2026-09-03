"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.businessBrandingSchema = exports.businessUpdateSchema = exports.roleAssignmentSchema = exports.rolePermissionSchema = exports.roleUpdateSchema = exports.roleCreateSchema = exports.memberStatusSchema = exports.memberUpdateSchema = exports.invitationAcceptSchema = exports.invitationRegisterSchema = exports.invitationCreateSchema = exports.loginCompleteSchema = exports.resendOtpSchema = exports.changePhoneVerifySchema = exports.changePhoneRequestSchema = exports.changePasswordSchema = exports.resetPasswordSchema = exports.verifyPasswordResetSchema = exports.forgotPasswordSchema = exports.loginSchema = exports.registerVerifySchema = exports.registerSchema = exports.otpVerifySchema = exports.otpRequestSchema = exports.passwordSchema = exports.phoneSchema = void 0;
const zod_1 = require("zod");
exports.phoneSchema = zod_1.z.string().regex(/^\+[1-9]\d{1,14}$/, 'Invalid phone number format. Use E.164 format (e.g., +2519XXXXXXXX)');
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
exports.passwordSchema = zod_1.z.string().min(8).regex(passwordPattern, 'Password must be at least 8 characters and include uppercase, lowercase, and a number.');
exports.otpRequestSchema = zod_1.z.object({
    phone: exports.phoneSchema,
    purpose: zod_1.z.enum(['LOGIN', 'REGISTRATION', 'PASSWORD_RESET', 'PHONE_VERIFICATION', 'INVITATION_ACCEPTANCE', 'PHONE_CHANGE']).default('LOGIN'),
});
exports.otpVerifySchema = zod_1.z.object({
    phone: exports.phoneSchema,
    otp: zod_1.z.string().regex(/^\d{4,8}$/, 'OTP must be 4-8 digits'),
    purpose: zod_1.z.enum(['LOGIN', 'REGISTRATION', 'PASSWORD_RESET', 'PHONE_VERIFICATION', 'INVITATION_ACCEPTANCE', 'PHONE_CHANGE']).default('LOGIN'),
});
exports.registerSchema = zod_1.z.object({
    phone: exports.phoneSchema,
    password: exports.passwordSchema,
    business: zod_1.z.object({
        name: zod_1.z.string().min(1).max(100),
        currency: zod_1.z.string().length(3).default('ETB'),
        timezone: zod_1.z.string().default('Africa/Addis_Ababa'),
    }),
});
exports.registerVerifySchema = zod_1.z.object({
    phone: exports.phoneSchema,
    otp: zod_1.z.string().regex(/^\d{4,8}$/, 'OTP must be 4-8 digits'),
});
exports.loginSchema = zod_1.z.object({
    phone: exports.phoneSchema,
    password: zod_1.z.string().min(1, 'Password is required'),
});
exports.forgotPasswordSchema = zod_1.z.object({
    phone: exports.phoneSchema,
});
exports.verifyPasswordResetSchema = zod_1.z.object({
    phone: exports.phoneSchema,
    otp: zod_1.z.string().regex(/^\d{4,8}$/, 'OTP must be 4-8 digits'),
});
exports.resetPasswordSchema = zod_1.z.object({
    passwordResetToken: zod_1.z.string().min(1, 'Password reset token is required'),
    newPassword: exports.passwordSchema,
});
exports.changePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1, 'Current password is required'),
    newPassword: exports.passwordSchema,
});
exports.changePhoneRequestSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1, 'Current password is required'),
    newPhone: exports.phoneSchema,
});
exports.changePhoneVerifySchema = zod_1.z.object({
    newPhone: exports.phoneSchema,
    otp: zod_1.z.string().regex(/^\d{4,8}$/, 'OTP must be 4-8 digits'),
});
exports.resendOtpSchema = zod_1.z.object({
    phone: exports.phoneSchema,
    purpose: zod_1.z.enum(['LOGIN', 'REGISTRATION', 'PASSWORD_RESET', 'PHONE_VERIFICATION', 'INVITATION_ACCEPTANCE', 'PHONE_CHANGE']).default('LOGIN'),
});
exports.loginCompleteSchema = zod_1.z.object({
    verificationToken: zod_1.z.string().min(1, 'Verification token is required'),
});
exports.invitationCreateSchema = zod_1.z.object({
    phone: exports.phoneSchema,
    roles: zod_1.z.array(zod_1.z.object({
        roleId: zod_1.z.string().uuid('Invalid role ID'),
        scopeType: zod_1.z.enum(['BUSINESS', 'BRANCH']),
        branchIds: zod_1.z.array(zod_1.z.string().uuid()).optional(),
    })).min(1, 'At least one role is required'),
}).refine(data => {
    return data.roles.every(role => {
        if (role.scopeType === 'BUSINESS') {
            return !role.branchIds || role.branchIds.length === 0;
        }
        return role.branchIds && role.branchIds.length > 0;
    });
}, {
    message: 'BUSINESS scope requires no branchIds; BRANCH scope requires at least one branchId',
    path: ['roles'],
});
exports.invitationRegisterSchema = zod_1.z.object({
    password: exports.passwordSchema,
}).strict();
exports.invitationAcceptSchema = zod_1.z.object({
    verificationToken: zod_1.z.string().min(1, 'Verification token is required').optional(),
}).strict();
exports.memberUpdateSchema = zod_1.z.object({
// Add allowed member update fields here
}).strict();
exports.memberStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(['ACTIVE', 'SUSPENDED']),
});
exports.roleCreateSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(50),
    description: zod_1.z.string().max(255).optional(),
    permissionCodes: zod_1.z.array(zod_1.z.string()).optional(),
});
exports.roleUpdateSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(50).optional(),
    description: zod_1.z.string().max(255).optional(),
    isActive: zod_1.z.boolean().optional(),
}).strict();
exports.rolePermissionSchema = zod_1.z.object({
    permissionCodes: zod_1.z.array(zod_1.z.string()).min(1, 'At least one permission is required'),
});
exports.roleAssignmentSchema = zod_1.z.object({
    roleId: zod_1.z.string().uuid('Invalid role ID'),
    scopeType: zod_1.z.enum(['BUSINESS', 'BRANCH']),
    branchIds: zod_1.z.array(zod_1.z.string().uuid()).optional(),
}).refine(data => {
    if (data.scopeType === 'BUSINESS') {
        return !data.branchIds || data.branchIds.length === 0;
    }
    return data.branchIds && data.branchIds.length > 0;
}, {
    message: 'BUSINESS scope requires no branchIds; BRANCH scope requires at least one branchId',
    path: ['branchIds'],
});
exports.businessUpdateSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100).optional(),
    currency: zod_1.z.string().length(3).optional(),
    timezone: zod_1.z.string().optional(),
}).strict().refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
});
exports.businessBrandingSchema = zod_1.z.object({
    logoUrl: zod_1.z.string().url().nullable().optional(),
    coverImageUrl: zod_1.z.string().url().nullable().optional(),
    primaryColor: zod_1.z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Must be a valid hex color (e.g., #FF0000)').nullable().optional(),
    secondaryColor: zod_1.z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Must be a valid hex color (e.g., #00FF00)').nullable().optional(),
    description: zod_1.z.string().max(1000).nullable().optional(),
    aboutUs: zod_1.z.string().max(5000).nullable().optional(),
    address: zod_1.z.string().max(500).nullable().optional(),
    phone: zod_1.z.string().regex(/^\+[1-9]\d{1,14}$/, 'Invalid phone number format. Use E.164 format (e.g., +2519XXXXXXXX)').nullable().optional(),
    email: zod_1.z.string().email().nullable().optional(),
    website: zod_1.z.string().url().nullable().optional(),
    facebookUrl: zod_1.z.string().url().nullable().optional(),
    instagramUrl: zod_1.z.string().url().nullable().optional(),
    telegramUrl: zod_1.z.string().url().nullable().optional(),
    tiktokUrl: zod_1.z.string().url().nullable().optional(),
}).strict().refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
});
