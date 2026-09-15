import { Router } from 'express';
import authRoutes from '../modules/auth/routes/auth.routes';
import invitationRoutes from '../modules/invitation/routes/invitation.routes';
import memberRoutes from '../modules/business/routes/member.routes';
import roleRoutes from '../modules/role/routes/role.routes';
import businessConfigurationRoutes from '../modules/business/routes/business-configuration.routes';
import branchRoutes from '../modules/business/routes/branch.routes';
import branchPhoneRoutes from '../modules/business/routes/branch-phone.routes';
import batchCreateRoutes from '../modules/business/routes/batch-create.routes';
import serviceCategoryRoutes from '../modules/services/routes/service-category.routes';
import serviceRoutes from '../modules/services/routes/service.routes';
import staffRoutes from '../modules/staff/routes/staff.routes';
import customerRoutes from '../modules/customer/routes/customer.routes';
import availabilityRoutes from '../modules/services/routes/availability.routes';
import appointmentRoutes from '../modules/appointment/routes/appointment.routes';
import customerAppointmentRoutes from '../modules/customer/routes/customer-appointment.routes';
import publicBookingRoutes from '../modules/appointment/routes/public-booking.routes';
import customerConfirmationRoutes from '../modules/appointment/routes/customer-confirmation.routes';
import refundRequestRoutes from '../modules/payment/routes/refund-request.routes';
import { config } from '../config/env';

const router = Router();

router.use(`${config.apiPrefix}/auth`, authRoutes);
router.use(`${config.apiPrefix}`, invitationRoutes);
router.use(`${config.apiPrefix}`, memberRoutes);
router.use(`${config.apiPrefix}`, roleRoutes);
router.use(`${config.apiPrefix}`, businessConfigurationRoutes);
router.use(`${config.apiPrefix}`, branchRoutes);
router.use(`${config.apiPrefix}`, branchPhoneRoutes);
router.use(`${config.apiPrefix}`, batchCreateRoutes);
router.use(`${config.apiPrefix}`, serviceCategoryRoutes);
router.use(`${config.apiPrefix}`, serviceRoutes);
router.use(`${config.apiPrefix}`, staffRoutes);
router.use(`${config.apiPrefix}`, customerRoutes);
router.use(`${config.apiPrefix}`, availabilityRoutes);
router.use(`${config.apiPrefix}`, appointmentRoutes);
router.use(`${config.apiPrefix}/customer`, customerAppointmentRoutes);
router.use(`${config.apiPrefix}/public`, publicBookingRoutes);
router.use(`${config.apiPrefix}/public`, customerConfirmationRoutes);
router.use(`${config.apiPrefix}`, refundRequestRoutes);

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Check API health
 *     responses:
 *       200: { description: API is healthy }
 */
router.get('/health', (req, res) => {
  res.json({ success: true, message: 'OK', timestamp: new Date().toISOString() });
});

export default router;