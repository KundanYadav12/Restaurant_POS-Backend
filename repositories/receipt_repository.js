const pool = require('../config/db');

class ReceiptRepository {
  /**
   * Get receipt & KOT settings for a restaurant.
   * Initializes defaults if no row exists yet.
   */
  static async getByRestaurantId(restaurantId) {
    const [rows] = await pool.query(
      'SELECT * FROM receipt_settings WHERE restaurant_id = ?',
      [restaurantId]
    );

    if (rows.length > 0) {
      return rows[0];
    }

    // Fetch restaurant fallback details
    const [restRows] = await pool.query(
      'SELECT name, address, phone, email, gst_number FROM restaurants WHERE id = ?',
      [restaurantId]
    );

    const rest = restRows[0] || {};

    // Create default receipt settings entry
    const defaultSettings = {
      restaurant_id: restaurantId,
      restaurant_name: rest.name || 'Restaurant POS',
      branch_name: 'Main Branch',
      address: rest.address || '',
      phone: rest.phone || '',
      whatsapp: rest.phone || '',
      email: rest.email || '',
      website: '',
      gst_number: rest.gst_number || '',
      fssai_number: '',
      logo_url: '',
      header_message: 'Welcome to Our Restaurant!',
      footer_message: 'Visit us again soon.',
      thank_you_message: 'Thank You! Visit Again.',
      terms_conditions: 'Goods once sold cannot be returned.',
      paper_size: '80mm',
      font_size: 'normal',
      header_alignment: 'center',
      show_logo: 1,
      show_qr_code: 1,
      show_customer_details: 1,
      show_cashier_name: 1,
      show_tax_details: 1,
      show_payment_details: 1,
      show_footer_notes: 1,
      kot_header: 'KITCHEN ORDER TICKET',
      kitchen_name: 'Main Kitchen',
      kot_footer_note: 'Prepare with priority',
      show_kot_order_notes: 1,
      show_kot_time: 1
    };

    await pool.query(
      `INSERT INTO receipt_settings (
        restaurant_id, restaurant_name, branch_name, address, phone, whatsapp, email, website,
        gst_number, fssai_number, logo_url, header_message, footer_message, thank_you_message,
        terms_conditions, paper_size, font_size, header_alignment, show_logo, show_qr_code,
        show_customer_details, show_cashier_name, show_tax_details, show_payment_details,
        show_footer_notes, kot_header, kitchen_name, kot_footer_note, show_kot_order_notes, show_kot_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        restaurantId, defaultSettings.restaurant_name, defaultSettings.branch_name, defaultSettings.address,
        defaultSettings.phone, defaultSettings.whatsapp, defaultSettings.email, defaultSettings.website,
        defaultSettings.gst_number, defaultSettings.fssai_number, defaultSettings.logo_url, defaultSettings.header_message,
        defaultSettings.footer_message, defaultSettings.thank_you_message, defaultSettings.terms_conditions,
        defaultSettings.paper_size, defaultSettings.font_size, defaultSettings.header_alignment,
        defaultSettings.show_logo, defaultSettings.show_qr_code, defaultSettings.show_customer_details,
        defaultSettings.show_cashier_name, defaultSettings.show_tax_details, defaultSettings.show_payment_details,
        defaultSettings.show_footer_notes, defaultSettings.kot_header, defaultSettings.kitchen_name,
        defaultSettings.kot_footer_note, defaultSettings.show_kot_order_notes, defaultSettings.show_kot_time
      ]
    );

    const [newRows] = await pool.query(
      'SELECT * FROM receipt_settings WHERE restaurant_id = ?',
      [restaurantId]
    );

    return newRows[0];
  }

  /**
   * Save or update receipt settings for a restaurant.
   */
  static async update(restaurantId, data) {
    // Ensure settings exist first
    await this.getByRestaurantId(restaurantId);

    const fields = [
      'restaurant_name', 'branch_name', 'address', 'phone', 'whatsapp', 'email', 'website',
      'gst_number', 'fssai_number', 'logo_url', 'header_message', 'footer_message',
      'thank_you_message', 'terms_conditions', 'paper_size', 'font_size', 'header_alignment',
      'show_logo', 'show_qr_code', 'show_customer_details', 'show_cashier_name',
      'show_tax_details', 'show_payment_details', 'show_footer_notes',
      'kot_header', 'kitchen_name', 'kot_footer_note', 'show_kot_order_notes', 'show_kot_time'
    ];

    const updates = [];
    const values = [];

    fields.forEach(f => {
      if (data[f] !== undefined) {
        updates.push(`${f} = ?`);
        values.push(data[f]);
      }
    });

    if (updates.length === 0) return await this.getByRestaurantId(restaurantId);

    values.push(restaurantId);

    await pool.query(
      `UPDATE receipt_settings SET ${updates.join(', ')} WHERE restaurant_id = ?`,
      values
    );

    return await this.getByRestaurantId(restaurantId);
  }
}

module.exports = ReceiptRepository;
