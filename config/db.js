const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'Kundan@12',
  database: process.env.DB_NAME || 'restaurant_pos',
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0
});

module.exports = pool;
