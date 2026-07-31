const OrderRepository = require('../repositories/order_repository');
const PrinterRepository = require('../repositories/printer_repository');
const SuperAdminRepository = require('../repositories/superadmin_repository');
const PrinterService = require('../services/printer_service');

class OrderController {
  static async create(req, res) {
    if (req.user.role !== 'cashier') {
      return res.status(403).json({
        error: 'FORBIDDEN_ROLE',
        message: 'Active Ticket checkout and order placement is restricted exclusively to Cashier accounts.'
      });
    }

    const { items, payment_mode, payment_details, subtotal, tax_amount, discount_amount, total_amount, table_number_or_takeaway, notes } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Order must contain at least one item.' });
    }

    if (!payment_mode) {
      return res.status(400).json({ error: 'Payment mode is required.' });
    }

    try {
      const restaurantId = req.user.restaurant_id;
      const cashierId = req.user.id;
      const cashierName = req.user.name;
      const shiftId = req.user.shift_id; // Added by login auth token

      if (!shiftId && req.user.role === 'cashier') {
        return res.status(400).json({ error: 'No active shift found. Please log in again to open a shift.' });
      }

      // Consolidate order insert parameters
      const orderData = {
        cashier_id: cashierId,
        cashier_name: cashierName,
        subtotal: parseFloat(subtotal),
        tax_amount: parseFloat(tax_amount),
        discount_amount: parseFloat(discount_amount || 0),
        total_amount: parseFloat(total_amount),
        payment_mode,
        payment_details,
        cashier_shift_id: shiftId || 1, // Fallback for managers/admins placing orders
        table_number_or_takeaway: table_number_or_takeaway || 'Takeaway',
        notes
      };

      // Transactional save to DB
      const result = await OrderRepository.create(restaurantId, orderData, items);
      const createdOrder = result.order;
      const createdItems = result.items;

      await SuperAdminRepository.addAuditLog(restaurantId, cashierId, 'ORDER_PLACE', `Placed order #${createdOrder.unique_order_number} for Rs. ${createdOrder.total_amount}`, req.ip);

      // Enqueue print jobs to database print_queue (Dynamic in-memory processing)
      PrinterService.enqueueOrderPrintJobs(restaurantId, createdOrder.id);

      // Return immediately
      return res.status(201).json({
        message: 'Order placed successfully.',
        orderNumber: createdOrder.unique_order_number,
        orderId: createdOrder.id
      });
    } catch (err) {
      console.error('Order creation error:', err);
      return res.status(500).json({ error: 'Failed to process order. Please try again.' });
    }
  }

  static async getAll(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;
      const filters = {
        cashier_id: req.query.cashier_id,
        order_status: req.query.order_status,
        date_from: req.query.date_from,
        date_to: req.query.date_to,
        limit: req.query.limit,
        offset: req.query.offset
      };

      const orders = await OrderRepository.getAll(restaurantId, filters);
      return res.json(orders);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to retrieve orders.' });
    }
  }

  static async getById(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;
      const order = await OrderRepository.getById(req.params.id, restaurantId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found.' });
      }
      return res.json(order);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to retrieve order details.' });
    }
  }

  static async updateStatus(req, res) {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ error: 'Status is required.' });
    }

    try {
      const restaurantId = req.user.restaurant_id;
      const success = await OrderRepository.updateOrderStatus(req.params.id, restaurantId, status);
      if (!success) {
        return res.status(404).json({ error: 'Order not found or unauthorized.' });
      }

      await SuperAdminRepository.addAuditLog(restaurantId, req.user.id, 'ORDER_STATUS_UPDATE', `Updated order (ID: ${req.params.id}) status to: ${status}`, req.ip);
      return res.json({ message: 'Order status updated successfully.' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to update order status.' });
    }
  }

  static async updateKitchenStatus(req, res) {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ error: 'Kitchen status is required.' });
    }

    try {
      const restaurantId = req.user.restaurant_id;
      const success = await OrderRepository.updateKitchenStatus(req.params.id, restaurantId, status);
      if (!success) {
        return res.status(404).json({ error: 'Order not found.' });
      }
      return res.json({ message: 'Kitchen status updated successfully.' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to update kitchen status.' });
    }
  }

  static async reprint(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;
      const orderData = await OrderRepository.getById(req.params.id, restaurantId);
      if (!orderData) {
        return res.status(404).json({ error: 'Order not found.' });
      }

      // Increment count
      await OrderRepository.incrementReprintCount(req.params.id, restaurantId);

      // Trigger dynamic in-memory reprint queue job
      await PrinterService.reprintOrder(restaurantId, orderId);
      await SuperAdminRepository.addAuditLog(restaurantId, req.user.id, 'ORDER_REPRINT', `Reprinted order receipt #${orderData.order.unique_order_number}`, req.ip);

      return res.json({
        message: 'Reprint job enqueued successfully.',
        orderNumber: orderData.order.unique_order_number
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to process reprint.' });
    }
  }
}

module.exports = OrderController;
