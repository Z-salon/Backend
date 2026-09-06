import { EmployeeAssignmentMode } from '@prisma/client';

export interface ServiceBranchConfig {
  serviceId: string;
  branchId: string;
  isActive: boolean;
  effectiveDurationMinutes: number;
  effectivePrice: number;
  bufferMinutes: number;
  employeeAssignmentMode: EmployeeAssignmentMode;
  showPriceToCustomer: boolean;
  depositPolicyType: string;
  depositAmount: number | null;
}

export interface AvailableStaff {
  id: string;
  firstName: string;
  lastName: string;
  isQualified: boolean;
}

export interface TimeSlot {
  start: Date;
  end: Date;
  staff?: AvailableStaff;
  isAvailable: boolean;
}

export interface AvailabilityQueryParams {
  businessId: string;
  branchId: string;
  serviceId: string;
  staffId?: string;
  date: Date;
  timezone?: string;
}

export interface AvailabilityValidationResult {
  isValid: boolean;
  errors: string[];
  business?: any;
  branch?: any;
  service?: any;
  staff?: any;
  effectiveConfig?: ServiceBranchConfig;
}

export interface ServiceBranchConfigInput {
  serviceId: string;
  branchId: string;
  isActive?: boolean;
  durationMinutes?: number | null;
  price?: number | null;
  bufferMinutes?: number;
}

export interface EffectiveServiceConfig {
  serviceId: string;
  branchId: string;
  name: string;
  durationMinutes: number;
  price: number;
  bufferMinutes: number;
  employeeAssignmentMode: string;
  showPriceToCustomer: boolean;
  depositPolicyType: string;
  depositAmount: number | null;
  isActive: boolean;
}