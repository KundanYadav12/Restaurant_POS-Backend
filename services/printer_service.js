const net = require('net');
const PrinterRepository = require('../repositories/printer_repository');
const PrintQueueRepository = require('../repositories/print_queue_repository');
const OrderRepository = require('../repositories/order_repository');
const SuperAdminRepository = require('../repositories/superadmin_repository');
const ReceiptRepository = require('../repositories/receipt_repository');
const DeviceRepository = require('../repositories/device_repository');

// Low-level ESC/POS Commands
const ESC = '\x1B';
const GS = '\x1D';
const CMD_INIT = ESC + '@';
const CMD_ALIGN_LEFT = ESC + 'a\x00';
const CMD_ALIGN_CENTER = ESC + 'a\x01';
const CMD_ALIGN_RIGHT = ESC + 'a\x02';
const CMD_FONT_NORMAL = GS + '!\x00';
const CMD_FONT_DOUBLE = GS + '!\x11';
const CMD_BOLD_ON = ESC + 'E\x01';
const CMD_BOLD_OFF = ESC + 'E\x00';
const CMD_CUT = GS + 'V\x41\x03'; // Auto paper cut
const CMD_CASH_DRAWER = ESC + 'p\x00\x19\xFA'; // Cash drawer kick pulse

class PrinterService {
  /**
   * Sends a raw in-memory Buffer payload directly to a network thermal printer TCP socket
   */
  static sendToPrinterSocket(ip, port, buffer) {
    return new Promise((resolve, reject) => {
      const isMock = !ip || ip === '127.0.0.1' || ip.startsWith('192.168.99') || ip === 'localhost';

      if (isMock) {
        // Development / Mock Virtual Printer Mode (In-memory execution, no physical socket & NO disk text files created)
        console.log(`[Dynamic Printer Engine - In-Memory Execution] Simulated socket print stream to ${ip || 'virtual'}:${port || 9100} (${buffer.length} bytes memory payload)`);
        return resolve({ success: true, method: 'virtual_in_memory' });
      }

      const client = new net.Socket();
      client.setTimeout(3000); // 3 second connection timeout

      client.connect(port || 9100, ip, () => {
        client.write(buffer, () => {
          client.end();
          resolve({ success: true, method: 'tcp_socket' });
        });
      });

      client.on('error', (err) => {
        client.destroy();
        reject(err);
      });

      client.on('timeout', () => {
        client.destroy();
        reject(new Error(`TCP Socket timeout connecting to printer at ${ip}:${port}`));
      });
    });
  }
  /**
   * Format line width dynamically according to printer paper width (58mm = 32 cols, 80mm = 48 cols)
   */
  static getWidthCols(paperWidth) {
    return paperWidth === '58' || paperWidth === 58 ? 32 : 48;
  }

