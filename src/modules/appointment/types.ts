import { AppointmentStatus, BookingSource, AppointmentActorType, Prisma } from '@prisma/client';

export interface AppointmentCreateInput {
  branchId: string;
  customerId: string;
  serviceId: string;
  staffId?: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  notes?: string;
  internalNotes?: string;
  bookingSource: BookingSource;
}

export interface AppointmentUpdateInput {
  scheduledStart?: Date;
  scheduledEnd?: Date;
  staffId?: string | null;
  notes?: string;
  internalNotes?: string;
  status?: AppointmentStatus;
}

export interface AppointmentResponse {
  id: string;
  businessId: string;
  branchId: string;
  customerId: string;
  serviceId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  actualStart?: Date | null;
  actualEnd?: Date | null;
  status: AppointmentStatus;
  totalAmount: Prisma.Decimal;
  depositAmount: Prisma.Decimal | null;
  notes: string | null;
  internalNotes: string | null;
  bookingSource: BookingSource;
  createdById: string | null;
  confirmedAt: Date | null;
  checkedInAt: Date | null;
  inProgressAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  noShowAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  customer?: {
    id: string;
    firstName: string;
    lastName: string;
    phones: { phone: string; isPrimary: boolean }[];
  };
  service?: {
    id: string;
    name: string;
    durationMinutes: number;
    price: Prisma.Decimal;
  };
  staff?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  statusHistory?: AppointmentStatusHistoryResponse[];
}

export interface AppointmentStatusHistoryResponse {
  id: string;
  appointmentId: string;
  statusFrom: AppointmentStatus | null;
  statusTo: AppointmentStatus;
  actorId: string | null;
  actorType: AppointmentActorType;
  reason: string | null;
  transitionTimestamp: Date;
  createdAt: Date;
  actor?: {
    id: string;
    phone: string;
  } | null;
}

export interface AppointmentListQuery {
  branchId?: string;
  customerId?: string;
  serviceId?: string;
  staffId?: string;
  status?: AppointmentStatus;
  bookingSource?: BookingSource;
  startDate?: Date;
  endDate?: Date;
  page: number;
  limit: number;
}

export interface AppointmentListResponse {
  data: AppointmentResponse[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface AppointmentCreateCoreInput {
  businessId: string;
  branchId: string;
  customerId: string;
  serviceId: string;
  staffId?: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  notes?: string;
  internalNotes?: string;
  bookingSource: BookingSource;
  createdById?: string;
}

export interface AppointmentValidationResult {
  isValid: boolean;
  errors: string[];
  business?: any;
  branch?: any;
  service?: any;
  customer?: any;
  staff?: any;
  effectiveConfig?: {
    serviceId: string;
    branchId: string;
    effectiveDurationMinutes: number;
    effectivePrice: number;
    bufferMinutes: number;
    employeeAssignmentMode: string;
    depositPolicyType: string;
    depositAmount: number | null;
  };
}

export { AppointmentStatus, BookingSource, AppointmentActorType } from '@prisma/client';

export type AppointmentStatusType = AppointmentStatus;
export type BookingSourceType = BookingSource;
export type AppointmentActorTypeType = AppointmentActorType;