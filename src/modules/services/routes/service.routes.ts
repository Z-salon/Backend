import { Router } from 'express';
import { serviceController } from '../controllers/service.controller';
import { authenticate } from '../../../middlewares/authenticate';
import { requireBusinessMembership } from '../../../middlewares/require-business-membership';
import { bodyValidator } from '../../../utils/body-validator';
import {
  createServiceSchema,
  updateServiceSchema,
  assignServiceBranchSchema,
  updateServiceBranchAssignmentSchema,
} from '../validation/service.schemas';

const router = Router();

// Business-scoped service routes
router.post(
  '/businesses/:businessId/services',
  authenticate,
  requireBusinessMembership,
  bodyValidator(createServiceSchema),
  serviceController.createService
);

router.get(
  '/businesses/:businessId/services',
  authenticate,
  requireBusinessMembership,
  serviceController.getServices
);

// Direct service routes
router.get(
  '/services/:serviceId',
  authenticate,
  serviceController.getServiceById
);

router.patch(
  '/services/:serviceId',
  authenticate,
  bodyValidator(updateServiceSchema),
  serviceController.updateService
);

// Service branch assignment routes
router.post(
  '/services/:serviceId/branches',
  authenticate,
  bodyValidator(assignServiceBranchSchema),
  serviceController.addServiceToBranch
);

router.get(
  '/services/:serviceId/branches',
  authenticate,
  serviceController.getServiceBranches
);

router.patch(
  '/services/:serviceId/branches/:branchId',
  authenticate,
  bodyValidator(updateServiceBranchAssignmentSchema),
  serviceController.updateServiceBranchAssignment
);

export default router;