  /**
   * Build dynamic in-memory ESC/POS payload for Order Receipt
   */
  static buildReceiptPayload(order, items, restaurant, printer, receiptSettings = null) {
    const s = receiptSettings || {};
    const paperWidth = s.paper_size === '58mm' ? '58' : (printer ? printer.paper_width : '80');
    const cols = this.getWidthCols(paperWidth);
    const divider = '-'.repeat(cols) + '\n';
    const doubleDivider = '='.repeat(cols) + '\n';

    let cmds = '';
    cmds += CMD_INIT;
    
    // Align header
    const alignCmd = s.header_alignment === 'left' ? CMD_ALIGN_LEFT : (s.header_alignment === 'right' ? CMD_ALIGN_RIGHT : CMD_ALIGN_CENTER);
    cmds += alignCmd;

    const restName = s.restaurant_name || restaurant.name || 'RESTAURANT POS';
    cmds += CMD_BOLD_ON + CMD_FONT_DOUBLE + restName.toUpperCase() + '\n' + CMD_FONT_NORMAL + CMD_BOLD_OFF;

    if (s.branch_name) cmds += `${s.branch_name}\n`;
    const addr = s.address !== undefined ? s.address : restaurant.address;
    if (addr) cmds += addr + '\n';
    
    const phone = s.phone !== undefined ? s.phone : restaurant.phone;
    if (phone) cmds += 'Ph: ' + phone + '\n';
    if (s.whatsapp) cmds += 'WA: ' + s.whatsapp + '\n';
    if (s.email) cmds += 'Email: ' + s.email + '\n';
    if (s.website) cmds += 'Web: ' + s.website + '\n';

    const gst = s.gst_number !== undefined ? s.gst_number : restaurant.gst_number;
    if (gst) cmds += 'GSTIN: ' + gst + '\n';
    if (s.fssai_number) cmds += 'FSSAI Lic No: ' + s.fssai_number + '\n';

    if (s.header_message) cmds += `\n* ${s.header_message} *\n`;
    cmds += doubleDivider;

    // Order Metadata
    cmds += CMD_ALIGN_LEFT;
    cmds += `Bill No : #${order.unique_order_number}\n`;
    if (s.show_cashier_name !== 0) {
      cmds += `Cashier : ${order.cashier_name || 'Staff'}\n`;
    }
    cmds += `Date    : ${new Date(order.created_at || Date.now()).toLocaleString()}\n`;
    
    if (s.show_payment_details !== 0) {
      cmds += `Payment : ${order.payment_mode ? order.payment_mode.toUpperCase() : 'CASH'} | ${order.table_number_or_takeaway || 'Takeaway'}\n`;
    }

    if (s.show_customer_details !== 0 && order.notes) {
      cmds += `Customer: ${order.notes}\n`;
    }

    if (order.reprint_count && order.reprint_count > 0) {
      cmds += CMD_BOLD_ON + `*** REPRINT (${order.reprint_count}) ***\n` + CMD_BOLD_OFF;
    }
    cmds += divider;

    // Items List
    if (cols === 32) {
      cmds += `Item Name            Qty   Price\n`;
      cmds += divider;
      items.forEach(item => {
        const itemLine = `${item.name.substring(0, 18).padEnd(18, ' ')} ${item.quantity.toString().padStart(3, ' ')} ${parseFloat(item.price * item.quantity).toFixed(2).padStart(8, ' ')}\n`;
        cmds += itemLine;
        if (item.notes) cmds += `  * ${item.notes}\n`;
      });
    } else {
      cmds += `Item Name                  Qty     Price      Total\n`;
      cmds += divider;
      items.forEach(item => {
        const name = item.name.substring(0, 22).padEnd(22, ' ');
        const qty = item.quantity.toString().padStart(5, ' ');
        const price = parseFloat(item.price).toFixed(2).padStart(9, ' ');
        const total = (item.quantity * item.price).toFixed(2).padStart(10, ' ');
        cmds += `${name} ${qty} ${price} ${total}\n`;
        if (item.notes) cmds += `  * Notes: ${item.notes}\n`;
      });
    }

    cmds += divider;

    // Financial Totals
    const labelWidth = cols - 12;
    const subtotalVal = isNaN(parseFloat(order.subtotal)) ? 0 : parseFloat(order.subtotal);
    const discountVal = isNaN(parseFloat(order.discount_amount)) ? 0 : parseFloat(order.discount_amount);
    const taxVal = isNaN(parseFloat(order.tax_amount)) ? 0 : parseFloat(order.tax_amount);
    const totalVal = isNaN(parseFloat(order.total_amount)) ? 0 : parseFloat(order.total_amount);

    cmds += `Subtotal:`.padEnd(labelWidth, ' ') + `Rs. ${subtotalVal.toFixed(2).padStart(8, ' ')}\n`;
    if (discountVal > 0) {
      cmds += `Discount:`.padEnd(labelWidth, ' ') + `-Rs.${discountVal.toFixed(2).padStart(8, ' ')}\n`;
    }
    
    if (s.show_tax_details !== 0) {
      cmds += `GST Tax:`.padEnd(labelWidth, ' ') + `Rs. ${taxVal.toFixed(2).padStart(8, ' ')}\n`;
    }

    cmds += divider;
    cmds += CMD_BOLD_ON + CMD_FONT_DOUBLE + `TOTAL:`.padEnd(cols - 14, ' ') + `Rs. ${totalVal.toFixed(2)}` + '\n' + CMD_FONT_NORMAL + CMD_BOLD_OFF;
    cmds += doubleDivider;

    // Footer
    cmds += CMD_ALIGN_CENTER;
    const thankYou = s.thank_you_message || 'Thank You! Visit Again.';
    cmds += thankYou + '\n';
    if (s.footer_message) cmds += `${s.footer_message}\n`;
    if (s.terms_conditions) cmds += `T&C: ${s.terms_conditions}\n`;
    cmds += '\n\n';

    // Auto Cut & Cash Drawer Kick
    if (!printer || printer.auto_cut !== 0) {
      cmds += CMD_CUT;
    }
    if (printer && printer.cash_drawer === 1 && (order.payment_mode === 'cash' || order.payment_mode === 'CASH')) {
      cmds += CMD_CASH_DRAWER;
    }

    return Buffer.from(cmds, printer && printer.character_encoding === 'PC437' ? 'ascii' : 'utf-8');
  }

