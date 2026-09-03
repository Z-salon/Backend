import { prisma } from '../../../libs/prisma';

export class ServiceAvailabilityService {
  /**
   * Evaluates effective availability of a single service at a branch:
   * Branch ACTIVE
   * AND Category ACTIVE
   * AND CategoryBranchAssignment ACTIVE
   * AND Service ACTIVE
   * AND ServiceBranchAssignment ACTIVE
   */
  async isServiceAvailableAtBranch(serviceId: string, branchId: string): Promise<boolean> {
    const service = await prisma.service.findFirst({
      where: {
        id: serviceId,
        status: 'ACTIVE',
        category: {
          status: 'ACTIVE',
          branchAssignments: {
            some: {
              branchId,
              isActive: true,
              branch: {
                isActive: true,
              },
            },
          },
        },
        branchAssignments: {
          some: {
            branchId,
            isActive: true,
          },
        },
      },
      select: { id: true },
    });

    return !!service;
  }

  /**
   * Fetches all categories effectively active at a given branch.
   */
  async getEffectivelyAvailableCategoriesForBranch(branchId: string) {
    return prisma.serviceCategory.findMany({
      where: {
        status: 'ACTIVE',
        branchAssignments: {
          some: {
            branchId,
            isActive: true,
            branch: {
              isActive: true,
            },
          },
        },
      },
      include: {
        services: {
          where: {
            status: 'ACTIVE',
            branchAssignments: {
              some: {
                branchId,
                isActive: true,
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Fetches all services effectively available at a given branch.
   */
  async getEffectivelyAvailableServicesForBranch(branchId: string, categoryId?: string) {
    return prisma.service.findMany({
      where: {
        status: 'ACTIVE',
        ...(categoryId ? { categoryId } : {}),
        category: {
          status: 'ACTIVE',
          branchAssignments: {
            some: {
              branchId,
              isActive: true,
              branch: {
                isActive: true,
              },
            },
          },
        },
        branchAssignments: {
          some: {
            branchId,
            isActive: true,
          },
        },
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }
}

export const serviceAvailabilityService = new ServiceAvailabilityService();
