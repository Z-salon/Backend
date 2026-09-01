import { Router } from 'express';
import { memberController } from '../controllers/member.controller';
import { authenticate } from '../../../middlewares/authenticate';
import { requireBusinessMembership } from '../../../middlewares/require-business-membership';
import { requirePermission } from '../../../middlewares/require-permission';
import { bodyValidator } from '../../../utils/body-validator';
import { memberUpdateSchema, memberStatusSchema } from '../../../validation/auth.schemas';

const router = Router();

/**
 * @openapi
 * /api/v1/businesses/{businessId}/members:
 *   get:
 *     tags: [Members]
 *     summary: List members of a business
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Members retrieved successfully
 */
router.get(
  '/businesses/:businessId/members',
  authenticate,
  requireBusinessMembership,
  requirePermission('MEMBER_VIEW'),
  memberController.getMembers.bind(memberController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/members/{memberId}:
 *   get:
 *     tags: [Members]
 *     summary: Get a specific business member
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Member retrieved successfully
 */
router.get(
  '/businesses/:businessId/members/:memberId',
  authenticate,
  requireBusinessMembership,
  requirePermission('MEMBER_VIEW'),
  memberController.getMember.bind(memberController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/members/{memberId}:
 *   patch:
 *     tags: [Members]
 *     summary: Update a member record
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Member updated successfully
 */
router.patch(
  '/businesses/:businessId/members/:memberId',
  authenticate,
  requireBusinessMembership,
  requirePermission('MEMBER_UPDATE'),
  bodyValidator(memberUpdateSchema),
  memberController.updateMember.bind(memberController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/members/{memberId}/status:
 *   patch:
 *     tags: [Members]
 *     summary: Change member status
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Member status updated
 */
router.patch(
  '/businesses/:businessId/members/:memberId/status',
  authenticate,
  requireBusinessMembership,
  requirePermission('MEMBER_SUSPEND'),
  bodyValidator(memberStatusSchema),
  memberController.updateMemberStatus.bind(memberController)
);

/**
 * @openapi
 * /api/v1/businesses/{businessId}/members/{memberId}:
 *   delete:
 *     tags: [Members]
 *     summary: Remove a member from the business
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Member removed successfully
 */
router.delete(
  '/businesses/:businessId/members/:memberId',
  authenticate,
  requireBusinessMembership,
  requirePermission('MEMBER_REMOVE'),
  memberController.removeMember.bind(memberController)
);

export default router;