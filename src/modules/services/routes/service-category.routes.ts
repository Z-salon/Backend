import { Router } from 'express';
import { serviceCategoryController } from '../controllers/service-category.controller';
import { authenticate } from '../../../middlewares/authenticate';
import { requireBusinessMembership } from '../../../middlewares/require-business-membership';
import { bodyValidator } from '../../../utils/body-validator';
import {
  createServiceCategorySchema,
  updateServiceCategorySchema,
  assignCategoryBranchSchema,
  updateCategoryBranchAssignmentSchema,
} from '../validation/service.schemas';

const router = Router();

// Business-scoped routes
router.post(
  '/businesses/:businessId/service-categories',
  authenticate,
  requireBusinessMembership,
  bodyValidator(createServiceCategorySchema),
  serviceCategoryController.createCategory
);

router.get(
  '/businesses/:businessId/service-categories',
  authenticate,
  requireBusinessMembership,
  serviceCategoryController.getCategories
);

// Direct category routes
router.get(
  '/service-categories/:categoryId',
  authenticate,
  serviceCategoryController.getCategoryById
);

router.patch(
  '/service-categories/:categoryId',
  authenticate,
  bodyValidator(updateServiceCategorySchema),
  serviceCategoryController.updateCategory
);

// Category branch assignment routes
router.post(
  '/service-categories/:categoryId/branches',
  authenticate,
  bodyValidator(assignCategoryBranchSchema),
  serviceCategoryController.addCategoryToBranch
);

router.get(
  '/service-categories/:categoryId/branches',
  authenticate,
  serviceCategoryController.getCategoryBranches
);

router.patch(
  '/service-categories/:categoryId/branches/:branchId',
  authenticate,
  bodyValidator(updateCategoryBranchAssignmentSchema),
  serviceCategoryController.updateCategoryBranchAssignment
);

export default router;
