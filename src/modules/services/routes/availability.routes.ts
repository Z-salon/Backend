import { Router } from 'express';
import { availabilityController } from '../controllers/availability.controller';
import { optionalAuth } from '../../../middlewares/authenticate';

const router = Router();

/**
 * @openapi
 * /api/v1/businesses/{businessId}/branches/{branchId}/operating-intervals:
 *   get:
 *     tags: [Availability]
 *     summary: Get branch operating intervals for a date
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: branchId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: date, required: true, schema: { type: string, format: date } }
 *     responses:
 *       200: { description: Branch operating intervals retrieved successfully }
 *       400: { description: Invalid date }
 *       401: { description: Authentication required }
 *       404: { description: Branch not found }
 */
router.get(
  '/businesses/:businessId/branches/:branchId/operating-intervals',
  optionalAuth,
  availabilityController.getBranchOperatingIntervals.bind(availabilityController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/branches/{branchId}/staff/{staffId}/effective-intervals:
 *   get:
 *     tags: [Availability]
 *     summary: Get effective staff intervals for a date
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: branchId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: staffId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: date, required: true, schema: { type: string, format: date } }
 *     responses:
 *       200: { description: Staff effective intervals retrieved successfully }
 *       400: { description: Invalid date }
 *       401: { description: Authentication required }
 *       404: { description: Branch or staff member not found }
 */
router.get(
  '/businesses/:businessId/branches/:branchId/staff/:staffId/effective-intervals',
  optionalAuth,
  availabilityController.getStaffEffectiveIntervals.bind(availabilityController)
);

// Public availability endpoint — no auth required (future customers browsing)
// optionalAuth is used so that authenticated internal users get a richer context if needed.
/**
 * @openapi
 * /api/v1/businesses/{businessId}/availability:
 *   get:
 *     tags: [Availability]
 *     summary: Get available appointment slots
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: businessId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: branchId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: serviceId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: date, required: true, schema: { type: string, format: date } }
 *       - { in: query, name: staffId, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Available slots retrieved successfully }
 *       400: { description: Invalid availability query }
 *       404: { description: Business, branch, service, or staff not found }
 */
router.get(
  '/businesses/:businessId/availability',
  optionalAuth,
  availabilityController.getAvailableSlots.bind(availabilityController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/availability/validate:
 *   post:
 *     tags: [Availability]
 *     summary: Validate an appointment slot
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: businessId, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [branchId, serviceId, scheduledStart, scheduledEnd], additionalProperties: true }
 *     responses:
 *       200: { description: Slot validation result }
 *       400: { description: Invalid slot data }
 *       404: { description: Business, branch, service, or staff not found }
 */
router.post(
  '/businesses/:businessId/availability/validate',
  optionalAuth,
  availabilityController.validateSlot.bind(availabilityController)
);

export default router;
