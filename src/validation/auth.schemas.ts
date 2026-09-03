import { z } from 'zod';

export const phoneSchema = z.string().regex(/^\+[1-9]\d{1,14}$/, 'Invalid phone number format. Use E.164 format (e.g., +2519XXXXXXXX)');

const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

export const passwordSchema = z.string().min(8).regex(passwordPattern, 'Password must be at least 8 characters and include uppercase, lowercase, and a number.');

export const otpRequestSchema = z.object({
  phone: phoneSchema,
  purpose: z.enum(['LOGIN', 'REGISTRATION', 'PASSWORD_RESET', 'PHONE_VERIFICATION', 'INVITATION_ACCEPTANCE', 'PHONE_CHANGE']).default('LOGIN'),
});

export const otpVerifySchema = z.object({
  phone: phoneSchema,
  otp: z.string().regex(/^\d{4,8}$/, 'OTP must be 4-8 digits'),
  purpose: z.enum(['LOGIN', 'REGISTRATION', 'PASSWORD_RESET', 'PHONE_VERIFICATION', 'INVITATION_ACCEPTANCE', 'PHONE_CHANGE']).default('LOGIN'),
});

export const registerSchema = z.object({
  phone: phoneSchema,
  password: passwordSchema,
  business: z.object({
    name: z.string().min(1).max(100),
    currency: z.string().length(3).default('ETB'),
    timezone: z.string().default('Africa/Addis_Ababa'),
  }),
});

export const registerVerifySchema = z.object({
  phone: phoneSchema,
  otp: z.string().regex(/^\d{4,8}$/, 'OTP must be 4-8 digits'),
});

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  phone: phoneSchema,
});

export const verifyPasswordResetSchema = z.object({
  phone: phoneSchema,
  otp: z.string().regex(/^\d{4,8}$/, 'OTP must be 4-8 digits'),
});

export const resetPasswordSchema = z.object({
  passwordResetToken: z.string().min(1, 'Password reset token is required'),
  newPassword: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

export const changePhoneRequestSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPhone: phoneSchema,
});

export const changePhoneVerifySchema = z.object({
  newPhone: phoneSchema,
  otp: z.string().regex(/^\d{4,8}$/, 'OTP must be 4-8 digits'),
});

export const resendOtpSchema = z.object({
  phone: phoneSchema,
  purpose: z.enum(['LOGIN', 'REGISTRATION', 'PASSWORD_RESET', 'PHONE_VERIFICATION', 'INVITATION_ACCEPTANCE', 'PHONE_CHANGE']).default('LOGIN'),
});

export const loginCompleteSchema = z.object({
  verificationToken: z.string().min(1, 'Verification token is required'),
});

export const invitationCreateSchema = z.object({
  phone: phoneSchema,
  roles: z.array(z.object({
    roleId: z.string().uuid('Invalid role ID'),
    scopeType: z.enum(['BUSINESS', 'BRANCH']),
    branchIds: z.array(z.string().uuid()).optional(),
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

export const invitationRegisterSchema = z.object({
  password: passwordSchema,
}).strict();

export const invitationAcceptSchema = z.object({
  verificationToken: z.string().min(1, 'Verification token is required').optional(),
}).strict();

export const memberUpdateSchema = z.object({
  // Add allowed member update fields here
}).strict();

export const memberStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});

export const roleCreateSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().max(255).optional(),
  permissionCodes: z.array(z.string()).optional(),
});

export const roleUpdateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  description: z.string().max(255).optional(),
  isActive: z.boolean().optional(),
}).strict();

export const rolePermissionSchema = z.object({
  permissionCodes: z.array(z.string()).min(1, 'At least one permission is required'),
});

export const roleAssignmentSchema = z.object({
  roleId: z.string().uuid('Invalid role ID'),
  scopeType: z.enum(['BUSINESS', 'BRANCH']),
  branchIds: z.array(z.string().uuid()).optional(),
}).refine(data => {
  if (data.scopeType === 'BUSINESS') {
    return !data.branchIds || data.branchIds.length === 0;
  }
  return data.branchIds && data.branchIds.length > 0;
}, {
  message: 'BUSINESS scope requires no branchIds; BRANCH scope requires at least one branchId',
  path: ['branchIds'],
});

export const businessUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  currency: z.string().length(3).optional(),
  timezone: z.string().optional(),
}).strict().refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

export const businessBrandingSchema = z.object({
  logoUrl: z.string().url().nullable().optional(),
  coverImageUrl: z.string().url().nullable().optional(),
  primaryColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Must be a valid hex color (e.g., #FF0000)').nullable().optional(),
  secondaryColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Must be a valid hex color (e.g., #00FF00)').nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  aboutUs: z.string().max(5000).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Invalid phone number format. Use E.164 format (e.g., +2519XXXXXXXX)').nullable().optional(),
  email: z.string().email().nullable().optional(),
  website: z.string().url().nullable().optional(),
  facebookUrl: z.string().url().nullable().optional(),
  instagramUrl: z.string().url().nullable().optional(),
  telegramUrl: z.string().url().nullable().optional(),
  tiktokUrl: z.string().url().nullable().optional(),
}).strict().refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});