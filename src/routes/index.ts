import { Router } from 'express';
import authRoutes from '../modules/auth/routes/auth.routes';
import invitationRoutes from '../modules/invitation/routes/invitation.routes';
import memberRoutes from '../modules/business/routes/member.routes';
import roleRoutes from '../modules/role/routes/role.routes';
import businessConfigurationRoutes from '../modules/business/routes/business-configuration.routes';
import branchRoutes from '../modules/business/routes/branch.routes';
import serviceCategoryRoutes from '../modules/services/routes/service-category.routes';
import serviceRoutes from '../modules/services/routes/service.routes';
import staffRoutes from '../modules/staff/routes/staff.routes';
import customerRoutes from '../modules/customer/routes/customer.routes';
import availabilityRoutes from '../modules/services/routes/availability.routes';
import appointmentRoutes from '../modules/appointment/routes/appointment.routes';
import customerAppointmentRoutes from '../modules/customer/routes/customer-appointment.routes';
import publicBookingRoutes from '../modules/appointment/routes/public-booking.routes';
import { config } from '../config/env';

const router = Router();

router.use(`/auth`, authRoutes);
router.use(`/`, invitationRoutes);
router.use(`/`, memberRoutes);
router.use(`/`, roleRoutes);
router.use(`/`, businessConfigurationRoutes);
router.use(`/`, branchRoutes);
router.use(`/`, serviceCategoryRoutes);
router.use(`/`, serviceRoutes);
router.use(`/`, staffRoutes);
router.use(`/`, customerRoutes);
router.use(`/`, availabilityRoutes);
router.use(`/`, appointmentRoutes);
router.use(`/customer`, customerAppointmentRoutes);
router.use(`/public`, publicBookingRoutes);

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