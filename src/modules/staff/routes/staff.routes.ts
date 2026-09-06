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
/**
 * @openapi
 * /api/v1/businesses/{businessId}/staff:
 *   post:
 *     tags: [Staff]
 *     summary: Create staff member
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: businessId, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [branchId, firstName, lastName]
 *             properties:
 *               branchId: { type: string, format: uuid }
 *               firstName: { type: string, maxLength: 100 }
 *               lastName: { type: string, maxLength: 100 }
 *               email: { type: string, format: email }
 *               phone: { type: string, example: '+251912345678' }
 *               title: { type: string, maxLength: 100 }
 *               bio: { type: string, maxLength: 1000 }
 *     responses:
 *       201: { description: Staff member created successfully }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       403: { description: Business membership required }
 */
router.post(
  '/businesses/:businessId/staff',
  authenticate,
  requireBusinessMembership,
  bodyValidator(createStaffSchema),
  staffController.createStaff
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/staff:
 *   get:
 *     tags: [Staff]
 *     summary: List business staff
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: businessId, required: true, schema: { type: string, format: uuid } }]
 *     responses:
 *       200: { description: Staff retrieved successfully }
 *       401: { description: Authentication required }
 *       403: { description: Business membership required }
 */
router.get(
  '/businesses/:businessId/staff',
  authenticate,
  requireBusinessMembership,
  staffController.getBusinessStaff
);

// Staff-scoped routes — authentication only; services resolve membership internally
/**
 * @openapi
 * /api/v1/staff/{staffId}:
 *   get:
 *     tags: [Staff]
 *     summary: Get staff details
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: staffId, required: true, schema: { type: string, format: uuid } }]
 *     responses:
 *       200: { description: Staff details retrieved successfully }
 *       401: { description: Authentication required }
 *       404: { description: Staff member not found }
 */
router.get('/staff/:staffId', authenticate, staffController.getStaffDetails);
/**
 * @openapi
 * /api/v1/staff/{staffId}:
 *   patch:
 *     tags: [Staff]
 *     summary: Update staff details
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: staffId, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName: { type: string, maxLength: 100 }
 *               lastName: { type: string, maxLength: 100 }
 *               email: { type: string, format: email }
 *               phone: { type: string }
 *               title: { type: string, maxLength: 100 }
 *               bio: { type: string, maxLength: 1000 }
 *               status: { type: string }
 *     responses:
 *       200: { description: Staff member updated successfully }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       404: { description: Staff member not found }
 */
router.patch('/staff/:staffId', authenticate, bodyValidator(updateStaffSchema), staffController.updateStaff);
/**
 * @openapi
 * /api/v1/staff/{staffId}/branch:
 *   patch:
 *     tags: [Staff]
 *     summary: Move staff member to another branch
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: staffId, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [branchId]
 *             properties: { branchId: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Staff branch updated successfully }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       404: { description: Staff member or branch not found }
 */
router.patch('/staff/:staffId/branch', authenticate, bodyValidator(moveStaffBranchSchema), staffController.moveStaffBranch);

// Qualifications
/**
 * @openapi
 * /api/v1/staff/{staffId}/category-qualifications:
 *   post:
 *     tags: [Staff Qualifications]
 *     summary: Add a category qualification
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: staffId, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [categoryId]
 *             properties: { categoryId: { type: string, format: uuid } }
 *     responses:
 *       201: { description: Category qualification added }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       404: { description: Staff member or category not found }
 */
router.post('/staff/:staffId/category-qualifications', authenticate, bodyValidator(addCategoryQualificationSchema), staffQualificationController.addCategoryQualification);
/**
 * @openapi
 * /api/v1/staff/{staffId}/category-qualifications/{categoryId}:
 *   delete:
 *     tags: [Staff Qualifications]
 *     summary: Remove a category qualification
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: staffId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: categoryId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Category qualification removed }
 *       401: { description: Authentication required }
 *       404: { description: Qualification not found }
 */
