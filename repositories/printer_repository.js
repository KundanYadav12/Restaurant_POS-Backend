const pool = require('../config/db');

class PrinterRepository {
  static async getAll(restaurantId) {
    const [rows] = await pool.execute(
      'SELECT * FROM printers WHERE restaurant_id = ? ORDER BY id ASC',
      [restaurantId]
    );
    return rows;
  }

  static async getById(id, restaurantId) {
    const [rows] = await pool.execute(
      'SELECT * FROM printers WHERE id = ? AND restaurant_id = ?',
      [id, restaurantId]
    );
    return rows[0];
  }

  static async getByRole(restaurantId, role) {
    const [rows] = await pool.execute(
      'SELECT * FROM printers WHERE restaurant_id = ? AND role = ? AND is_active = 1',
      [restaurantId, role]
    );
    return rows;
  }

  static async getDefaultReceiptPrinter(restaurantId) {
    const [rows] = await pool.execute(
      'SELECT * FROM printers WHERE restaurant_id = ? AND is_default_receipt = 1 AND is_active = 1 LIMIT 1',
      [restaurantId]
    );
    if (rows.length > 0) return rows[0];
    
    // Fallback to first active receipt printer
    const [fallback] = await pool.execute(
      'SELECT * FROM printers WHERE restaurant_id = ? AND (role = "receipt" OR role = "counter") AND is_active = 1 LIMIT 1',
      [restaurantId]
    );
    return fallback[0] || null;
  }

  static async getDefaultKOTPrinter(restaurantId) {
    const [rows] = await pool.execute(
      'SELECT * FROM printers WHERE restaurant_id = ? AND is_default_kot = 1 AND is_active = 1 LIMIT 1',
      [restaurantId]
    );
    if (rows.length > 0) return rows[0];

    // Fallback to first active kitchen printer
    const [fallback] = await pool.execute(
      'SELECT * FROM printers WHERE restaurant_id = ? AND (role = "kitchen" OR role = "kot") AND is_active = 1 LIMIT 1',
      [restaurantId]
    );
    return fallback[0] || null;
  }

  static async create(restaurantId, printer) {
    const {
      name, type, ip_address, port, paper_width, character_encoding,
      role, is_default_receipt, is_default_kot, auto_cut, cash_drawer
    } = printer;

    if (is_default_receipt) {
      await pool.execute('UPDATE printers SET is_default_receipt = 0 WHERE restaurant_id = ?', [restaurantId]);
    }
    if (is_default_kot) {
      await pool.execute('UPDATE printers SET is_default_kot = 0 WHERE restaurant_id = ?', [restaurantId]);
    }

    const [result] = await pool.execute(
      'INSERT INTO printers (restaurant_id, name, type, ip_address, port, paper_width, character_encoding, role, is_default_receipt, is_default_kot, auto_cut, cash_drawer, is_active, status, created_at, updated_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, "online", NOW(), NOW())',
      [
        restaurantId, name, type || 'lan', ip_address, port || 9100,
        paper_width || '80', character_encoding || 'UTF-8', role || 'receipt',
        is_default_receipt ? 1 : 0, is_default_kot ? 1 : 0,
        auto_cut !== undefined ? (auto_cut ? 1 : 0) : 1,
        cash_drawer !== undefined ? (cash_drawer ? 1 : 0) : 1
      ]
    );
    return result.insertId;
  }

  static async update(id, restaurantId, printer) {
    const {
      name, type, ip_address, port, paper_width, character_encoding,
      role, is_default_receipt, is_default_kot, auto_cut, cash_drawer, is_active, status
    } = printer;

    if (is_default_receipt) {
      await pool.execute('UPDATE printers SET is_default_receipt = 0 WHERE restaurant_id = ?', [restaurantId]);
    }
    if (is_default_kot) {
      await pool.execute('UPDATE printers SET is_default_kot = 0 WHERE restaurant_id = ?', [restaurantId]);
    }

    const [result] = await pool.execute(
      'UPDATE printers SET name = ?, type = ?, ip_address = ?, port = ?, paper_width = ?, character_encoding = ?, role = ?, is_default_receipt = ?, is_default_kot = ?, auto_cut = ?, cash_drawer = ?, is_active = ?, status = ?, updated_at = NOW() WHERE id = ? AND restaurant_id = ?',
      [
        name, type || 'lan', ip_address, port || 9100, paper_width || '80', character_encoding || 'UTF-8',
        role || 'receipt', is_default_receipt ? 1 : 0, is_default_kot ? 1 : 0,
        auto_cut !== undefined ? (auto_cut ? 1 : 0) : 1,
        cash_drawer !== undefined ? (cash_drawer ? 1 : 0) : 1,
        is_active !== undefined ? (is_active ? 1 : 0) : 1,
        status || 'online', id, restaurantId
      ]
    );
    return result.affectedRows > 0;
  }

  static async updateStatus(id, restaurantId, status) {
    const [result] = await pool.execute(
      'UPDATE printers SET status = ?, updated_at = NOW() WHERE id = ? AND restaurant_id = ?',
      [status, id, restaurantId]
    );
    return result.affectedRows > 0;
  }

  static async delete(id, restaurantId) {
    const [result] = await pool.execute(
      'DELETE FROM printers WHERE id = ? AND restaurant_id = ?',
      [id, restaurantId]
    );
    return result.affectedRows > 0;
  }
}

module.exports = PrinterRepository;
