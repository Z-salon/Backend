import { Router } from 'express';
import { staffController } from '../controllers/staff.controller';
import { staffQualificationController } from '../controllers/staff-qualification.controller';
import { staffScheduleController } from '../controllers/staff-schedule.controller';
import { staffTimeOffController } from '../controllers/staff-time-off.controller';

import { authenticate } from '../../../middlewares/authenticate';
import { requireBusinessMembership } from '../../../middlewares/require-business-membership';
import { bodyValidator } from '../../../utils/body-validator';

import {
  createStaffSchema,
  updateStaffSchema,
  moveStaffBranchSchema,
  addCategoryQualificationSchema,
  addServiceQualificationSchema,
  updateWeeklyHoursSchema,
  createWeeklyBreakSchema,
  updateWeeklyBreakSchema,
  updateScheduleOverrideSchema,
  updateBreakOverrideSchema,
  createTimeOffSchema,
  updateTimeOffSchema,
} from '../validation/staff.schemas';

const router = Router();

// Business-scoped routes — these need requireBusinessMembership
router.post(
  '/businesses/:businessId/staff',
  authenticate,
  requireBusinessMembership,
  bodyValidator(createStaffSchema),
  staffController.createStaff
);

router.get(
  '/businesses/:businessId/staff',
  authenticate,
  requireBusinessMembership,
  staffController.getBusinessStaff
);

// Staff-scoped routes — authentication only; services resolve membership internally
router.get('/staff/:staffId', authenticate, staffController.getStaffDetails);
router.patch('/staff/:staffId', authenticate, bodyValidator(updateStaffSchema), staffController.updateStaff);
router.patch('/staff/:staffId/branch', authenticate, bodyValidator(moveStaffBranchSchema), staffController.moveStaffBranch);

// Qualifications
router.post('/staff/:staffId/category-qualifications', authenticate, bodyValidator(addCategoryQualificationSchema), staffQualificationController.addCategoryQualification);
router.delete('/staff/:staffId/category-qualifications/:categoryId', authenticate, staffQualificationController.removeCategoryQualification);

router.post('/staff/:staffId/service-qualifications', authenticate, bodyValidator(addServiceQualificationSchema), staffQualificationController.addServiceQualification);
router.delete('/staff/:staffId/service-qualifications/:serviceId', authenticate, staffQualificationController.removeServiceQualification);

// Schedule
router.get('/staff/:staffId/weekly-hours', authenticate, staffScheduleController.getWeeklyHours);
router.put('/staff/:staffId/weekly-hours', authenticate, bodyValidator(updateWeeklyHoursSchema), staffScheduleController.updateWeeklyHours);
router.post('/staff/:staffId/schedule/validate', authenticate, staffScheduleController.validateSchedule);

// Weekly Breaks
router.get('/staff/:staffId/weekly-breaks', authenticate, staffScheduleController.getWeeklyBreaks);
router.post('/staff/:staffId/weekly-breaks', authenticate, bodyValidator(createWeeklyBreakSchema), staffScheduleController.createWeeklyBreak);
router.patch('/staff/:staffId/weekly-breaks/:breakId', authenticate, bodyValidator(updateWeeklyBreakSchema), staffScheduleController.updateWeeklyBreak);
router.delete('/staff/:staffId/weekly-breaks/:breakId', authenticate, staffScheduleController.deleteWeeklyBreak);

// Schedule Overrides
router.get('/staff/:staffId/schedule-overrides', authenticate, staffScheduleController.getScheduleOverrides);
router.put('/staff/:staffId/schedule-overrides/:date', authenticate, bodyValidator(updateScheduleOverrideSchema), staffScheduleController.updateScheduleOverride);
router.delete('/staff/:staffId/schedule-overrides/:date', authenticate, staffScheduleController.deleteScheduleOverride);

// Break Overrides
router.get('/staff/:staffId/break-overrides', authenticate, staffScheduleController.getBreakOverrides);
router.put('/staff/:staffId/break-overrides/:date', authenticate, bodyValidator(updateBreakOverrideSchema), staffScheduleController.updateBreakOverride);
router.delete('/staff/:staffId/break-overrides/:date', authenticate, staffScheduleController.deleteBreakOverride);

// Time Off
router.get('/staff/:staffId/time-off', authenticate, staffTimeOffController.getTimeOffs);
router.post('/staff/:staffId/time-off', authenticate, bodyValidator(createTimeOffSchema), staffTimeOffController.createTimeOff);
router.patch('/staff/:staffId/time-off/:timeOffId', authenticate, bodyValidator(updateTimeOffSchema), staffTimeOffController.updateTimeOff);
router.delete('/staff/:staffId/time-off/:timeOffId', authenticate, staffTimeOffController.deleteTimeOff);

export default router;
