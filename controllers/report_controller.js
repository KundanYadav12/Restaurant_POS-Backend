const ReportRepository = require('../repositories/report_repository');

class ReportController {
  /**
   * Cashier dashboard metrics for the current day
   */
  static async getCashierDashboard(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;
      const cashierId = req.user.id;
      const metrics = await ReportRepository.getCashierDashboardMetrics(restaurantId, cashierId);
      return res.json(metrics);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to retrieve cashier metrics.' });
    }
  }

  /**
   * Admin dashboard metrics (requires date range)
   */
  static async getAdminDashboard(req, res) {
    // Default to last 30 days if no range provided
    const dateTo = req.query.date_to || new Date().toISOString().slice(0, 19).replace('T', ' ');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateFrom = req.query.date_from || thirtyDaysAgo.toISOString().slice(0, 19).replace('T', ' ');

    try {
      const restaurantId = req.user.restaurant_id;

      const summary = await ReportRepository.getSalesSummary(restaurantId, dateFrom, dateTo);
      const payments = await ReportRepository.getPaymentBreakdown(restaurantId, dateFrom, dateTo);
      const topItems = await ReportRepository.getTopSellingItems(restaurantId, dateFrom, dateTo, 5);
      const leastItems = await ReportRepository.getLeastSellingItems(restaurantId, dateFrom, dateTo, 5);
      const activeCashiers = await ReportRepository.getMostActiveCashiers(restaurantId, dateFrom, dateTo);
      const peakHours = await ReportRepository.getPeakHours(restaurantId, dateFrom, dateTo);
      const dailyChart = await ReportRepository.getDailySalesChartData(restaurantId, dateFrom, dateTo);

      return res.json({
        summary: {
          totalRevenue: parseFloat(summary.totalRevenue || 0),
          subtotal: parseFloat(summary.subtotal || 0),
          totalTax: parseFloat(summary.totalTax || 0),
          totalDiscount: parseFloat(summary.totalDiscount || 0),
          totalOrders: parseInt(summary.totalOrders || 0)
        },
        payments,
        topItems,
        leastItems,
        activeCashiers,
        peakHours,
        dailyChart
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to retrieve admin reports.' });
    }
  }

  /**
   * Export sales report to CSV format
   */
  static async exportSalesCSV(req, res) {
    const dateTo = req.query.date_to || new Date().toISOString().slice(0, 19).replace('T', ' ');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateFrom = req.query.date_from || thirtyDaysAgo.toISOString().slice(0, 19).replace('T', ' ');

    try {
      const restaurantId = req.user.restaurant_id;
      const data = await ReportRepository.getTaxesAndDiscountsReport(restaurantId, dateFrom, dateTo);

      let csv = 'Sales Date,Subtotal,Tax Collected,Discount Given,Net Sales\r\n';
      
      data.forEach(row => {
        csv += `${row.salesDate.toISOString().slice(0, 10)},${parseFloat(row.subtotal).toFixed(2)},${parseFloat(row.taxCollected).toFixed(2)},${parseFloat(row.discountGiven).toFixed(2)},${parseFloat(row.netSales).toFixed(2)}\r\n`;
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=sales_report_${dateFrom.slice(0, 10)}_to_${dateTo.slice(0, 10)}.csv`);
      return res.send(csv);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to generate CSV export.' });
    }
  }
}

module.exports = ReportController;
