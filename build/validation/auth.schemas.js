"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.branchBookingConfigUpdateSchema = exports.branchDateOverrideUpdateSchema = exports.branchDateOverrideCreateSchema = exports.branchWeeklyHoursSchema = exports.branchUpdateSchema = exports.branchCreateSchema = exports.businessBrandingSchema = exports.businessUpdateSchema = exports.roleAssignmentSchema = exports.rolePermissionSchema = exports.roleUpdateSchema = exports.roleCreateSchema = exports.memberStatusSchema = exports.memberUpdateSchema = exports.invitationAcceptSchema = exports.invitationRegisterSchema = exports.invitationCreateSchema = exports.loginCompleteSchema = exports.resendOtpSchema = exports.changePhoneVerifySchema = exports.changePhoneRequestSchema = exports.changePasswordSchema = exports.resetPasswordSchema = exports.verifyPasswordResetSchema = exports.forgotPasswordSchema = exports.loginSchema = exports.registerVerifySchema = exports.registerSchema = exports.otpVerifySchema = exports.otpRequestSchema = exports.passwordSchema = exports.phoneSchema = void 0;
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
const timeStringSchema = zod_1.z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be in HH:mm format (24-hour)');
const weeklyHourIntervalSchema = zod_1.z.object({
    start: timeStringSchema,
    end: timeStringSchema,
});
const weeklyDaySchema = zod_1.z.object({
    dayOfWeek: zod_1.z.number().int().min(0).max(6),
    isClosed: zod_1.z.boolean().default(false),
    intervals: zod_1.z.array(weeklyHourIntervalSchema).default([]),
}).refine(data => {
    if (data.isClosed) {
        return data.intervals.length === 0;
    }
    return data.intervals.length > 0;
}, {
    message: 'Closed days must have empty intervals; open days must have at least one interval',
    path: ['intervals'],
}).refine(data => {
    if (!data.isClosed) {
        const intervals = data.intervals.map(i => ({ start: i.start, end: i.end }));
        const sorted = [...intervals].sort((a, b) => a.start.localeCompare(b.start));
        for (let i = 0; i < sorted.length - 1; i++) {
            if (sorted[i].end > sorted[i + 1].start) {
                return false;
            }
        }
    }
    return true;
}, {
    message: 'Intervals cannot overlap',
    path: ['intervals'],
});
const dateOverrideIntervalSchema = zod_1.z.object({
    start: timeStringSchema,
    end: timeStringSchema,
});
const dateOverrideSchema = zod_1.z.object({
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
    isClosed: zod_1.z.boolean().default(false),
    intervals: zod_1.z.array(dateOverrideIntervalSchema).default([]),
}).refine(data => {
    if (data.isClosed) {
        return data.intervals.length === 0;
    }
    return data.intervals.length > 0;
}, {
    message: 'Closed dates must have empty intervals; open dates must have at least one interval',
    path: ['intervals'],
}).refine(data => {
    if (!data.isClosed) {
        const intervals = data.intervals.map(i => ({ start: i.start, end: i.end }));
        const sorted = [...intervals].sort((a, b) => a.start.localeCompare(b.start));
        for (let i = 0; i < sorted.length - 1; i++) {
            if (sorted[i].end > sorted[i + 1].start) {
                return false;
            }
        }
    }
    return true;
}, {
    message: 'Intervals cannot overlap',
    path: ['intervals'],
});
exports.branchCreateSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100),
    address: zod_1.z.string().min(1).max(500),
    timezone: zod_1.z.string().optional(),
}).strict();
exports.branchUpdateSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100).optional(),
    address: zod_1.z.string().max(500).nullable().optional(),
    timezone: zod_1.z.string().optional(),
    isActive: zod_1.z.boolean().optional(),
}).strict().refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
});
exports.branchWeeklyHoursSchema = zod_1.z.object({
    days: zod_1.z.array(weeklyDaySchema).length(7),
}).strict().refine(data => {
    const days = data.days.map(d => d.dayOfWeek);
    const uniqueDays = new Set(days);
    return uniqueDays.size === 7 && days.every(d => d >= 0 && d <= 6);
}, {
    message: 'Must provide exactly 7 unique days (0-6)',
    path: ['days'],
});
exports.branchDateOverrideCreateSchema = zod_1.z.object({
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
    isClosed: zod_1.z.boolean().default(false),
    intervals: zod_1.z.array(dateOverrideIntervalSchema).default([]),
}).strict().refine(data => {
    if (data.isClosed) {
        return data.intervals.length === 0;
    }
    return data.intervals.length > 0;
}, {
    message: 'Closed dates must have empty intervals; open dates must have at least one interval',
    path: ['intervals'],
}).refine(data => {
    if (!data.isClosed) {
        const intervals = data.intervals.map(i => ({ start: i.start, end: i.end }));
        const sorted = [...intervals].sort((a, b) => a.start.localeCompare(b.start));
        for (let i = 0; i < sorted.length - 1; i++) {
            if (sorted[i].end > sorted[i + 1].start) {
                return false;
            }
        }
    }
    return true;
}, {
    message: 'Intervals cannot overlap',
    path: ['intervals'],
});
exports.branchDateOverrideUpdateSchema = zod_1.z.object({
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional(),
    isClosed: zod_1.z.boolean().optional(),
    intervals: zod_1.z.array(dateOverrideIntervalSchema).optional(),
}).strict().refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
}).refine(data => {
    if (data.isClosed === true && data.intervals && data.intervals.length > 0) {
        return false;
    }
    if (data.isClosed === false && data.intervals && data.intervals.length === 0) {
        return false;
    }
    return true;
}, {
    message: 'Closed dates must have empty intervals; open dates must have at least one interval',
    path: ['intervals'],
});
exports.branchBookingConfigUpdateSchema = zod_1.z.object({
    onlineBookingEnabled: zod_1.z.boolean().optional(),
    walkInEnabled: zod_1.z.boolean().optional(),
    bookingApprovalRequired: zod_1.z.boolean().optional(),
    minimumAdvanceBookingMinutes: zod_1.z.number().int().min(0).optional(),
    maximumAdvanceBookingDays: zod_1.z.number().int().min(1).optional(),
    cancellationWindowMinutes: zod_1.z.number().int().min(0).optional(),
    reschedulingEnabled: zod_1.z.boolean().optional(),
    bookingBufferMinutes: zod_1.z.number().int().min(0).optional(),
    waitlistEnabled: zod_1.z.boolean().optional(),
}).strict().refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
});
