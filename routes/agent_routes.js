const express = require('express');
const router = express.Router();
const AgentController = require('../controllers/agent_controller');
const { authenticateToken } = require('../middlewares/auth_middleware');

// All agent routes require authenticated token (cashier, admin, or manager)
router.use(authenticateToken);

router.get('/print-jobs/poll', AgentController.getPendingJobs);
router.post('/print-jobs/ack', AgentController.acknowledgeJob);
router.post('/heartbeat', AgentController.sendHeartbeat);

module.exports = router;
