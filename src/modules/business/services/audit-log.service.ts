import { prisma } from '../../../libs/prisma';
import { Prisma } from '@prisma/client';

export interface AuditLogInput {
  businessId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
}

type TransactionClient = Prisma.TransactionClient extends infer T ? T : never;

export class AuditLogService {
  async createAuditLog(data: AuditLogInput, tx?: TransactionClient) {
    const client = tx || prisma;
    return client.auditLog.create({
      data: {
        businessId: data.businessId,
        actorId: data.actorId,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        oldValues: data.oldValues ? data.oldValues : Prisma.JsonNull,
        newValues: data.newValues ? data.newValues : Prisma.JsonNull,
      },
    });
  }

  async getAuditLogs(businessId: string, options?: {
    entityType?: string;
    entityId?: string;
    actorId?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }) {
    const where: any = { businessId };

    if (options?.entityType) where.entityType = options.entityType;
    if (options?.entityId) where.entityId = options.entityId;
    if (options?.actorId) where.actorId = options.actorId;
    if (options?.action) where.action = options.action;
    if (options?.startDate || options?.endDate) {
      where.createdAt = {};
      if (options.startDate) where.createdAt.gte = options.startDate;
      if (options.endDate) where.createdAt.lte = options.endDate;
    }

    return prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0,
      include: {
        actor: {
          select: {
            id: true,
            phone: true,
          },
        },
      },
    });
  }

  async getAuditLogById(businessId: string, auditLogId: string) {
    return prisma.auditLog.findFirst({
      where: { id: auditLogId, businessId },
      include: {
        actor: {
          select: {
            id: true,
            phone: true,
          },
        },
      },
    });
  }
}

export const auditLogService = new AuditLogService();