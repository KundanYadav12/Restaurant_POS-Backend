const pool = require('../config/db');

class PrintQueueRepository {
  /**
   * Enqueue a new print job into the print_queue table with pre-formatted ESC/POS payload
   */
  static async enqueue(job) {
    const { restaurant_id, order_id, printer_id, print_type, payload_base64 } = job;
    const [result] = await pool.execute(
      'INSERT INTO print_queue (restaurant_id, order_id, printer_id, payload_base64, print_type, status, retry_count, created_at) ' +
      'VALUES (?, ?, ?, ?, ?, "PENDING", 0, NOW())',
      [
        restaurant_id, 
        order_id, 
        printer_id || null, 
        payload_base64 || null, 
        print_type || 'RECEIPT'
      ]
    );
    return result.insertId;
  }

  /**
   * Fetch pending print jobs specifically for a restaurant outlet (used by Local Print Agent)
   */
  static async getPendingJobsForRestaurant(restaurantId, limit = 20) {
    const parsedLimit = Math.max(1, parseInt(limit) || 20);
    const [rows] = await pool.query(
      `SELECT q.*, p.name as printer_name, p.ip_address, p.port, p.paper_width, p.role, p.type as printer_type, p.auto_cut, p.cash_drawer 
       FROM print_queue q 
       LEFT JOIN printers p ON q.printer_id = p.id 
       WHERE q.restaurant_id = ? AND q.status = "PENDING" AND q.retry_count < 3 
       ORDER BY q.id ASC LIMIT ${parsedLimit}`,
      [restaurantId]
    );
    return rows;
  }

  /**
   * Fetch all pending print jobs across all outlets
   */
  static async getPendingJobs(limit = 20) {
    const parsedLimit = Math.max(1, parseInt(limit) || 20);
    const [rows] = await pool.query(
      `SELECT q.*, p.name as printer_name, p.ip_address, p.port, p.paper_width, p.role, p.type as printer_type, p.auto_cut, p.cash_drawer 
       FROM print_queue q 
       LEFT JOIN printers p ON q.printer_id = p.id 
       WHERE q.status = "PENDING" AND q.retry_count < 3 
       ORDER BY q.id ASC LIMIT ${parsedLimit}`
    );
    return rows;
  }

  /**
   * Update print job status upon completion or failure
   */
  static async updateJobStatus(jobId, status, errorMessage = null) {
    const [result] = await pool.execute(
      'UPDATE print_queue SET status = ?, error_message = ?, printed_at = IF(? = "SUCCESS", NOW(), printed_at) WHERE id = ?',
      [status, errorMessage || null, status, jobId]
    );
    return result.affectedRows > 0;
  }

  /**
   * Increment retry counter on failed attempt
   */
  static async incrementRetry(jobId, errorMessage) {
    const [result] = await pool.execute(
      'UPDATE print_queue SET retry_count = retry_count + 1, error_message = ?, status = IF(retry_count >= 3, "FAILED", "PENDING") WHERE id = ?',
      [errorMessage, jobId]
    );
    return result.affectedRows > 0;
  }

  /**
   * Fetch print queue history for an order
   */
  static async getQueueForOrder(restaurantId, orderId) {
    const [rows] = await pool.execute(
      'SELECT q.*, p.name as printer_name FROM print_queue q LEFT JOIN printers p ON q.printer_id = p.id WHERE q.restaurant_id = ? AND q.order_id = ? ORDER BY q.id DESC',
      [restaurantId, orderId]
    );
    return rows;
  }
}

module.exports = PrintQueueRepository;
