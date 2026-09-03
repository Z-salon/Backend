import { Router } from 'express';
import authRoutes from '../modules/auth/routes/auth.routes';
import invitationRoutes from '../modules/invitation/routes/invitation.routes';
import memberRoutes from '../modules/business/routes/member.routes';
import roleRoutes from '../modules/role/routes/role.routes';
import businessConfigurationRoutes from '../modules/business/routes/business-configuration.routes';
import branchRoutes from '../modules/business/routes/branch.routes';
import { config } from '../config/env';

const router = Router();

router.use(`${config.apiPrefix}/auth`, authRoutes);
router.use(`${config.apiPrefix}`, invitationRoutes);
router.use(`${config.apiPrefix}`, memberRoutes);
router.use(`${config.apiPrefix}`, roleRoutes);
router.use(`${config.apiPrefix}`, businessConfigurationRoutes);
router.use(`${config.apiPrefix}`, branchRoutes);

router.get('/health', (req, res) => {
  res.json({ success: true, message: 'OK', timestamp: new Date().toISOString() });
});

export default router;