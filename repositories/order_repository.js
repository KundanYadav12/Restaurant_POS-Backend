const pool = require('../config/db');

class OrderRepository {
  /**
   * Complete transactional order creation
   */
  static async create(restaurantId, orderData, items) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const {
        cashier_id,
        cashier_name,
        subtotal,
        tax_amount,
        discount_amount,
        total_amount,
        payment_mode,
        payment_details,
        cashier_shift_id,
        table_number_or_takeaway,
        notes
      } = orderData;

      const safeSubtotal = isNaN(parseFloat(subtotal)) ? 0.00 : parseFloat(subtotal);
      const safeTaxAmount = isNaN(parseFloat(tax_amount)) ? 0.00 : parseFloat(tax_amount);
      const safeDiscountAmount = isNaN(parseFloat(discount_amount)) ? 0.00 : parseFloat(discount_amount);
      const safeTotalAmount = isNaN(parseFloat(total_amount)) ? 0.00 : parseFloat(total_amount);

      // 1. Generate unique readable order number
      // Format: ORD-YYYYMMDD-HHMMSS-RAND
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const rand = Math.floor(1000 + Math.random() * 9000);
      const uniqueOrderNumber = `ORD-${dateStr}-${rand}`;

      // 2. Insert Order
      const [orderResult] = await connection.execute(
        'INSERT INTO orders (unique_order_number, restaurant_id, cashier_id, cashier_name, subtotal, tax_amount, discount_amount, total_amount, payment_mode, payment_details, order_status, cashier_shift_id, table_number_or_takeaway, notes, kitchen_status) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "completed", ?, ?, ?, "pending")',
        [
          uniqueOrderNumber, restaurantId, cashier_id, cashier_name, safeSubtotal, safeTaxAmount,
          safeDiscountAmount, safeTotalAmount, payment_mode, payment_details ? JSON.stringify(payment_details) : null,
          cashier_shift_id, table_number_or_takeaway || 'Takeaway', notes || null
        ]
      );
      const orderId = orderResult.insertId;

      // 3. Insert Order Items
      for (const item of items) {
        const itemPrice = isNaN(parseFloat(item.price)) ? 0.00 : parseFloat(item.price);
        const itemGstRate = isNaN(parseFloat(item.gst_rate)) ? 0.00 : parseFloat(item.gst_rate);
        const itemQuantity = isNaN(parseInt(item.quantity)) ? 1 : parseInt(item.quantity);
        const itemTax = parseFloat(((itemPrice * itemQuantity) * (itemGstRate / 100)).toFixed(2)) || 0.00;
        
        await connection.execute(
          'INSERT INTO order_items (order_id, menu_item_id, name, price, gst_rate, tax_amount, discount_amount, quantity, notes) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            orderId, item.menu_item_id, item.name, itemPrice, itemGstRate,
            itemTax, item.discount_amount || 0.00, itemQuantity, item.notes || null
          ]
        );
      }

      // 4. Update Cashier Shift sales
      const cashAdd = payment_mode === 'cash' ? total_amount : 0;
      const upiAdd = (payment_mode === 'upi' || payment_mode === 'gpay' || payment_mode === 'phonepe' || payment_mode === 'paytm') ? total_amount : 0;
      const cardAdd = (payment_mode === 'card' || payment_mode === 'credit' || payment_mode === 'debit') ? total_amount : 0;

      await connection.execute(
        'UPDATE cashier_shifts SET ' +
        'total_bills = total_bills + 1, ' +
        'cash_collected = cash_collected + ?, ' +
        'upi_collected = upi_collected + ?, ' +
        'card_collected = card_collected + ?, ' +
        'total_collected = total_collected + ? ' +
        'WHERE id = ? AND restaurant_id = ?',
        [cashAdd, upiAdd, cardAdd, total_amount, cashier_shift_id, restaurantId]
      );

      // Commit transaction
      await connection.commit();

      // Retrieve full details of the created order
      const [orderRows] = await connection.execute(
        'SELECT * FROM orders WHERE id = ?',
        [orderId]
      );
      
      const [itemRows] = await connection.execute(
        'SELECT * FROM order_items WHERE order_id = ?',
        [orderId]
      );

      return {
        order: orderRows[0],
        items: itemRows
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  static async getById(id, restaurantId) {
    const [orders] = await pool.execute(
      'SELECT * FROM orders WHERE id = ? AND restaurant_id = ?',
      [id, restaurantId]
    );
    if (orders.length === 0) return null;
    
    const [items] = await pool.execute(
      'SELECT * FROM order_items WHERE order_id = ?',
      [id]
    );

    return {
      order: orders[0],
      items
    };
  }

  static async getOrderItems(orderId) {
    const [items] = await pool.execute(
      'SELECT * FROM order_items WHERE order_id = ?',
      [orderId]
    );
    return items;
  }

  static async getByOrderNumber(orderNumber, restaurantId) {
    const [orders] = await pool.execute(
      'SELECT * FROM orders WHERE unique_order_number = ? AND restaurant_id = ?',
      [orderNumber, restaurantId]
    );
    if (orders.length === 0) return null;

    const [items] = await pool.execute(
      'SELECT * FROM order_items WHERE order_id = ?',
      [orders[0].id]
    );

    return {
      order: orders[0],
      items
    };
  }

  static async getAll(restaurantId, filters = {}) {
    const { cashier_id, order_status, date_from, date_to, limit, offset } = filters;
    let query = 'SELECT * FROM orders WHERE restaurant_id = ?';
    const params = [restaurantId];

    if (cashier_id) {
      query += ' AND cashier_id = ?';
      params.push(cashier_id);
    }
    if (order_status) {
      query += ' AND order_status = ?';
      params.push(order_status);
    }
    if (date_from) {
      query += ' AND created_at >= ?';
      params.push(date_from);
    }
    if (date_to) {
      query += ' AND created_at <= ?';
      params.push(date_to);
    }

    query += ' ORDER BY id DESC';

    if (limit) {
      query += ' LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset || 0));
    }

    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async updateOrderStatus(id, restaurantId, status) {
    const [result] = await pool.execute(
      'UPDATE orders SET order_status = ?, completed_at = ? WHERE id = ? AND restaurant_id = ?',
      [status, status === 'completed' ? new Date() : null, id, restaurantId]
    );
    return result.affectedRows > 0;
  }

  static async updateKitchenStatus(id, restaurantId, status) {
    const [result] = await pool.execute(
      'UPDATE orders SET kitchen_status = ? WHERE id = ? AND restaurant_id = ?',
      [status, id, restaurantId]
    );
    return result.affectedRows > 0;
  }

  static async incrementReprintCount(id, restaurantId) {
    const [result] = await pool.execute(
      'UPDATE orders SET printed_count = printed_count + 1 WHERE id = ? AND restaurant_id = ?',
      [id, restaurantId]
    );
    return result.affectedRows > 0;
  }
}

module.exports = OrderRepository;