  /**
   * Build dynamic in-memory ESC/POS payload for Kitchen Order Ticket (KOT)
   * Note: KOT never displays prices or payment information.
   */
  static buildKOTPayload(order, items, printer, kotSettings = null) {
    const s = kotSettings || {};
    const paperWidth = s.paper_size === '58mm' ? '58' : (printer ? printer.paper_width : '80');
    const cols = this.getWidthCols(paperWidth);
    const divider = '-'.repeat(cols) + '\n';
    const doubleDivider = '='.repeat(cols) + '\n';

    let cmds = '';
    cmds += CMD_INIT;
    
    // Header
    const kotTitle = s.kot_header || 'KITCHEN ORDER TICKET';
    cmds += CMD_ALIGN_CENTER + CMD_BOLD_ON + CMD_FONT_DOUBLE + kotTitle.toUpperCase() + '\n' + CMD_FONT_NORMAL + CMD_BOLD_OFF;
    if (s.kitchen_name) cmds += `[ ${s.kitchen_name.toUpperCase()} ]\n`;
    cmds += `Order #${order.unique_order_number} | ${order.table_number_or_takeaway || 'Takeaway'}\n`;
    
    if (s.show_kot_time !== 0) {
      cmds += `Time: ${new Date(order.created_at || Date.now()).toLocaleTimeString()}\n`;
    }
    cmds += doubleDivider;

    // Items
    cmds += CMD_ALIGN_LEFT + CMD_BOLD_ON;
    items.forEach(item => {
      cmds += `${item.quantity} x ${item.name.toUpperCase()}\n`;
      if (item.notes) {
        cmds += `   >>> NOTE: ${item.notes.toUpperCase()}\n`;
      }
    });
    cmds += CMD_BOLD_OFF + divider;

    if (s.show_kot_order_notes !== 0 && order.notes) {
      cmds += CMD_BOLD_ON + `ORDER NOTE: ${order.notes.toUpperCase()}\n` + CMD_BOLD_OFF + divider;
    }

    const kotNote = s.kot_footer_note || 'Prepare with priority';
    cmds += CMD_ALIGN_CENTER + `* ${kotNote} *\n`;
    cmds += `[ KOT END ]\n\n\n`;

    if (!printer || printer.auto_cut !== 0) {
      cmds += CMD_CUT;
    }

    return Buffer.from(cmds, 'utf-8');
  }

  static async enqueueOrderPrintJobs(restaurantId, orderId, printActions = null) {
    try {
      let finalActions = [];

      if (Array.isArray(printActions)) {
        finalActions = printActions;
      } else {
        // Resolve print settings configuration
        const settings = await ReceiptRepository.getByRestaurantId(restaurantId);
        
        // Find order status to see which stage we are at (Stage 1 = pending/confirmed, Stage 2 = completed)
        const orderRes = await OrderRepository.getById(orderId, restaurantId);
        const status = orderRes?.order?.order_status || 'completed';

        const stageMode = (status === 'completed') ? settings.print_stage2_mode : settings.print_stage1_mode;
        
        if (stageMode === 'print_kot_only') {
          finalActions = ['KOT'];
        } else if (stageMode === 'print_receipt_only') {
          finalActions = ['RECEIPT'];
        } else if (stageMode === 'print_kot_receipt') {
          finalActions = ['KOT', 'RECEIPT'];
        } else {
          finalActions = []; // save_only or show_popup (and no explicit override was passed)
        }
      }

      // Fetch order details for payload generation
      const orderRes = await OrderRepository.getById(orderId, restaurantId);
      const order = orderRes ? (orderRes.order || orderRes) : null;
      const items = orderRes && orderRes.items ? orderRes.items : (await OrderRepository.getOrderItems(orderId));
      const restaurant = await SuperAdminRepository.getRestaurantById(restaurantId);
      const receiptSettings = await ReceiptRepository.getByRestaurantId(restaurantId);

      if (finalActions.includes('RECEIPT') && order && restaurant) {
        const receiptPrinter = await PrinterRepository.getDefaultReceiptPrinter(restaurantId);
        const receiptBuffer = this.buildReceiptPayload(order, items, restaurant, receiptPrinter, receiptSettings);
        
        await PrintQueueRepository.enqueue({
          restaurant_id: restaurantId,
          order_id: orderId,
          printer_id: receiptPrinter ? receiptPrinter.id : null,
          print_type: 'RECEIPT',
          payload_base64: receiptBuffer ? receiptBuffer.toString('base64') : null
        });
      }

      if (finalActions.includes('KOT') && order && restaurant) {
        const kotPrinter = await PrinterRepository.getDefaultKOTPrinter(restaurantId);
        const kotBuffer = this.buildKOTPayload(order, items, kotPrinter, receiptSettings);

        await PrintQueueRepository.enqueue({
          restaurant_id: restaurantId,
          order_id: orderId,
          printer_id: kotPrinter ? kotPrinter.id : null,
          print_type: 'KOT',
          payload_base64: kotBuffer ? kotBuffer.toString('base64') : null
        });
      }

      console.log(`[Printer Engine] Print job enqueued for local gateway agent (Order #${order?.unique_order_number || orderId})`);
    } catch (err) {
      console.error('[Printer Queue Enqueue Error]', err);
    }
  }

