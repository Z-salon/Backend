import { Router } from 'express';
import { availabilityController } from '../controllers/availability.controller';
import { optionalAuth } from '../../../middlewares/authenticate';

const router = Router();

// Public availability endpoint — no auth required (future customers browsing)
// optionalAuth is used so that authenticated internal users get a richer context if needed.
router.get(
  '/businesses/:businessId/availability',
  optionalAuth,
  availabilityController.getAvailableSlots.bind(availabilityController)
);

router.post(
  '/businesses/:businessId/availability/validate',
  optionalAuth,
  availabilityController.validateSlot.bind(availabilityController)
);

export default router;
