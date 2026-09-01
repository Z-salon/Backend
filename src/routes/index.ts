import { Router } from 'express';
import authRoutes from '../modules/auth/routes/auth.routes';
import invitationRoutes from '../modules/invitation/routes/invitation.routes';
import memberRoutes from '../modules/business/routes/member.routes';
import roleRoutes from '../modules/role/routes/role.routes';
import { config } from '../config/env';

const router = Router();

router.use(`/auth`, authRoutes);
router.use(`/`, invitationRoutes);
router.use(`/`, memberRoutes);
router.use(`/`, roleRoutes);

router.get('/health', (req, res) => {
  res.json({ success: true, message: 'OK', timestamp: new Date().toISOString() });
});

export default router;