const pool = require('../config/db');

class ReportRepository {
  /**
   * Cashier Dashboard metrics for today
   */
  static async getCashierDashboardMetrics(restaurantId, cashierId) {
    const today = new Date().toISOString().slice(0, 10);
    const datePattern = `${today}%`;

    // 1. Sales & Bills Count
    const [salesRow] = await pool.execute(
      'SELECT COALESCE(SUM(total_amount), 0) as todaySales, COUNT(id) as billsCount, COALESCE(AVG(total_amount), 0) as avgBill ' +
      'FROM orders WHERE restaurant_id = ? AND cashier_id = ? AND created_at LIKE ? AND order_status != "cancelled"',
      [restaurantId, cashierId, datePattern]
    );

    // 2. Collection breakdown
    const [collectionRow] = await pool.execute(
      'SELECT ' +
      'COALESCE(SUM(CASE WHEN payment_mode = "cash" THEN total_amount ELSE 0 END), 0) as cashCollected, ' +
      'COALESCE(SUM(CASE WHEN payment_mode IN ("upi", "gpay", "phonepe", "paytm") THEN total_amount ELSE 0 END), 0) as upiCollected, ' +
      'COALESCE(SUM(CASE WHEN payment_mode IN ("card", "credit", "debit") THEN total_amount ELSE 0 END), 0) as cardCollected ' +
      'FROM orders WHERE restaurant_id = ? AND cashier_id = ? AND created_at LIKE ? AND order_status != "cancelled"',
      [restaurantId, cashierId, datePattern]
    );

    return {
      todaySales: parseFloat(salesRow[0].todaySales),
      billsCount: parseInt(salesRow[0].billsCount),
      avgBill: parseFloat(salesRow[0].avgBill),
      collections: {
        cash: parseFloat(collectionRow[0].cashCollected),
        upi: parseFloat(collectionRow[0].upiCollected),
        card: parseFloat(collectionRow[0].cardCollected),
        total: parseFloat(collectionRow[0].cashCollected) + parseFloat(collectionRow[0].upiCollected) + parseFloat(collectionRow[0].cardCollected)
      }
    };
  }

  /**
   * Admin General Dashboard & Custom Range report summaries
   */
  static async getSalesSummary(restaurantId, dateFrom, dateTo) {
    const [rows] = await pool.execute(
      'SELECT COALESCE(SUM(total_amount), 0) as totalRevenue, ' +
      'COALESCE(SUM(subtotal), 0) as subtotal, ' +
      'COALESCE(SUM(tax_amount), 0) as totalTax, ' +
      'COALESCE(SUM(discount_amount), 0) as totalDiscount, ' +
      'COUNT(id) as totalOrders ' +
      'FROM orders WHERE restaurant_id = ? AND created_at >= ? AND created_at <= ? AND order_status != "cancelled"',
      [restaurantId, dateFrom, dateTo]
    );
    return rows[0];
  }

  static async getPaymentBreakdown(restaurantId, dateFrom, dateTo) {
    const [rows] = await pool.execute(
      'SELECT payment_mode, COALESCE(SUM(total_amount), 0) as totalAmount, COUNT(id) as orderCount ' +
      'FROM orders ' +
      'WHERE restaurant_id = ? AND created_at >= ? AND created_at <= ? AND order_status != "cancelled" ' +
      'GROUP BY payment_mode',
      [restaurantId, dateFrom, dateTo]
    );
    return rows;
  }

  static async getTopSellingItems(restaurantId, dateFrom, dateTo, limit = 5) {
    const parsedLimit = parseInt(limit) || 5;
    const [rows] = await pool.execute(
      'SELECT name, SUM(quantity) as qtySold, SUM(price * quantity) as totalRevenue ' +
      'FROM order_items oi JOIN orders o ON oi.order_id = o.id ' +
      'WHERE o.restaurant_id = ? AND o.created_at >= ? AND o.created_at <= ? AND o.order_status != "cancelled" ' +
      'GROUP BY menu_item_id, name ' +
      `ORDER BY qtySold DESC LIMIT ${parsedLimit}`,
      [restaurantId, dateFrom, dateTo]
    );
    return rows;
  }

  static async getLeastSellingItems(restaurantId, dateFrom, dateTo, limit = 5) {
    const parsedLimit = parseInt(limit) || 5;
    const [rows] = await pool.execute(
      'SELECT name, SUM(quantity) as qtySold, SUM(price * quantity) as totalRevenue ' +
      'FROM order_items oi JOIN orders o ON oi.order_id = o.id ' +
      'WHERE o.restaurant_id = ? AND o.created_at >= ? AND o.created_at <= ? AND o.order_status != "cancelled" ' +
      'GROUP BY menu_item_id, name ' +
      `ORDER BY qtySold ASC LIMIT ${parsedLimit}`,
      [restaurantId, dateFrom, dateTo]
    );
    return rows;
  }

  static async getMostActiveCashiers(restaurantId, dateFrom, dateTo) {
    const [rows] = await pool.execute(
      'SELECT cashier_name, COUNT(id) as billsIssued, SUM(total_amount) as totalSales ' +
      'FROM orders ' +
      'WHERE restaurant_id = ? AND created_at >= ? AND created_at <= ? AND order_status != "cancelled" ' +
      'GROUP BY cashier_id, cashier_name ' +
      'ORDER BY totalSales DESC',
      [restaurantId, dateFrom, dateTo]
    );
    return rows;
  }

  static async getPeakHours(restaurantId, dateFrom, dateTo) {
    const [rows] = await pool.execute(
      'SELECT HOUR(created_at) as hourOfDay, COUNT(id) as orderCount, SUM(total_amount) as hourlySales ' +
      'FROM orders ' +
      'WHERE restaurant_id = ? AND created_at >= ? AND created_at <= ? AND order_status != "cancelled" ' +
      'GROUP BY HOUR(created_at) ' +
      'ORDER BY hourOfDay ASC',
      [restaurantId, dateFrom, dateTo]
    );
    return rows;
  }

  static async getDailySalesChartData(restaurantId, dateFrom, dateTo) {
    const [rows] = await pool.execute(
      'SELECT DATE(created_at) as salesDate, COALESCE(SUM(total_amount), 0) as dailyRevenue, COUNT(id) as orderCount ' +
      'FROM orders ' +
      'WHERE restaurant_id = ? AND created_at >= ? AND created_at <= ? AND order_status != "cancelled" ' +
      'GROUP BY DATE(created_at) ' +
      'ORDER BY salesDate ASC',
      [restaurantId, dateFrom, dateTo]
    );
    return rows;
  }

  static async getTaxesAndDiscountsReport(restaurantId, dateFrom, dateTo) {
    const [rows] = await pool.execute(
      'SELECT DATE(created_at) as salesDate, ' +
      'SUM(subtotal) as subtotal, ' +
      'SUM(tax_amount) as taxCollected, ' +
      'SUM(discount_amount) as discountGiven, ' +
      'SUM(total_amount) as netSales ' +
      'FROM orders ' +
      'WHERE restaurant_id = ? AND created_at >= ? AND created_at <= ? AND order_status != "cancelled" ' +
      'GROUP BY DATE(created_at) ' +
      'ORDER BY salesDate ASC',
      [restaurantId, dateFrom, dateTo]
    );
    return rows;
  }
}

module.exports = ReportRepository;
