import { Router } from 'express';
import { customerConfirmationController } from '../controllers/customer-confirmation.controller';

const router = Router();

router.get(
  '/appointments/confirm/:token',
  customerConfirmationController.getAppointmentFromToken.bind(customerConfirmationController)
);

router.post(
  '/appointments/confirm/:token/confirm',
  customerConfirmationController.confirmAppointment.bind(customerConfirmationController)
);

router.post(
  '/appointments/confirm/:token/cancel',
  customerConfirmationController.cancelAppointment.bind(customerConfirmationController)
);

router.post(
  '/appointments/confirm/:token/reschedule',
  customerConfirmationController.rescheduleAppointment.bind(customerConfirmationController)
);

export default router;
