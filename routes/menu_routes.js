const express = require('express');
const MenuController = require('../controllers/menu_controller');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth_middleware');
const upload = require('../middlewares/upload_middleware');
const router = express.Router();

router.use(authenticateToken);

router.get('/', MenuController.getAll);
router.get('/:id', MenuController.getById);

// Admin/Manager can write menu items, supporting optional image upload
router.post('/', authorizeRoles('admin', 'manager'), upload.single('image'), MenuController.create);
router.put('/:id', authorizeRoles('admin', 'manager'), upload.single('image'), MenuController.update);
router.post('/reorder', authorizeRoles('admin', 'manager'), MenuController.reorder);

// Only Admin can delete menu items
router.delete('/:id', authorizeRoles('admin'), MenuController.delete);

module.exports = router;
