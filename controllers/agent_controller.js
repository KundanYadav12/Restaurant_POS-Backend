const { v4: uuidv4 } = require('uuid');
const PrintQueueRepository = require('../repositories/print_queue_repository');
const PrinterRepository = require('../repositories/printer_repository');
const SuperAdminRepository = require('../repositories/superadmin_repository');
const DeviceRepository = require('../repositories/device_repository');

class AgentController {
  /**
   * Register a new permanent Restaurant Print Gateway Device (1-Time Admin Setup)
   */
  static async registerDevice(req, res) {
    try {
      const { device_name } = req.body;
      const restaurantId = req.user.restaurant_id;

      if (!restaurantId) {
        return res.status(400).json({ error: 'User is not associated with a restaurant tenant.' });
      }

      const deviceToken = `dev_${uuidv4().replace(/-/g, '')}`;
      const name = device_name || 'Cashier PC Print Gateway';

      const deviceId = await DeviceRepository.createDevice(restaurantId, name, deviceToken, req.ip);
      const restaurant = await SuperAdminRepository.getRestaurantById(restaurantId);

      return res.json({
        success: true,
        message: 'Print Gateway Device registered successfully.',
        device_id: deviceId,
        device_token: deviceToken,
        device_name: name,
        restaurant_id: restaurantId,
        restaurant_name: restaurant ? restaurant.name : 'Restaurant POS',
        branch_name: restaurant ? (restaurant.branch_name || 'Main Branch') : 'Main Branch'
      });
    } catch (err) {
      console.error('[Register Device Error]', err);
      return res.status(500).json({ error: 'Failed to register print gateway device.' });
    }
  }

  /**
   * Helper to resolve restaurantId from req.user OR X-Device-Token header
   */
  static async resolveRestaurantId(req) {
    if (req.user && req.user.restaurant_id) {
      return req.user.restaurant_id;
    }

    const deviceToken = req.headers['x-device-token'];
    if (deviceToken) {
      const device = await DeviceRepository.findByToken(deviceToken);
      if (device) {
        await DeviceRepository.updateLastSeen(deviceToken, 'online', req.ip);
        req.device = device;
        return device.restaurant_id;
      }
    }
    return null;
  }

  /**
   * Poll pending print jobs for the restaurant outlet
   */
  static async getPendingJobs(req, res) {
    try {
      const restaurantId = await AgentController.resolveRestaurantId(req);
      if (!restaurantId) {
        return res.status(401).json({ error: 'Unauthorized. Invalid device token or user session.' });
      }

      const limit = req.query.limit || 20;
      const jobs = await PrintQueueRepository.getPendingJobsForRestaurant(restaurantId, limit);
      
      const printers = await PrinterRepository.getAll(restaurantId);

      return res.json({
        jobs,
        printers,
        restaurant_name: req.device ? req.device.restaurant_name : (req.user ? req.user.restaurant_name : 'Restaurant POS'),
        server_timestamp: new Date()
      });
    } catch (err) {
      console.error('[Agent Get Pending Jobs Error]', err);
      return res.status(500).json({ error: 'Failed to retrieve pending print jobs.' });
    }
  }

  /**
   * Acknowledge print job completion or failure
   */
  static async acknowledgeJob(req, res) {
    const { job_id, status, error_message } = req.body;
    if (!job_id || !status) {
      return res.status(400).json({ error: 'job_id and status are required.' });
    }

    try {
      const restaurantId = await AgentController.resolveRestaurantId(req);
      if (!restaurantId) {
        return res.status(401).json({ error: 'Unauthorized. Invalid device token or user session.' });
      }

      const success = await PrintQueueRepository.updateJobStatus(job_id, status, error_message);
      if (!success) {
        return res.status(404).json({ error: 'Print job not found.' });
      }

      return res.json({ message: 'Job status updated successfully.', job_id, status });
    } catch (err) {
      console.error('[Agent Acknowledge Job Error]', err);
      return res.status(500).json({ error: 'Failed to acknowledge print job.' });
    }
  }

  /**
   * Receive printer heartbeat report from Local Agent
   */
  static async sendHeartbeat(req, res) {
    const { printer_statuses } = req.body;

    try {
      const restaurantId = await AgentController.resolveRestaurantId(req);
      if (!restaurantId) {
        return res.status(401).json({ error: 'Unauthorized. Invalid device token or user session.' });
      }

      if (printer_statuses && Array.isArray(printer_statuses)) {
        for (const item of printer_statuses) {
          if (item.printer_id && item.status) {
            await PrinterRepository.updateHeartbeat(item.printer_id, restaurantId, item.status);
          }
        }
      }

      return res.json({
        status: 'online',
        message: 'Printer heartbeat updated successfully.',
        timestamp: new Date()
      });
    } catch (err) {
      console.error('[Agent Heartbeat Error]', err);
      return res.status(500).json({ error: 'Failed to process printer heartbeat.' });
    }
  }
}

module.exports = AgentController;
