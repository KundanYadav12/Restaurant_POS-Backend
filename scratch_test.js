const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = require('./config/db');

async function testConnection() {
  try {
    console.log('Testing MySQL Connection...');
    const [dbRows] = await pool.query('SELECT 1 + 1 AS solution');
    console.log('DB Connection OK:', dbRows);

    try {
      const [themeRows] = await pool.query('SELECT * FROM global_theme_settings ORDER BY id ASC LIMIT 1');
      console.log('global_theme_settings rows:', themeRows);
    } catch (tErr) {
      console.error('global_theme_settings table query error:', tErr.message);
    }

    try {
      const [userRows] = await pool.query('SELECT id, username, role FROM users LIMIT 5');
      console.log('users rows:', userRows);
    } catch (uErr) {
      console.error('users table query error:', uErr.message);
    }
  } catch (err) {
    console.error('Database connection failed:', err);
  } finally {
    process.exit(0);
  }
}

testConnection();
