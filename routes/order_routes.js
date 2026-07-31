const express = require('express');
const OrderController = require('../controllers/order_controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth_middleware');
const router = express.Router();

router.use(authenticateToken);

// Only cashier role can place active ticket orders
router.post('/', authorizeRoles('cashier'), OrderController.create);
router.get('/', OrderController.getAll);
router.get('/:id', OrderController.getById);
router.post('/:id/reprint', OrderController.reprint);
router.put('/:id/kitchen-status', OrderController.updateKitchenStatus);

// Only manager and admin can update general order bill status (refunds, cancellations)
router.put('/:id/status', authorizeRoles('admin', 'manager'), OrderController.updateStatus);

module.exports = router;
