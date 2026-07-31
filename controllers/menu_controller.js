const MenuRepository = require('../repositories/menu_repository');
const SuperAdminRepository = require('../repositories/superadmin_repository');

class MenuController {
  static async getAll(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;
      const filters = {
        category_id: req.query.category_id,
        search: req.query.search,
        is_available: req.query.is_available,
        is_veg: req.query.is_veg,
        limit: req.query.limit,
        offset: req.query.offset
      };
      
      const items = await MenuRepository.getAll(restaurantId, filters);
      return res.json(items);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to fetch menu items.' });
    }
  }

  static async getById(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;
      const item = await MenuRepository.getById(req.params.id, restaurantId);
      if (!item) {
        return res.status(404).json({ error: 'Menu item not found.' });
      }
      return res.json(item);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to fetch menu item.' });
    }
  }

  static async create(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;
      
      // Extract file path if file uploaded
      let image_url = null;
      if (req.file) {
        image_url = `/uploads/${req.file.filename}`;
      } else if (req.body.image_url) {
        image_url = req.body.image_url;
      }

      const itemData = {
        category_id: parseInt(req.body.category_id),
        name: req.body.name,
        sku: req.body.sku,
        barcode: req.body.barcode,
        description: req.body.description,
        price: parseFloat(req.body.price),
        gst_rate: parseFloat(req.body.gst_rate || 5),
        prep_time_minutes: parseInt(req.body.prep_time_minutes || 10),
        is_veg: parseInt(req.body.is_veg !== undefined ? req.body.is_veg : 1),
        spicy_level: parseInt(req.body.spicy_level || 0),
        is_available: parseInt(req.body.is_available !== undefined ? req.body.is_available : 1),
        image_url,
        seq: parseInt(req.body.seq || 0),
        kitchen_category: req.body.kitchen_category || 'Main Kitchen',
        printer_id: req.body.printer_id ? parseInt(req.body.printer_id) : null
      };

      if (!itemData.category_id || !itemData.name || isNaN(itemData.price)) {
        return res.status(400).json({ error: 'Category ID, Item Name, and valid Price are required.' });
      }

      const itemId = await MenuRepository.create(restaurantId, itemData);
      await SuperAdminRepository.addAuditLog(restaurantId, req.user.id, 'MENU_CREATE', `Created menu item: ${itemData.name} (ID: ${itemId})`, req.ip);

      return res.status(201).json({ message: 'Menu item created successfully.', id: itemId });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to create menu item.' });
    }
  }

  static async update(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;
      const itemId = req.params.id;

      // Check if item exists
      const existingItem = await MenuRepository.getById(itemId, restaurantId);
      if (!existingItem) {
        return res.status(404).json({ error: 'Menu item not found or unauthorized.' });
      }

      let image_url = existingItem.image_url;
      if (req.file) {
        image_url = `/uploads/${req.file.filename}`;
      } else if (req.body.image_url !== undefined) {
        image_url = req.body.image_url;
      }

      const itemData = {
        category_id: parseInt(req.body.category_id !== undefined ? req.body.category_id : existingItem.category_id),
        name: req.body.name || existingItem.name,
        sku: req.body.sku !== undefined ? req.body.sku : existingItem.sku,
        barcode: req.body.barcode !== undefined ? req.body.barcode : existingItem.barcode,
        description: req.body.description !== undefined ? req.body.description : existingItem.description,
        price: parseFloat(req.body.price !== undefined ? req.body.price : existingItem.price),
        gst_rate: parseFloat(req.body.gst_rate !== undefined ? req.body.gst_rate : existingItem.gst_rate),
        prep_time_minutes: parseInt(req.body.prep_time_minutes !== undefined ? req.body.prep_time_minutes : existingItem.prep_time_minutes),
        is_veg: parseInt(req.body.is_veg !== undefined ? req.body.is_veg : existingItem.is_veg),
        spicy_level: parseInt(req.body.spicy_level !== undefined ? req.body.spicy_level : existingItem.spicy_level),
        is_available: parseInt(req.body.is_available !== undefined ? req.body.is_available : existingItem.is_available),
        image_url,
        seq: parseInt(req.body.seq !== undefined ? req.body.seq : existingItem.seq),
        kitchen_category: req.body.kitchen_category || existingItem.kitchen_category,
        printer_id: req.body.printer_id !== undefined ? (req.body.printer_id ? parseInt(req.body.printer_id) : null) : existingItem.printer_id
      };

      const success = await MenuRepository.update(itemId, restaurantId, itemData);
      if (!success) {
        return res.status(500).json({ error: 'Failed to update menu item.' });
      }

      await SuperAdminRepository.addAuditLog(restaurantId, req.user.id, 'MENU_UPDATE', `Updated menu item: ${itemData.name} (ID: ${itemId})`, req.ip);
      return res.json({ message: 'Menu item updated successfully.' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to update menu item.' });
    }
  }

  static async delete(req, res) {
    try {
      const restaurantId = req.user.restaurant_id;
      const itemId = req.params.id;

      const success = await MenuRepository.delete(itemId, restaurantId);
      if (!success) {
        return res.status(404).json({ error: 'Menu item not found or unauthorized.' });
      }

      await SuperAdminRepository.addAuditLog(restaurantId, req.user.id, 'MENU_DELETE', `Deleted menu item (ID: ${itemId})`, req.ip);
      return res.json({ message: 'Menu item deleted successfully.' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to delete menu item.' });
    }
  }

  static async reorder(req, res) {
    const { sequences } = req.body;
    if (!Array.isArray(sequences)) {
      return res.status(400).json({ error: 'Sequences array is required.' });
    }

    try {
      const restaurantId = req.user.restaurant_id;
      await MenuRepository.updateSequence(restaurantId, sequences);
      await SuperAdminRepository.addAuditLog(restaurantId, req.user.id, 'MENU_REORDER', `Reordered menu items`, req.ip);
      
      return res.json({ message: 'Menu items sequence updated successfully.' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to reorder menu items.' });
    }
  }
}

module.exports = MenuController;
