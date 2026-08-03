const PrintQueueRepository = require('../repositories/print_queue_repository');
const PrinterRepository = require('../repositories/printer_repository');
const SuperAdminRepository = require('../repositories/superadmin_repository');

class AgentController {
  /**
   * Poll pending print jobs for the restaurant outlet
   */
  static async getPendingJobs(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;
      const limit = req.query.limit || 20;

      const jobs = await PrintQueueRepository.getPendingJobsForRestaurant(restaurantId, limit);
      return res.json(jobs);
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
    const restaurantId = req.user.restaurant_id;

    if (!printer_statuses || !Array.isArray(printer_statuses)) {
      return res.status(400).json({ error: 'printer_statuses array is required.' });
    }

    try {
      for (const item of printer_statuses) {
        if (item.printer_id && item.status) {
          await PrinterRepository.updateHeartbeat(item.printer_id, restaurantId, item.status);
        }
      }

      return res.json({ message: 'Printer heartbeat updated successfully.', timestamp: new Date() });
    } catch (err) {
      console.error('[Agent Heartbeat Error]', err);
      return res.status(500).json({ error: 'Failed to process printer heartbeat.' });
    }
  }
}

module.exports = AgentController;
