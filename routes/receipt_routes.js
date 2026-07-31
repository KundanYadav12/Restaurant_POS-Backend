const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middlewares/auth_middleware');
const ReceiptRepository = require('../repositories/receipt_repository');
const SuperAdminRepository = require('../repositories/superadmin_repository');
const PrinterService = require('../services/printer_service');

// GET /api/settings/receipt - Fetch settings
router.get('/', authenticateToken, async (req, res) => {
  try {
    const restaurantId = req.user.restaurant_id || req.query.restaurant_id || 1;
    const settings = await ReceiptRepository.getByRestaurantId(restaurantId);
    return res.json(settings);
  } catch (err) {
    console.error('Fetch receipt settings error:', err);
    return res.status(500).json({ error: 'Failed to load receipt settings: ' + err.message });
  }
});

// POST /api/settings/receipt - Update settings (Admin/Manager only)
router.post('/', authenticateToken, authorizeRoles('admin', 'manager', 'super_admin', 'superadmin'), async (req, res) => {
  try {
    const restaurantId = req.user.restaurant_id || req.body.restaurant_id || 1;
    const updated = await ReceiptRepository.update(restaurantId, req.body);
    await SuperAdminRepository.addAuditLog(
      restaurantId,
      req.user.id,
      'UPDATE_RECEIPT_SETTINGS',
      'Updated dynamic receipt and KOT print settings',
      req.ip
    );
    return res.json({ message: 'Receipt & KOT settings updated successfully.', settings: updated });
  } catch (err) {
    console.error('Update receipt settings error:', err);
    return res.status(500).json({ error: 'Failed to update receipt settings: ' + err.message });
  }
});

// POST /api/settings/receipt/test-print - Test print sample receipt & KOT
router.post('/test-print', authenticateToken, authorizeRoles('admin', 'manager', 'super_admin', 'superadmin'), async (req, res) => {
  try {
    const restaurantId = req.user.restaurant_id || req.body.restaurant_id || 1;
    const printType = req.body.print_type || 'BOTH'; // RECEIPT, KOT, or BOTH

    // Sample mock order for test print
    const sampleOrder = {
      id: 99999,
      unique_order_number: 'TEST-999',
      cashier_name: req.user.name || 'Admin Tester',
      subtotal: 350.00,
      discount_amount: 25.00,
      tax_amount: 16.25,
      total_amount: 341.25,
      payment_mode: 'CASH',
      table_number_or_takeaway: 'Table #4',
      notes: 'Customer prefers medium spice',
      created_at: new Date()
    };

    const sampleItems = [
      { menu_item_id: 101, name: 'Paneer Butter Masala', quantity: 1, price: 220.00, notes: 'Extra Gravy' },
      { menu_item_id: 102, name: 'Garlic Naan', quantity: 2, price: 40.00, notes: 'Crispy' },
      { menu_item_id: 103, name: 'Mango Lassi', quantity: 1, price: 50.00 }
    ];

    const restaurant = (await SuperAdminRepository.getRestaurantById(restaurantId)) || { name: req.user.restaurant_name || 'RESTAURANT POS' };
    const receiptSettings = await ReceiptRepository.getByRestaurantId(restaurantId);

    if (printType === 'RECEIPT' || printType === 'BOTH') {
      const receiptBuffer = PrinterService.buildReceiptPayload(sampleOrder, sampleItems, restaurant, null, receiptSettings);
      await PrinterService.sendToPrinterSocket('127.0.0.1', 9100, receiptBuffer);
    }

    if (printType === 'KOT' || printType === 'BOTH') {
      const kotBuffer = PrinterService.buildKOTPayload(sampleOrder, sampleItems, null, receiptSettings);
      await PrinterService.sendToPrinterSocket('127.0.0.1', 9100, kotBuffer);
    }

    return res.json({ message: `Test ${printType} dispatched to virtual/network thermal printer successfully.` });
  } catch (err) {
    console.error('Test print error:', err);
    return res.status(500).json({ error: 'Failed to execute test print.' });
  }
});

module.exports = router;