  /**
   * Continuous Database Print Queue Processor (Zero File System Overhead)
   */
  static async processPendingQueue() {
    try {
      const pendingJobs = await PrintQueueRepository.getPendingJobs(10);
      if (!pendingJobs || pendingJobs.length === 0) return;

      for (const job of pendingJobs) {
        // Prevent cloud backend from socket printing when Desktop Print Gateway is active for the outlet
        const hasGateway = await DeviceRepository.hasActiveGatewayDevice(job.restaurant_id);
        if (hasGateway) {
          // Job is reserved for Desktop Print Gateway polling via /api/agent/poll-jobs
          continue;
        }

        // Only attempt direct socket printing if IP is non-private or virtual mock
        const targetIp = job.ip_address || '';
        const isPrivateLanIp = targetIp.startsWith('192.168.') || targetIp.startsWith('10.') || targetIp.startsWith('172.');
        if (process.env.NODE_ENV === 'production' && isPrivateLanIp) {
          // Cloud backend cannot reach local LAN IP directly; leave in queue for gateway
          continue;
        }

        await PrintQueueRepository.updateJobStatus(job.id, 'PRINTING');

        try {
          const orderRes = await OrderRepository.getById(job.order_id, job.restaurant_id);
          const order = orderRes ? (orderRes.order || orderRes) : null;
          const items = orderRes && orderRes.items ? orderRes.items : (await OrderRepository.getOrderItems(job.order_id));
          const restaurant = await SuperAdminRepository.getRestaurantById(job.restaurant_id);
          const receiptSettings = await ReceiptRepository.getByRestaurantId(job.restaurant_id);

          if (!order || !restaurant) {
            await PrintQueueRepository.updateJobStatus(job.id, 'FAILED', 'Order or Restaurant data not found in DB.');
            continue;
          }

          // Build in-memory Buffer payload
          let bufferPayload;
          if (job.print_type === 'KOT') {
            bufferPayload = this.buildKOTPayload(order, items, job, receiptSettings);
          } else {
            bufferPayload = this.buildReceiptPayload(order, items, restaurant, job, receiptSettings);
          }

          // Send to printer TCP socket or virtual socket emulator
          await this.sendToPrinterSocket(job.ip_address || '127.0.0.1', job.port || 9100, bufferPayload);
          
          await PrintQueueRepository.updateJobStatus(job.id, 'SUCCESS');
        } catch (jobErr) {
          console.error(`[Print Job ${job.id} Error]`, jobErr.message);
          if ((job.retry_count || 0) >= 2) {
            await PrintQueueRepository.updateJobStatus(job.id, 'FAILED', jobErr.message);
          } else {
            await PrintQueueRepository.incrementRetry(job.id, jobErr.message);
          }
        }
      }
    } catch (err) {
      console.error('[Process Pending Queue Error]', err);
    }
  }

  /**
   * Dynamic In-Memory Order Reprint
   */
  static async reprintOrder(restaurantId, orderId, printType = 'RECEIPT') {
    await OrderRepository.incrementReprintCount(orderId, restaurantId);
    await this.enqueueOrderPrintJobs(restaurantId, orderId, [printType]);
    return { message: 'Reprint job enqueued successfully.' };
  }
}

// Start continuous background print queue poller (every 4 seconds)
setInterval(() => {
  PrinterService.processPendingQueue();
}, 4000);

module.exports = PrinterService;
