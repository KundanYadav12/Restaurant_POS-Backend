const express = require('express');
const router = express.Router();
const SyncController = require('../controllers/sync_controller');
const { verifyToken } = require('../middlewares/auth');

router.use(verifyToken);

router.post('/upward', SyncController.ingestUpwardSync);
router.get('/downward', SyncController.serveDownwardSync);

module.exports = router;
