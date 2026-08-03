const express = require('express');
const router = express.Router();
const AgentController = require('../controllers/agent_controller');
const { authenticateToken } = require('../middlewares/auth_middleware');

/**
 * Device-aware middleware that allows authentication via either:
 * 1. User JWT Bearer Token (req.headers.authorization)
 * 2. Permanent Gateway Device Token (req.headers['x-device-token'])
 */
async function authenticateDeviceOrUser(req, res, next) {
  const deviceToken = req.headers['x-device-token'];
  if (deviceToken) {
    // Authenticating via permanent device token
    return next();
  }
  // Fall back to standard JWT user token verification
  return authenticateToken(req, res, next);
}

// 1-Time Setup: Admin/Manager registers the PC as a permanent Restaurant Print Gateway Device
router.post('/register-device', authenticateToken, AgentController.registerDevice);

// Permanent background polling, ACK, and heartbeat routes (Device-authenticated)
router.get('/print-jobs/poll', authenticateDeviceOrUser, AgentController.getPendingJobs);
router.post('/print-jobs/ack', authenticateDeviceOrUser, AgentController.acknowledgeJob);
router.post('/heartbeat', authenticateDeviceOrUser, AgentController.sendHeartbeat);

module.exports = router;