router.delete('/staff/:staffId/category-qualifications/:categoryId', authenticate, staffQualificationController.removeCategoryQualification);

/**
 * @openapi
 * /api/v1/staff/{staffId}/service-qualifications:
 *   post:
 *     tags: [Staff Qualifications]
 *     summary: Add a service qualification
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: staffId, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [serviceId]
 *             properties:
 *               serviceId: { type: string, format: uuid }
 *               proficiencyLevel: { type: string, default: SENIOR }
 *     responses:
 *       201: { description: Service qualification added }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       404: { description: Staff member or service not found }
 */
router.post('/staff/:staffId/service-qualifications', authenticate, bodyValidator(addServiceQualificationSchema), staffQualificationController.addServiceQualification);
/**
 * @openapi
 * /api/v1/staff/{staffId}/service-qualifications/{serviceId}:
 *   delete:
 *     tags: [Staff Qualifications]
 *     summary: Remove a service qualification
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: staffId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: serviceId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Service qualification removed }
 *       401: { description: Authentication required }
 *       404: { description: Qualification not found }
 */
router.delete('/staff/:staffId/service-qualifications/:serviceId', authenticate, staffQualificationController.removeServiceQualification);

// Schedule
/**
 * @openapi
 * /api/v1/staff/{staffId}/weekly-hours:
 *   get:
 *     tags: [Staff Schedule]
 *     summary: Get staff weekly hours
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: staffId, required: true, schema: { type: string, format: uuid } }]
 *     responses:
 *       200: { description: Weekly hours retrieved successfully }
 *       401: { description: Authentication required }
 *       404: { description: Staff member not found }
 */
router.get('/staff/:staffId/weekly-hours', authenticate, staffScheduleController.getWeeklyHours);
/**
 * @openapi
 * /api/v1/staff/{staffId}/weekly-hours:
 *   put:
 *     tags: [Staff Schedule]
 *     summary: Replace staff weekly hours
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: staffId, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [dayOfWeek, isWorking, intervals]
 *             properties:
 *               dayOfWeek: { type: integer, minimum: 0, maximum: 6 }
 *               isWorking: { type: boolean }
 *               intervals:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [start, end]
 *                   properties: { start: { type: string, pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' }, end: { type: string } }
 *     responses:
 *       200: { description: Weekly hours updated successfully }
 *       400: { description: Invalid or overlapping intervals }
 *       401: { description: Authentication required }
 *       404: { description: Staff member not found }
 */
router.put('/staff/:staffId/weekly-hours', authenticate, bodyValidator(updateWeeklyHoursSchema), staffScheduleController.updateWeeklyHours);
/**
 * @openapi
 * /api/v1/staff/{staffId}/schedule/validate:
 *   post:
 *     tags: [Staff Schedule]
 *     summary: Validate staff schedule
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: staffId, required: true, schema: { type: string, format: uuid } }]
 *     responses:
 *       200: { description: Schedule validation result }
 *       401: { description: Authentication required }
 *       404: { description: Staff member not found }
 */
router.post('/staff/:staffId/schedule/validate', authenticate, staffScheduleController.validateSchedule);

// Weekly Breaks
/**
 * @openapi
 * /api/v1/staff/{staffId}/weekly-breaks:
 *   get:
 *     tags: [Staff Schedule]
 *     summary: List weekly breaks
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: staffId, required: true, schema: { type: string, format: uuid } }]
 *     responses:
 *       200: { description: Weekly breaks retrieved successfully }
 *       401: { description: Authentication required }
 */
router.get('/staff/:staffId/weekly-breaks', authenticate, staffScheduleController.getWeeklyBreaks);
/**
 * @openapi
 * /api/v1/staff/{staffId}/weekly-breaks:
 *   post:
 *     tags: [Staff Schedule]
 *     summary: Create a weekly break
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: staffId, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [dayOfWeek, start, end]
 *             properties:
 *               dayOfWeek: { type: integer, minimum: 0, maximum: 6 }
 *               start: { type: string, example: '12:00' }
 *               end: { type: string, example: '13:00' }
 *     responses:
 *       201: { description: Weekly break created }
 *       400: { description: Invalid break interval }
 *       401: { description: Authentication required }
 */
