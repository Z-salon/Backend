import { prisma } from '../../../libs/prisma';
import { auditLogService } from './audit-log.service';
import { ApiError, ErrorCodes } from '../../../utils/api-error';

export interface BusinessUpdateInput {
  name?: string;
  currency?: string;
  timezone?: string;
}

export interface BrandingUpdateInput {
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  description?: string | null;
  aboutUs?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  telegramUrl?: string | null;
  tiktokUrl?: string | null;
}

export interface BusinessResponse {
  id: string;
  name: string;
  slug: string;
  currency: string;
  timezone: string;
  status: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  description: string | null;
  aboutUs: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  telegramUrl: string | null;
  tiktokUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const ALLOWED_BUSINESS_UPDATE_FIELDS = ['name', 'currency', 'timezone'];
const ALLOWED_BRANDING_FIELDS = [
  'logoUrl',
  'coverImageUrl',
  'primaryColor',
  'secondaryColor',
  'description',
  'aboutUs',
  'address',
  'phone',
  'email',
  'website',
  'facebookUrl',
  'instagramUrl',
  'telegramUrl',
  'tiktokUrl',
];

const SYSTEM_ROLES = ['OWNER', 'ADMIN'];
const BRANCH_MANAGER_ROLE = 'BRANCH_MANAGER';

export class BusinessConfigurationService {
  async getMyBusiness(userId: string): Promise<BusinessResponse> {
    const membership = await prisma.businessMember.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
      },
      include: {
        business: true,
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!membership) {
      throw new ApiError(404, 'No active business membership found', ErrorCodes.BUSINESS_NOT_FOUND);
    }

    const business = membership.business;
    const roleSystemKeys = membership.userRoles.map(ur => ur.role.systemKey).filter((key): key is string => Boolean(key));

    const isAllowed = roleSystemKeys.some(key => 
      SYSTEM_ROLES.includes(key) || key === BRANCH_MANAGER_ROLE
    );

    if (!isAllowed) {
      throw new ApiError(403, 'Insufficient permissions to view business configuration', ErrorCodes.INSUFFICIENT_PERMISSIONS);
    }

    return this.mapBusinessToResponse(business);
  }

  async updateBusiness(
    businessId: string,
    userId: string,
    input: BusinessUpdateInput
  ): Promise<BusinessResponse> {
    const membership = await this.verifyMembershipAndPermission(businessId, userId, SYSTEM_ROLES);

    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw new ApiError(404, 'Business not found', ErrorCodes.BUSINESS_NOT_FOUND);
    }

    const changes: Record<string, any> = {};

    for (const field of ALLOWED_BUSINESS_UPDATE_FIELDS) {
      const value = input[field as keyof BusinessUpdateInput];
      if (value !== undefined && value !== business[field as keyof typeof business]) {
        changes[field] = value;
      }
    }

    if (Object.keys(changes).length === 0) {
      return this.mapBusinessToResponse(business);
    }

    if (changes.currency) {
      this.validateCurrency(changes.currency);
    }

    if (changes.timezone) {
      this.validateTimezone(changes.timezone);
    }

    const updatedBusiness = await prisma.$transaction(async (tx) => {
      const updated = await tx.business.update({
        where: { id: businessId },
        data: changes,
      });

      const oldValues: Record<string, any> = {};
      const newValues: Record<string, any> = {};

      for (const field of Object.keys(changes)) {
        oldValues[field] = business[field as keyof typeof business];
        newValues[field] = changes[field];
      }

      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: 'BUSINESS_SETTINGS_UPDATED',
        entityType: 'Business',
        entityId: businessId,
        oldValues,
        newValues,
      }, tx);

