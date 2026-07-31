const express = require('express');
const ReportController = require('../controllers/report_controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth_middleware');
const router = express.Router();

router.use(authenticateToken);

// Cashiers can query their daily sales summary
router.get('/cashier', ReportController.getCashierDashboard);

// Managers and Admins can query aggregate reports and trigger downloads
router.get('/admin', authorizeRoles('admin', 'manager'), ReportController.getAdminDashboard);
router.get('/export/sales-csv', authorizeRoles('admin', 'manager'), ReportController.exportSalesCSV);

module.exports = router;