router.post('/staff/:staffId/weekly-breaks', authenticate, bodyValidator(createWeeklyBreakSchema), staffScheduleController.createWeeklyBreak);
/**
 * @openapi
 * /api/v1/staff/{staffId}/weekly-breaks/{breakId}:
 *   patch:
 *     tags: [Staff Schedule]
 *     summary: Update a weekly break
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: staffId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: breakId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties: { start: { type: string }, end: { type: string } }
 *     responses:
 *       200: { description: Weekly break updated }
 *       400: { description: Invalid break interval }
 *       401: { description: Authentication required }
 *       404: { description: Break not found }
 */
router.patch('/staff/:staffId/weekly-breaks/:breakId', authenticate, bodyValidator(updateWeeklyBreakSchema), staffScheduleController.updateWeeklyBreak);
/**
 * @openapi
 * /api/v1/staff/{staffId}/weekly-breaks/{breakId}:
 *   delete:
 *     tags: [Staff Schedule]
 *     summary: Delete a weekly break
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: staffId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: breakId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Weekly break deleted }
 *       401: { description: Authentication required }
 *       404: { description: Break not found }
 */
router.delete('/staff/:staffId/weekly-breaks/:breakId', authenticate, staffScheduleController.deleteWeeklyBreak);

// Schedule Overrides
/**
 * @openapi
 * /api/v1/staff/{staffId}/schedule-overrides:
 *   get:
 *     tags: [Staff Schedule]
 *     summary: List schedule overrides
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: staffId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: from, schema: { type: string, format: date } }
 *       - { in: query, name: to, schema: { type: string, format: date } }
 *     responses:
 *       200: { description: Schedule overrides retrieved successfully }
 *       401: { description: Authentication required }
 *       404: { description: Staff member not found }
 */
router.get('/staff/:staffId/schedule-overrides', authenticate, staffScheduleController.getScheduleOverrides);
/**
 * @openapi
 * /api/v1/staff/{staffId}/schedule-overrides/{date}:
 *   put:
 *     tags: [Staff Schedule]
 *     summary: Create or replace a schedule override
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: staffId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: date, required: true, schema: { type: string, format: date } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [isWorking, intervals]
 *             properties:
 *               isWorking: { type: boolean }
 *               intervals: { type: array, items: { type: object, required: [start, end], properties: { start: { type: string }, end: { type: string } } } }
 *     responses:
 *       200: { description: Schedule override updated successfully }
 *       400: { description: Invalid override intervals }
 *       401: { description: Authentication required }
 *       404: { description: Staff member not found }
 */
router.put('/staff/:staffId/schedule-overrides/:date', authenticate, bodyValidator(updateScheduleOverrideSchema), staffScheduleController.updateScheduleOverride);
/**
 * @openapi
 * /api/v1/staff/{staffId}/schedule-overrides/{date}:
 *   delete:
 *     tags: [Staff Schedule]
 *     summary: Delete a schedule override
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: staffId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: date, required: true, schema: { type: string, format: date } }
 *     responses:
 *       200: { description: Schedule override deleted }
 *       401: { description: Authentication required }
 *       404: { description: Schedule override not found }
 */
router.delete('/staff/:staffId/schedule-overrides/:date', authenticate, staffScheduleController.deleteScheduleOverride);

// Break Overrides
/**
 * @openapi
 * /api/v1/staff/{staffId}/break-overrides:
 *   get:
 *     tags: [Staff Schedule]
 *     summary: List break overrides
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: staffId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: from, schema: { type: string, format: date } }
 *       - { in: query, name: to, schema: { type: string, format: date } }
 *     responses:
 *       200: { description: Break overrides retrieved successfully }
 *       401: { description: Authentication required }
 */
