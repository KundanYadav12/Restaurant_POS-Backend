const PrinterRepository = require('../repositories/printer_repository');
const SuperAdminRepository = require('../repositories/superadmin_repository');
const net = require('net');

class PrinterController {
  static async getAll(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;
      const printers = await PrinterRepository.getAll(restaurantId);
      return res.json(printers);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to retrieve printers.' });
    }
  }

  static async getById(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;
      const printer = await PrinterRepository.getById(req.params.id, restaurantId);
      if (!printer) {
        return res.status(404).json({ error: 'Printer configuration not found.' });
      }
      return res.json(printer);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to retrieve printer configuration.' });
    }
  }

  static async create(req, res) {
    const { name, type, ip_address, port, paper_width, character_encoding, role, is_default_receipt, is_default_kot, auto_cut, cash_drawer } = req.body;
    if (!name || !ip_address) {
      return res.status(400).json({ error: 'Printer Name and IP Address are required.' });
    }

    try {
      const restaurantId = req.user.restaurant_id;
      const printerId = await PrinterRepository.create(restaurantId, {
        name, type, ip_address, port, paper_width, character_encoding, role, is_default_receipt, is_default_kot, auto_cut, cash_drawer
      });

      await SuperAdminRepository.addAuditLog(restaurantId, req.user.id, 'PRINTER_CREATE', `Added printer: ${name} (${ip_address})`, req.ip);
      return res.status(201).json({ message: 'Printer added successfully.', id: printerId });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to add printer.' });
    }
  }

  static async update(req, res) {
    const { name, type, ip_address, port, paper_width, character_encoding, role, is_default_receipt, is_default_kot, auto_cut, cash_drawer, is_active, status } = req.body;
    if (!name || !ip_address) {
      return res.status(400).json({ error: 'Printer Name and IP Address are required.' });
    }

    try {
      const restaurantId = req.user.restaurant_id;
      const success = await PrinterRepository.update(req.params.id, restaurantId, {
        name, type, ip_address, port, paper_width, character_encoding, role, is_default_receipt, is_default_kot, auto_cut, cash_drawer, is_active, status
      });

      if (!success) {
        return res.status(404).json({ error: 'Printer not found or unauthorized.' });
      }

      await SuperAdminRepository.addAuditLog(restaurantId, req.user.id, 'PRINTER_UPDATE', `Updated printer config: ${name} (ID: ${req.params.id})`, req.ip);
      return res.json({ message: 'Printer updated successfully.' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to update printer.' });
    }
  }

  static async updateStatus(req, res) {
    const { status } = req.body;
    const printerId = req.params.id;
    const restaurantId = req.user.restaurant_id;

    if (!['online', 'offline', 'error'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value.' });
    }

    try {
      const success = await PrinterRepository.updateStatus(printerId, restaurantId, status);
      if (!success) {
        return res.status(404).json({ error: 'Printer not found or unauthorized.' });
      }

      await SuperAdminRepository.addAuditLog(restaurantId, req.user.id, 'PRINTER_STATUS_TOGGLE', `Updated status of printer ID ${printerId} to: ${status}`, req.ip);
      return res.json({ message: `Printer status changed to ${status}.`, status });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to update printer status.' });
    }
  }

  static async delete(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;
      const success = await PrinterRepository.delete(req.params.id, restaurantId);
      if (!success) {
        return res.status(404).json({ error: 'Printer not found or unauthorized.' });
      }

      await SuperAdminRepository.addAuditLog(restaurantId, req.user.id, 'PRINTER_DELETE', `Deleted printer configuration (ID: ${req.params.id})`, req.ip);
      return res.json({ message: 'Printer deleted successfully.' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to delete printer.' });
    }
  }

  /**
   * Test Socket connection to network printer
   */
  static async testConnection(req, res) {
    const { ip_address, port } = req.body;
    if (!ip_address) {
      return res.status(400).json({ error: 'IP Address is required to run connection test.' });
    }

    const testPort = port || 9100;
    const client = new net.Socket();
    client.setTimeout(2000); // 2 second timeout

    client.connect(testPort, ip_address, () => {
      // Send a small ESC/POS command (Initialize + Buzzer or LF)
      client.write('\x1B@\x1BB\x01\x01\nTEST PRINT OK\n\n\n\x1DV\x41\x03', () => {
        client.end();
        return res.json({ status: 'connected', message: 'Successfully connected and sent test byte.' });
      });
    });

    client.on('error', (err) => {
      client.destroy();
      return res.status(502).json({ status: 'failed', error: err.message });
    });

    client.on('timeout', () => {
      client.destroy();
      return res.status(504).json({ status: 'failed', error: 'Connection timed out. Check IP/Port.' });
    });
  }
}

module.exports = PrinterController;
