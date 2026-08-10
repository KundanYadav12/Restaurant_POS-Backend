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

  /**
   * Bulk Delete Menu Items for a specific Tenant
   * Chunks large operations into batches of 200 to ensure fast execution and zero lockups.
   */
  static async bulkDelete(req, res) {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Please select menu items to delete.' });
    }
    if (ids.length > 20) {
      return res.status(400).json({ error: 'Maximum 20 menu items can be deleted at a time.' });
    }

    try {
      const restaurantId = req.user.restaurant_id;
      const CHUNK_SIZE = 200;
      let totalDeleted = 0;

      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE);
        const deletedCount = await MenuRepository.bulkDelete(chunk, restaurantId);
        totalDeleted += deletedCount;
      }

      await SuperAdminRepository.addAuditLog(
        restaurantId,
        req.user.id,
        'MENU_BULK_DELETE',
        `Bulk deleted ${totalDeleted} menu items`,
        req.ip
      );

      return res.json({
        message: `Successfully deleted ${totalDeleted} menu items.`,
        deletedCount: totalDeleted
      });
    } catch (err) {
      console.error('[Bulk Delete Error]', err);
      return res.status(500).json({ error: 'Failed to delete selected menu items.' });
    }
  }

  /**
   * Bulk Update Availability Status for Menu Items
   */
  static async bulkUpdateStatus(req, res) {
    const { ids, is_available } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Please select menu items to update.' });
    }
    if (ids.length > 20) {
      return res.status(400).json({ error: 'Maximum 20 menu items can be updated at a time.' });
    }

    try {
      const restaurantId = req.user.restaurant_id;
      const CHUNK_SIZE = 200;
      let totalUpdated = 0;

      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE);
        const updatedCount = await MenuRepository.bulkUpdateStatus(chunk, restaurantId, Boolean(is_available));
        totalUpdated += updatedCount;
      }

      await SuperAdminRepository.addAuditLog(
        restaurantId,
        req.user.id,
        'MENU_BULK_STATUS',
        `Bulk updated availability for ${totalUpdated} menu items`,
        req.ip
      );

      return res.json({
        message: `Successfully updated ${totalUpdated} menu items.`,
        updatedCount: totalUpdated
      });
    } catch (err) {
      console.error('[Bulk Status Error]', err);
      return res.status(500).json({ error: 'Failed to update selected menu items.' });
    }
  }

  /**
   * Download sample Excel template for bulk menu import
   */
  static async downloadSampleTemplate(req, res) {
    try {
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Menu Import Template');

      sheet.columns = [
        { header: 'Category Name *', key: 'category_name', width: 22 },
        { header: 'Item Name *', key: 'item_name', width: 30 },
        { header: 'Price (Rs.) *', key: 'price', width: 16 },
        { header: 'GST Rate (%)', key: 'gst_rate', width: 15 },
        { header: 'Veg / Non-Veg', key: 'is_veg', width: 16 },
        { header: 'Spicy Level (0-3)', key: 'spicy_level', width: 18 },
        { header: 'Description', key: 'description', width: 35 },
        { header: 'SKU Code', key: 'sku', width: 15 },
        { header: 'Is Available', key: 'is_available', width: 15 }
      ];

      // Format Header Row
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '1E293B' }
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

      // Add Sample Rows
      sheet.addRow({ category_name: 'Starters', item_name: 'Paneer Tikka', price: 240, gst_rate: 5, is_veg: 'Veg', spicy_level: 1, description: 'Char-grilled cottage cheese with spices', sku: 'PTR-01', is_available: 'Yes' });
      sheet.addRow({ category_name: 'Starters', item_name: 'Chicken Wings', price: 280, gst_rate: 5, is_veg: 'Non-Veg', spicy_level: 2, description: 'Crispy fried spicy chicken wings', sku: 'CWG-02', is_available: 'Yes' });
      sheet.addRow({ category_name: 'Main Course', item_name: 'Paneer Butter Masala', price: 290, gst_rate: 5, is_veg: 'Veg', spicy_level: 1, description: 'Rich gravy with fresh paneer cubes', sku: 'PBM-01', is_available: 'Yes' });
      sheet.addRow({ category_name: 'Breads', item_name: 'Butter Naan', price: 45, gst_rate: 5, is_veg: 'Veg', spicy_level: 0, description: 'Clay oven flatbread topped with butter', sku: 'BN-01', is_available: 'Yes' });
      sheet.addRow({ category_name: 'Beverages', item_name: 'Mango Lassi', price: 90, gst_rate: 5, is_veg: 'Veg', spicy_level: 0, description: 'Sweet mango yogurt drink', sku: 'ML-01', is_available: 'Yes' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=menu_import_sample_template.xlsx');

      const buffer = await workbook.xlsx.writeBuffer();
      return res.send(buffer);
    } catch (err) {
      console.error('[Menu Import Template Error]', err);
      return res.status(500).json({ error: 'Failed to generate sample template.' });
    }
  }

  /**
   * Import Menu & Categories from Excel file (.xlsx / .csv)
   */
  static async importExcel(req, res) {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload an Excel (.xlsx, .xls, .csv) file.' });
    }

    try {
      const restaurantId = req.user.restaurant_id;
      const ExcelJS = require('exceljs');
      const fs = require('fs');
      const CategoryRepository = require('../repositories/category_repository');
      const workbook = new ExcelJS.Workbook();

      if (req.file.originalname.endsWith('.csv')) {
        await workbook.csv.readFile(req.file.path);
      } else {
        await workbook.xlsx.readFile(req.file.path);
      }

      const worksheet = workbook.getWorksheet(1);
      if (!worksheet) {
        return res.status(400).json({ error: 'Excel sheet is empty or unreadable.' });
      }

      // 1. Load existing categories
      const existingCategories = await CategoryRepository.getAll(restaurantId);
      const categoryMap = new Map();
      existingCategories.forEach(c => categoryMap.set(c.name.toLowerCase().trim(), c.id));

      // 2. Load existing items
      const existingItems = await MenuRepository.getAll(restaurantId, {});
      const itemMap = new Map();
      existingItems.forEach(i => itemMap.set(`${i.category_id}_${i.name.toLowerCase().trim()}`, i.id));

      let added = 0;
      let updated = 0;
      let skipped = 0;
      let categoriesCreated = 0;
      const errors = [];

      let rowCount = 0;
      worksheet.eachRow((row, rNum) => {
        if (rNum === 1) return; // Skip header row
        rowCount++;

        const getVal = (colIndex) => {
          const val = row.getCell(colIndex).value;
          if (val && typeof val === 'object' && val.text) return String(val.text).trim();
          return String(val || '').trim();
        };

        const catNameRaw = getVal(1);
        const itemNameRaw = getVal(2);
        const priceRaw = row.getCell(3).value;

        if (!catNameRaw || !itemNameRaw || priceRaw === null || priceRaw === undefined) {
          skipped++;
          return;
        }

        const price = parseFloat(priceRaw);
        if (isNaN(price) || price < 0) {
          errors.push(`Row ${rNum}: Invalid price '${priceRaw}' for item '${itemNameRaw}'.`);
          skipped++;
          return;
        }

        const gstRate = parseFloat(row.getCell(4).value || 5);
        const vegRaw = getVal(5).toLowerCase();
        const isVeg = (vegRaw.includes('non') || vegRaw === '0') ? 0 : 1;
        const spicyLevel = parseInt(row.getCell(6).value || 0);
        const description = getVal(7);
        const sku = getVal(8);
        const availRaw = getVal(9).toLowerCase();
        const isAvailable = (availRaw === 'no' || availRaw === '0') ? 0 : 1;

        // Collect rows for sequential processing
        row._processedData = {
          catNameRaw,
          itemNameRaw,
          price,
          gstRate: isNaN(gstRate) ? 5 : gstRate,
          isVeg,
          spicyLevel: isNaN(spicyLevel) ? 0 : spicyLevel,
          description,
          sku,
          isAvailable
        };
      });

      // Synchronous row application loop
      for (let rNum = 2; rNum <= worksheet.rowCount; rNum++) {
        const row = worksheet.getRow(rNum);
        if (!row._processedData) continue;
        const data = row._processedData;

        // Resolve Category ID
        let categoryId = categoryMap.get(data.catNameRaw.toLowerCase());
        if (!categoryId) {
          try {
            categoryId = await CategoryRepository.create(restaurantId, {
              name: data.catNameRaw,
              description: 'Auto-created during menu import',
              seq: categoryMap.size + 1
            });
            categoryMap.set(data.catNameRaw.toLowerCase(), categoryId);
            categoriesCreated++;
          } catch (cErr) {
            errors.push(`Row ${rNum}: Failed to create category '${data.catNameRaw}'.`);
            skipped++;
            continue;
          }
        }

        const itemKey = `${categoryId}_${data.itemNameRaw.toLowerCase()}`;
        const existingItemId = itemMap.get(itemKey);

        const itemData = {
          category_id: categoryId,
          name: data.itemNameRaw,
          price: data.price,
          gst_rate: data.gstRate,
          is_veg: data.isVeg,
          spicy_level: data.spicyLevel,
          description: data.description,
          sku: data.sku,
          is_available: data.isAvailable
        };

        if (existingItemId) {
          await MenuRepository.update(existingItemId, restaurantId, itemData);
          updated++;
        } else {
          const newItemId = await MenuRepository.create(restaurantId, itemData);
          itemMap.set(itemKey, newItemId);
          added++;
        }
      }

      // Cleanup uploaded temp file
      try { fs.unlinkSync(req.file.path); } catch (e) {}

      await SuperAdminRepository.addAuditLog(restaurantId, req.user.id, 'MENU_EXCEL_IMPORT', `Imported menu from Excel: Added ${added}, Updated ${updated}, Categories Created ${categoriesCreated}`, req.ip);

      return res.json({
        success: true,
        summary: {
          totalRows: rowCount,
          added,
          updated,
          categoriesCreated,
          skipped,
          errors
        }
      });
    } catch (err) {
      console.error('[Menu Excel Import Error]', err);
      return res.status(500).json({ error: 'Failed to process Excel import file.' });
    }
  }

  /**
   * Import Menu from Image or Document using AI / OCR
   */
  static async importAiOcr(req, res) {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload a menu image or document file.' });
    }

    const fs = require('fs');
    try {
      const { processMenuFileForAIImport } = require('../utils/menu_ai_ocr_helper');
      const items = await processMenuFileForAIImport(req.file.path, req.file.mimetype || '');

      // Cleanup uploaded temp file
      try { if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch (e) {}

      return res.json({
        success: true,
        extractedItems: items
      });
    } catch (err) {
      console.error('[AI Menu OCR Import Error]', err);
      try { if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(500).json({ error: err.message || 'Failed to extract menu data from image.' });
    }
  }

  /**
   * Bulk Save Confirmed Menu Items
   */
  static async bulkSaveItems(req, res) {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items list is required.' });
    }

    try {
      const restaurantId = req.user.restaurant_id || req.user.restaurantId;
      if (!restaurantId) {
        return res.status(400).json({ error: 'Restaurant ID missing from user session.' });
      }

      const CategoryRepository = require('../repositories/category_repository');

      const existingCategories = await CategoryRepository.getAll(restaurantId);
      const categoryMap = new Map();
      existingCategories.forEach(c => categoryMap.set(c.name.toLowerCase().trim(), c.id));

      const existingItems = await MenuRepository.getAll(restaurantId, {});
      const itemMap = new Map();
      existingItems.forEach(i => itemMap.set(`${i.category_id}_${i.name.toLowerCase().trim()}`, i.id));

      let added = 0;
      let updated = 0;
      let categoriesCreated = 0;

      for (const item of items) {
        const catNameRaw = String(item.category || 'General').trim().slice(0, 250);
        const itemNameRaw = String(item.name || '').trim().slice(0, 250);
        const price = parseFloat(item.price || 0);

        if (!itemNameRaw || isNaN(price) || price < 0) continue;

        let categoryId = categoryMap.get(catNameRaw.toLowerCase());
        if (!categoryId) {
          categoryId = await CategoryRepository.create(restaurantId, {
            name: catNameRaw,
            description: 'Created via AI Menu Import',
            seq: categoryMap.size + 1
          });
          categoryMap.set(catNameRaw.toLowerCase(), categoryId);
          categoriesCreated++;
        }

        const itemKey = `${categoryId}_${itemNameRaw.toLowerCase()}`;
        const existingItemId = itemMap.get(itemKey);

        const itemData = {
          category_id: categoryId,
          name: itemNameRaw,
          price,
          gst_rate: parseFloat(item.gst_rate || 5),
          is_veg: parseInt(item.is_veg !== undefined ? item.is_veg : 1),
          spicy_level: parseInt(item.spicy_level || 0),
          description: String(item.description || '').slice(0, 2000),
          sku: String(item.sku || '').slice(0, 50),
          is_available: parseInt(item.is_available !== undefined ? item.is_available : 1)
        };

        if (existingItemId) {
          await MenuRepository.update(existingItemId, restaurantId, itemData);
          updated++;
        } else {
          const newItemId = await MenuRepository.create(restaurantId, itemData);
          itemMap.set(itemKey, newItemId);
          added++;
        }
      }

      await SuperAdminRepository.addAuditLog(restaurantId, req.user.id, 'MENU_BULK_SAVE', `Saved bulk menu items: Added ${added}, Updated ${updated}, Categories Created ${categoriesCreated}`, req.ip);

      return res.json({
        success: true,
        summary: {
          added,
          updated,
          categoriesCreated
        }
      });
    } catch (err) {
      console.error('[Bulk Save Menu Error]', err);
      return res.status(500).json({ error: err.message || 'Failed to save menu items.' });
    }
  }
}

module.exports = MenuController;
