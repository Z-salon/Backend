import { Request, Response, NextFunction } from 'express';
import { customerService } from '../services/customer.service';
import { customerMatchingService } from '../services/customer-matching.service';
import {
  createCustomerSchema,
  updateCustomerSchema,
  matchCustomerSchema,
  addCustomerPhoneSchema,
  getCustomersQuerySchema,
} from '../validation/customer.schemas';
import { prisma } from '../../../libs/prisma';

/**
 * Resolves the businessId from a customerId.
 * Returns null if the customer doesn't exist.
 */
async function resolveBusinessId(customerId: string): Promise<string | null> {
  const record = await prisma.customer.findUnique({ where: { id: customerId }, select: { businessId: true } });
  return record ? record.businessId : null;
}

export class CustomerController {
  // POST /api/businesses/:businessId/customers
  async createCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId } = req.params;
      const userId = req.auth!.userId;
      const data = createCustomerSchema.parse(req.body);

      const primaryPhones = data.phones.filter((p) => p.isPrimary);
      if (primaryPhones.length > 1) {
        res.status(400).json({ code: 'MULTIPLE_PRIMARY_PHONES', message: 'Only one phone can be marked as primary' });
        return;
      }

      const customer = await customerService.createCustomer(businessId, userId, data);
      res.status(201).json({ success: true, data: customer });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/businesses/:businessId/customers/match
  async matchCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId } = req.params;
      const userId = req.auth!.userId;
      const { phone } = matchCustomerSchema.parse(req.body);

      await customerService.getMembershipAndUserRoles(businessId, userId);

      const customer = await customerMatchingService.matchCustomerByPhone(businessId, phone);

      if (!customer) {
        res.status(200).json({ matched: false, customer: null });
        return;
      }

      res.status(200).json({
        matched: true,
        customer: {
          id: customer.id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          status: customer.status,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/businesses/:businessId/customers
  async getCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessId } = req.params;
      const userId = req.auth!.userId;
      const query = getCustomersQuerySchema.parse(req.query);

      const result = await customerService.getCustomers(businessId, userId, query);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/customers/:customerId
  async getCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const { customerId } = req.params;
      const userId = req.auth!.userId;

      const businessId = await resolveBusinessId(customerId);
      if (!businessId) {
        res.status(404).json({ code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' });
        return;
      }

      const customer = await customerService.getCustomerDetails(businessId, customerId, userId);
      res.status(200).json({ success: true, data: customer });
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/customers/:customerId
  async updateCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const { customerId } = req.params;
      const userId = req.auth!.userId;
      const data = updateCustomerSchema.parse(req.body);

      const businessId = await resolveBusinessId(customerId);
      if (!businessId) {
        res.status(404).json({ code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' });
        return;
      }

      const customer = await customerService.updateCustomer(businessId, customerId, userId, data);
      res.status(200).json({ success: true, data: customer });
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/customers/:customerId/archive
  async archiveCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const { customerId } = req.params;
      const userId = req.auth!.userId;

      const businessId = await resolveBusinessId(customerId);
      if (!businessId) {
        res.status(404).json({ code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' });
        return;
      }

      const customer = await customerService.archiveCustomer(businessId, customerId, userId);
      res.status(200).json({ success: true, data: customer });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/customers/:customerId/phones
  async addPhone(req: Request, res: Response, next: NextFunction) {
    try {
      const { customerId } = req.params;
      const userId = req.auth!.userId;
      const data = addCustomerPhoneSchema.parse(req.body);

      const businessId = await resolveBusinessId(customerId);
      if (!businessId) {
        res.status(404).json({ code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' });
        return;
      }

      const phone = await customerService.addCustomerPhone(businessId, customerId, userId, data);
      res.status(201).json({ success: true, data: phone });
    } catch (error) {
      next(error);
    }
  }

  // DELETE /api/customers/:customerId/phones/:phoneId
  async deletePhone(req: Request, res: Response, next: NextFunction) {
    try {
      const { customerId, phoneId } = req.params;
      const userId = req.auth!.userId;

      const businessId = await resolveBusinessId(customerId);
      if (!businessId) {
        res.status(404).json({ code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' });
        return;
      }

      await customerService.deleteCustomerPhone(businessId, customerId, phoneId, userId);
      res.status(200).json({ success: true, message: 'Phone removed' });
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/customers/:customerId/phones/:phoneId/primary
  async setPrimaryPhone(req: Request, res: Response, next: NextFunction) {
    try {
      const { customerId, phoneId } = req.params;
      const userId = req.auth!.userId;

      const businessId = await resolveBusinessId(customerId);
      if (!businessId) {
        res.status(404).json({ code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' });
        return;
      }

      const phone = await customerService.setPrimaryPhone(businessId, customerId, phoneId, userId);
      res.status(200).json({ success: true, data: phone });
    } catch (error) {
      next(error);
    }
  }
}

export const customerController = new CustomerController();
