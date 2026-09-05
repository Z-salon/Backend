import { Router } from 'express';
import { customerController } from '../controllers/customer.controller';
import { authenticate } from '../../../middlewares/authenticate';
import { requireBusinessMembership } from '../../../middlewares/require-business-membership';

const router = Router();

// Business-scoped routes — require active business membership
router.post('/businesses/:businessId/customers/match', authenticate, requireBusinessMembership, customerController.matchCustomer);
router.post('/businesses/:businessId/customers', authenticate, requireBusinessMembership, customerController.createCustomer);
router.get('/businesses/:businessId/customers', authenticate, requireBusinessMembership, customerController.getCustomers);

// Customer-scoped routes — auth only; services resolve membership internally from customer record
router.get('/customers/:customerId', authenticate, customerController.getCustomer);
router.patch('/customers/:customerId', authenticate, customerController.updateCustomer);
router.patch('/customers/:customerId/archive', authenticate, customerController.archiveCustomer);

// Phone management
router.post('/customers/:customerId/phones', authenticate, customerController.addPhone);
router.delete('/customers/:customerId/phones/:phoneId', authenticate, customerController.deletePhone);
router.patch('/customers/:customerId/phones/:phoneId/primary', authenticate, customerController.setPrimaryPhone);

export default router;