      return updated;
    });

    return this.mapBusinessToResponse(updatedBusiness);
  }

  async updateBranding(
    businessId: string,
    userId: string,
    input: BrandingUpdateInput
  ): Promise<BusinessResponse> {
    const membership = await this.verifyMembershipAndPermission(businessId, userId, SYSTEM_ROLES);

    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw new ApiError(404, 'Business not found', ErrorCodes.BUSINESS_NOT_FOUND);
    }

    const changes: Record<string, any> = {};

    for (const field of ALLOWED_BRANDING_FIELDS) {
      const value = input[field as keyof BrandingUpdateInput];
      if (value !== undefined && value !== business[field as keyof typeof business]) {
        changes[field] = value;
      }
    }

    if (Object.keys(changes).length === 0) {
      return this.mapBusinessToResponse(business);
    }

    this.validateBrandingFields(changes);

    const updatedBusiness = await prisma.$transaction(async (tx) => {
      const updated = await tx.business.update({
        where: { id: businessId },
        data: changes,
      });

      const oldValues: Record<string, any> = {};
      const newValues: Record<string, any> = {};

      for (const field of Object.keys(changes)) {
        oldValues[field] = business[field as keyof typeof business];
        newValues[field] = changes[field];
      }

      await auditLogService.createAuditLog({
        businessId,
        actorId: userId,
        action: 'BUSINESS_BRANDING_UPDATED',
        entityType: 'Business',
        entityId: businessId,
        oldValues,
        newValues,
      }, tx);

      return updated;
    });

    return this.mapBusinessToResponse(updatedBusiness);
  }

  private async verifyMembershipAndPermission(
    businessId: string,
    userId: string,
    allowedSystemKeys: string[]
  ) {
    const membership = await prisma.businessMember.findFirst({
      where: {
        businessId,
        userId,
        status: 'ACTIVE',
      },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
        business: true,
      },
    });

    if (!membership) {
      throw new ApiError(403, 'Not a member of this business', ErrorCodes.NOT_BUSINESS_MEMBER);
    }

    if (membership.business.status !== 'ACTIVE') {
      throw new ApiError(403, 'Business is not active', ErrorCodes.BUSINESS_SUSPENDED);
    }

    const roleSystemKeys = membership.userRoles.map(ur => ur.role.systemKey).filter((key): key is string => Boolean(key));
    const hasPermission = roleSystemKeys.some(key => allowedSystemKeys.includes(key));

    if (!hasPermission) {
      throw new ApiError(403, 'Insufficient permissions', ErrorCodes.INSUFFICIENT_PERMISSIONS);
    }

    return membership;
  }

  private validateCurrency(currency: string) {
    const validCurrencies = ['ETB', 'USD', 'EUR', 'GBP', 'KES', 'NGN', 'ZAR', 'GHS', 'UGX', 'TZS', 'RWF', 'BIF', 'CDF', 'MWK', 'MZN', 'BWP', 'NAD', 'LSL', 'SZL', 'STN', 'CVE', 'KMF', 'DJF', 'ERN', 'SOS', 'SDG', 'SSP'];
    if (!validCurrencies.includes(currency.toUpperCase())) {
      throw new ApiError(400, 'Invalid currency code. Must be a valid ISO 4217 currency.', ErrorCodes.VALIDATION_ERROR);
    }
  }

  private validateTimezone(timezone: string) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch {
      throw new ApiError(400, 'Invalid timezone. Must be a valid IANA timezone identifier.', ErrorCodes.VALIDATION_ERROR);
    }
  }

  private validateBrandingFields(changes: Record<string, any>) {
    if (changes.email && changes.email !== null) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(changes.email)) {
        throw new ApiError(400, 'Invalid email format', ErrorCodes.VALIDATION_ERROR);
      }
    }

    if (changes.website && changes.website !== null) {
      try {
        new URL(changes.website);
      } catch {
        throw new ApiError(400, 'Invalid website URL', ErrorCodes.VALIDATION_ERROR);
      }
    }

    if (changes.facebookUrl && changes.facebookUrl !== null) {
      try {
        new URL(changes.facebookUrl);
      } catch {
        throw new ApiError(400, 'Invalid Facebook URL', ErrorCodes.VALIDATION_ERROR);
      }
    }

    if (changes.instagramUrl && changes.instagramUrl !== null) {
      try {
        new URL(changes.instagramUrl);
      } catch {
        throw new ApiError(400, 'Invalid Instagram URL', ErrorCodes.VALIDATION_ERROR);
      }
    }

    if (changes.telegramUrl && changes.telegramUrl !== null) {
      try {
        new URL(changes.telegramUrl);
      } catch {
        throw new ApiError(400, 'Invalid Telegram URL', ErrorCodes.VALIDATION_ERROR);
      }
    }

    if (changes.tiktokUrl && changes.tiktokUrl !== null) {
      try {
        new URL(changes.tiktokUrl);
      } catch {
        throw new ApiError(400, 'Invalid TikTok URL', ErrorCodes.VALIDATION_ERROR);
      }
    }

    if (changes.primaryColor && changes.primaryColor !== null) {
      const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
      if (!hexColorRegex.test(changes.primaryColor)) {
        throw new ApiError(400, 'Primary color must be a valid hex color (e.g., #FF0000)', ErrorCodes.VALIDATION_ERROR);
      }
    }

    if (changes.secondaryColor && changes.secondaryColor !== null) {
      const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
      if (!hexColorRegex.test(changes.secondaryColor)) {
        throw new ApiError(400, 'Secondary color must be a valid hex color (e.g., #00FF00)', ErrorCodes.VALIDATION_ERROR);
      }
    }

    if (changes.phone && changes.phone !== null) {
      const phoneRegex = /^\+[1-9]\d{1,14}$/;
      if (!phoneRegex.test(changes.phone)) {
        throw new ApiError(400, 'Invalid phone number format. Use E.164 format (e.g., +2519XXXXXXXX)', ErrorCodes.VALIDATION_ERROR);
      }
    }
  }

  private mapBusinessToResponse(business: any): BusinessResponse {
    return {
      id: business.id,
      name: business.name,
      slug: business.slug,
      currency: business.currency,
      timezone: business.timezone,
      status: business.status,
      logoUrl: business.logoUrl ?? null,
      coverImageUrl: business.coverImageUrl ?? null,
      primaryColor: business.primaryColor ?? null,
      secondaryColor: business.secondaryColor ?? null,
      description: business.description ?? null,
      aboutUs: business.aboutUs ?? null,
      address: business.address ?? null,
      phone: business.phone ?? null,
      email: business.email ?? null,
      website: business.website ?? null,
      facebookUrl: business.facebookUrl ?? null,
      instagramUrl: business.instagramUrl ?? null,
      telegramUrl: business.telegramUrl ?? null,
      tiktokUrl: business.tiktokUrl ?? null,
      createdAt: business.createdAt,
      updatedAt: business.updatedAt,
    };
  }
}

export const businessConfigurationService = new BusinessConfigurationService();