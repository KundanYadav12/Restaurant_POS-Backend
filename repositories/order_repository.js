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
        notes,
        status,
        discount_type,
        discount_value,
        customer_name,
        customer_phone
      } = orderData;

      const safeSubtotal = isNaN(parseFloat(subtotal)) ? 0.00 : parseFloat(subtotal);
      const safeTaxAmount = isNaN(parseFloat(tax_amount)) ? 0.00 : parseFloat(tax_amount);
      const safeDiscountAmount = isNaN(parseFloat(discount_amount)) ? 0.00 : parseFloat(discount_amount);
      const safeTotalAmount = isNaN(parseFloat(total_amount)) ? 0.00 : parseFloat(total_amount);
      const orderStatus = status || 'completed';

      // 1. Fetch GST Settings
      const [settingsRows] = await connection.execute(
        'SELECT gst_mode FROM receipt_settings WHERE restaurant_id = ?',
        [restaurantId]
      );
      const gstMode = settingsRows[0]?.gst_mode || 'excluded';

      // 2. Generate unique readable order number
      // Format: ORD-YYYYMMDD-HHMMSS-RAND
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const rand = Math.floor(1000 + Math.random() * 9000);
      const uniqueOrderNumber = `ORD-${dateStr}-${rand}`;

      // 3. Insert Order
      const [orderResult] = await connection.execute(
        'INSERT INTO orders (unique_order_number, restaurant_id, cashier_id, cashier_name, subtotal, tax_amount, discount_amount, total_amount, payment_mode, payment_details, order_status, cashier_shift_id, table_number_or_takeaway, notes, kitchen_status, discount_type, discount_value, customer_name, customer_phone) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "pending", ?, ?, ?, ?)',
        [
          uniqueOrderNumber, restaurantId, cashier_id, cashier_name, safeSubtotal, safeTaxAmount,
          safeDiscountAmount, safeTotalAmount, payment_mode, payment_details ? JSON.stringify(payment_details) : null,
          orderStatus, cashier_shift_id, table_number_or_takeaway || 'Takeaway', notes || null,
          discount_type || 'amount', parseFloat(discount_value || 0), customer_name || null, customer_phone || null
        ]
      );
      const orderId = orderResult.insertId;

      // 4. Insert Order Items (Respect GST Mode)
      for (const item of items) {
        const itemPrice = isNaN(parseFloat(item.price)) ? 0.00 : parseFloat(item.price);
        const itemGstRate = isNaN(parseFloat(item.gst_rate)) ? 0.00 : parseFloat(item.gst_rate);
        const itemQuantity = isNaN(parseInt(item.quantity)) ? 1 : parseInt(item.quantity);

        let unitPrice, itemTax;
        if (gstMode === 'included') {
          unitPrice = parseFloat((itemPrice / (1 + (itemGstRate / 100))).toFixed(4));
          itemTax = parseFloat(((itemPrice * itemQuantity) - (unitPrice * itemQuantity)).toFixed(2));
        } else {
          unitPrice = itemPrice;
          itemTax = parseFloat(((unitPrice * itemQuantity) * (itemGstRate / 100)).toFixed(2));
        }

        await connection.execute(
          'INSERT INTO order_items (order_id, menu_item_id, name, price, gst_rate, tax_amount, discount_amount, quantity, notes) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            orderId, item.menu_item_id, item.name, unitPrice, itemGstRate,
            itemTax, item.discount_amount || 0.00, itemQuantity, item.notes || null
          ]
        );

        // Auto-deduct inventory stock for tracked menu items
        if (item.menu_item_id) {
          const [curStockRows] = await connection.execute(
            'SELECT current_stock FROM menu_items WHERE id = ? AND restaurant_id = ?',
            [item.menu_item_id, restaurantId]
          );
          if (curStockRows.length > 0) {
            const prevStock = parseFloat(curStockRows[0].current_stock || 0);
            const newStock = Math.max(0, prevStock - itemQuantity);
            await connection.execute(
              'UPDATE menu_items SET current_stock = ? WHERE id = ? AND restaurant_id = ?',
              [newStock, item.menu_item_id, restaurantId]
            );
            await connection.execute(
              `INSERT INTO stock_logs (restaurant_id, menu_item_id, user_name, adjustment_type, quantity, previous_stock, new_stock, reason)
               VALUES (?, ?, ?, 'sale', ?, ?, ?, ?)`,
              [restaurantId, item.menu_item_id, cashier_name || 'POS Cashier', itemQuantity, prevStock, newStock, `Order #${uniqueOrderNumber}`]
            );
          }
        }
      }

      // 5. Update Cashier Shift sales (Only if completed)
      if (orderStatus === 'completed' && cashier_shift_id) {
        const cashAdd = payment_mode === 'cash' ? safeTotalAmount : 0;
        const upiAdd = ['upi', 'gpay', 'phonepe', 'paytm'].includes(payment_mode) ? safeTotalAmount : 0;
        const cardAdd = ['card', 'credit', 'debit'].includes(payment_mode) ? safeTotalAmount : 0;
        const walletAdd = payment_mode === 'wallet' ? safeTotalAmount : 0;
        const otherAdd = (!['cash', 'upi', 'gpay', 'phonepe', 'paytm', 'card', 'credit', 'debit', 'wallet'].includes(payment_mode)) ? safeTotalAmount : 0;

        await connection.execute(
          'UPDATE cashier_shifts SET ' +
          'total_bills = total_bills + 1, ' +
          'cash_collected = cash_collected + ?, ' +
          'upi_collected = upi_collected + ?, ' +
          'card_collected = card_collected + ?, ' +
          'wallet_collected = wallet_collected + ?, ' +
          'other_collected = other_collected + ?, ' +
          'total_collected = total_collected + ? ' +
          'WHERE id = ? AND restaurant_id = ?',
          [cashAdd, upiAdd, cardAdd, walletAdd, otherAdd, safeTotalAmount, cashier_shift_id, restaurantId]
        );
      }

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

  static async updateOrderStatus(id, restaurantId, status, paymentMode = null, paymentDetails = null, shiftId = null) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Fetch order details first
      const [orders] = await connection.execute(
        'SELECT total_amount, cashier_shift_id, payment_mode, order_status FROM orders WHERE id = ? AND restaurant_id = ?',
        [id, restaurantId]
      );

      if (orders.length === 0) {
        await connection.commit();
        return false;
      }

      const order = orders[0];
      const prevStatus = order.order_status;
      const activePaymentMode = paymentMode || order.payment_mode || 'cash';
      const activeShiftId = shiftId || order.cashier_shift_id;

      const [result] = await connection.execute(
        'UPDATE orders SET order_status = ?, payment_mode = ?, payment_details = ?, cashier_shift_id = ?, completed_at = ? WHERE id = ? AND restaurant_id = ?',
        [status, activePaymentMode, paymentDetails ? JSON.stringify(paymentDetails) : null, activeShiftId, status === 'completed' ? new Date() : null, id, restaurantId]
      );

      if (status === 'completed' && prevStatus !== 'completed' && activeShiftId) {
        const total_amount = parseFloat(order.total_amount);
        const cashAdd = activePaymentMode === 'cash' ? total_amount : 0;
        const upiAdd = ['upi', 'gpay', 'phonepe', 'paytm'].includes(activePaymentMode) ? total_amount : 0;
        const cardAdd = ['card', 'credit', 'debit'].includes(activePaymentMode) ? total_amount : 0;
        const walletAdd = activePaymentMode === 'wallet' ? total_amount : 0;
        const otherAdd = (!['cash', 'upi', 'gpay', 'phonepe', 'paytm', 'card', 'credit', 'debit', 'wallet'].includes(activePaymentMode)) ? total_amount : 0;

        await connection.execute(
          'UPDATE cashier_shifts SET ' +
          'total_bills = total_bills + 1, ' +
          'cash_collected = cash_collected + ?, ' +
          'upi_collected = upi_collected + ?, ' +
          'card_collected = card_collected + ?, ' +
          'wallet_collected = wallet_collected + ?, ' +
          'other_collected = other_collected + ?, ' +
          'total_collected = total_collected + ? ' +
          'WHERE id = ? AND restaurant_id = ?',
          [cashAdd, upiAdd, cardAdd, walletAdd, otherAdd, total_amount, activeShiftId, restaurantId]
        );
      }

      await connection.commit();
      return result.affectedRows > 0;
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  static async getHistory(restaurantId, filters = {}) {
    const { 
      cashier_id, 
      order_status, 
      payment_mode,
      date_from, 
      date_to, 
      search, 
      limit, 
      offset 
    } = filters;

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
    if (payment_mode) {
      query += ' AND payment_mode = ?';
      params.push(payment_mode);
    }
    if (date_from) {
      query += ' AND created_at >= ?';
      params.push(date_from);
    }
    if (date_to) {
      query += ' AND created_at <= ?';
      params.push(date_to);
    }

    if (search && search.trim() !== '') {
      const s = `%${search.trim()}%`;
      query += ' AND (unique_order_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ? OR notes LIKE ? OR EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = orders.id AND oi.name LIKE ?))';
      params.push(s, s, s, s, s);
    }

    query += ' ORDER BY id DESC';

    if (limit !== undefined) {
      query += ' LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset || 0));
    }

    const [rows] = await pool.query(query, params);
    return rows;
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

  static async getShiftSummary(restaurantId, shiftId) {
    const [rows] = await pool.execute(
      'SELECT * FROM cashier_shifts WHERE id = ? AND restaurant_id = ?',
      [shiftId, restaurantId]
    );
    return rows[0] || null;
  }
}

module.exports = OrderRepository;
