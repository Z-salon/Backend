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

export type SlotSource = 'PUBLIC' | 'INTERNAL';

export interface GetAvailableSlotsInput {
  businessId: string;
  branchId: string;
  serviceId: string;
  date: string; // YYYY-MM-DD
  staffId?: string;
  source?: SlotSource;
}

export interface AvailableSlotResponse {
  startTime: string; // ISO string with offset
  serviceEndTime: string;
  reservedEndTime: string;
  staff: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface AvailabilityResponse {
  date: string;
  branchId: string;
  serviceId: string;
  timezone: string;
  availableSlots: AvailableSlotResponse[];
}

export interface ValidateSlotInput {
  businessId: string;
  branchId: string;
  serviceId: string;
  staffId: string;
  startTime: string; // ISO string with offset
  source?: SlotSource;
  excludeAppointmentId?: string;
}

export type ValidationReasonCode = 
  | 'BRANCH_CLOSED'
  | 'SERVICE_NOT_OFFERED'
  | 'STAFF_INACTIVE'
  | 'STAFF_NOT_QUALIFIED'
  | 'STAFF_NOT_WORKING'
  | 'STAFF_ON_BREAK'
  | 'STAFF_TIME_OFF'
  | 'SLOT_OUTSIDE_BRANCH_HOURS'
  | 'SLOT_CONFLICT'
  | 'MIN_ADVANCE_VIOLATION'
  | 'MAX_ADVANCE_VIOLATION'
  | 'INVALID_START_TIME'
  | 'BUSINESS_INACTIVE';

export interface SlotValidationResponse {
  valid: boolean;
  overrideAllowed?: boolean;
  conflictType?: ValidationReasonCode;
  reason?: string;
}