export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, message: string, code: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, message, 'BAD_REQUEST', details);
  }

  static unauthorized(message: string = 'Unauthorized', details?: unknown): ApiError {
    return new ApiError(401, message, 'UNAUTHORIZED', details);
  }

  static forbidden(message: string = 'Forbidden', details?: unknown): ApiError {
    return new ApiError(403, message, 'FORBIDDEN', details);
  }

  static notFound(message: string = 'Resource not found', details?: unknown): ApiError {
    return new ApiError(404, message, 'NOT_FOUND', details);
  }

  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError(409, message, 'CONFLICT', details);
  }

  static tooManyRequests(message: string = 'Too many requests', details?: unknown): ApiError {
    return new ApiError(429, message, 'TOO_MANY_REQUESTS', details);
  }

  static internal(message: string = 'Internal server error', details?: unknown): ApiError {
    return new ApiError(500, message, 'INTERNAL_ERROR', details);
  }

  static validationError(details: unknown): ApiError {
    return new ApiError(400, 'Validation failed', 'VALIDATION_ERROR', details);
  }
}

export const ErrorCodes = {
  // Generic
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',

  // Authentication
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  SESSION_REVOKED: 'SESSION_REVOKED',

  // OTP
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_INVALID: 'OTP_INVALID',
  OTP_MAX_ATTEMPTS: 'OTP_MAX_ATTEMPTS',
  OTP_ALREADY_VERIFIED: 'OTP_ALREADY_VERIFIED',
  OTP_RESEND_COOLDOWN: 'OTP_RESEND_COOLDOWN',
  OTP_RATE_LIMITED: 'OTP_RATE_LIMITED',

  // User
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USER_SUSPENDED: 'USER_SUSPENDED',
  USER_ALREADY_EXISTS: 'USER_ALREADY_EXISTS',
  PHONE_NOT_VERIFIED: 'PHONE_NOT_VERIFIED',

  // Business
  BUSINESS_NOT_FOUND: 'BUSINESS_NOT_FOUND',
  BUSINESS_SUSPENDED: 'BUSINESS_SUSPENDED',
  NOT_BUSINESS_MEMBER: 'NOT_BUSINESS_MEMBER',
  MEMBER_STATUS_INVALID: 'MEMBER_STATUS_INVALID',

  // Permissions
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  PERMISSION_NOT_FOUND: 'PERMISSION_NOT_FOUND',
  ROLE_NOT_FOUND: 'ROLE_NOT_FOUND',
  ROLE_SYSTEM_PROTECTED: 'ROLE_SYSTEM_PROTECTED',
  ROLE_HAS_MEMBERS: 'ROLE_HAS_MEMBERS',

  // Invitations
  INVITATION_NOT_FOUND: 'INVITATION_NOT_FOUND',
  INVITATION_EXPIRED: 'INVITATION_EXPIRED',
  INVITATION_REVOKED: 'INVITATION_REVOKED',
  INVITATION_ALREADY_ACCEPTED: 'INVITATION_ALREADY_ACCEPTED',
  INVITATION_PHONE_MISMATCH: 'INVITATION_PHONE_MISMATCH',
  INVITATION_INVALID_SCOPE: 'INVITATION_INVALID_SCOPE',

  // Owner Protection
  CANNOT_REMOVE_LAST_OWNER: 'CANNOT_REMOVE_LAST_OWNER',
  CANNOT_SUSPEND_LAST_OWNER: 'CANNOT_SUSPEND_LAST_OWNER',
  CANNOT_REMOVE_OWNER_ROLE: 'CANNOT_REMOVE_OWNER_ROLE',
  OWNER_ROLE_PROTECTED: 'OWNER_ROLE_PROTECTED',
  OWNER_PERMISSIONS_PROTECTED: 'OWNER_PERMISSIONS_PROTECTED',

  // Validation
  INVALID_PHONE_NUMBER: 'INVALID_PHONE_NUMBER',
  INVALID_SCOPE_CONFIGURATION: 'INVALID_SCOPE_CONFIGURATION',
  BRANCH_NOT_IN_BUSINESS: 'BRANCH_NOT_IN_BUSINESS',
  ROLE_NOT_IN_BUSINESS: 'ROLE_NOT_IN_BUSINESS',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];