import { Router } from 'express';
import { paymentMethodController } from '../controllers/payment-method.controller';
import { authenticate } from '../../../middlewares/authenticate';

const router = Router({ mergeParams: true });

router.use(authenticate);

router.post('/', paymentMethodController.createPaymentMethod);
router.get('/', paymentMethodController.getPaymentMethods);
router.patch('/:id', paymentMethodController.updatePaymentMethod);
router.delete('/:id', paymentMethodController.deletePaymentMethod);

export default router;