router.get('/staff/:staffId/break-overrides', authenticate, staffScheduleController.getBreakOverrides);
/**
 * @openapi
 * /api/v1/staff/{staffId}/break-overrides/{date}:
 *   put:
 *     tags: [Staff Schedule]
 *     summary: Create or replace a break override
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: staffId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: date, required: true, schema: { type: string, format: date } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [intervals]
 *             properties: { intervals: { type: array, items: { type: object, required: [start, end], properties: { start: { type: string }, end: { type: string } } } } }
 *     responses:
 *       200: { description: Break override updated successfully }
 *       400: { description: Invalid override intervals }
 *       401: { description: Authentication required }
 *       404: { description: Staff member not found }
 */
router.put('/staff/:staffId/break-overrides/:date', authenticate, bodyValidator(updateBreakOverrideSchema), staffScheduleController.updateBreakOverride);
/**
 * @openapi
 * /api/v1/staff/{staffId}/break-overrides/{date}:
 *   delete:
 *     tags: [Staff Schedule]
 *     summary: Delete a break override
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: staffId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: date, required: true, schema: { type: string, format: date } }
 *     responses:
 *       200: { description: Break override deleted }
 *       401: { description: Authentication required }
 *       404: { description: Break override not found }
 */
router.delete('/staff/:staffId/break-overrides/:date', authenticate, staffScheduleController.deleteBreakOverride);

// Time Off
/**
 * @openapi
 * /api/v1/staff/{staffId}/time-off:
 *   get:
 *     tags: [Staff Time Off]
 *     summary: List staff time off
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: staffId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: from, schema: { type: string, format: date } }
 *       - { in: query, name: to, schema: { type: string, format: date } }
 *     responses:
 *       200: { description: Time off records retrieved successfully }
 *       401: { description: Authentication required }
 */
router.get('/staff/:staffId/time-off', authenticate, staffTimeOffController.getTimeOffs);
/**
 * @openapi
 * /api/v1/staff/{staffId}/time-off:
 *   post:
 *     tags: [Staff Time Off]
 *     summary: Create staff time off
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: staffId, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [date, allDay]
 *             properties:
 *               date: { type: string, format: date }
 *               allDay: { type: boolean }
 *               start: { type: string, example: '09:00' }
 *               end: { type: string, example: '17:00' }
 *               reason: { type: string, maxLength: 500 }
 *     responses:
 *       201: { description: Time off created successfully }
 *       400: { description: Invalid time off configuration }
 *       401: { description: Authentication required }
 *       404: { description: Staff member not found }
 */
router.post('/staff/:staffId/time-off', authenticate, bodyValidator(createTimeOffSchema), staffTimeOffController.createTimeOff);
/**
 * @openapi
 * /api/v1/staff/{staffId}/time-off/{timeOffId}:
 *   patch:
 *     tags: [Staff Time Off]
 *     summary: Update staff time off
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: staffId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: timeOffId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               allDay: { type: boolean }
 *               start: { type: string }
 *               end: { type: string }
 *               reason: { type: string, maxLength: 500 }
 *     responses:
 *       200: { description: Time off updated successfully }
 *       400: { description: Invalid time off configuration }
 *       401: { description: Authentication required }
 *       404: { description: Time off not found }
 */
router.patch('/staff/:staffId/time-off/:timeOffId', authenticate, bodyValidator(updateTimeOffSchema), staffTimeOffController.updateTimeOff);
/**
 * @openapi
 * /api/v1/staff/{staffId}/time-off/{timeOffId}:
 *   delete:
 *     tags: [Staff Time Off]
 *     summary: Delete staff time off
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: staffId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: timeOffId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Time off deleted successfully }
 *       401: { description: Authentication required }
 *       404: { description: Time off not found }
 */
router.delete('/staff/:staffId/time-off/:timeOffId', authenticate, staffTimeOffController.deleteTimeOff);

export default router;
