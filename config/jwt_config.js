require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'fastorder-enterprise-jwt-secret-key-2026';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fastorder-enterprise-refresh-token-secret-key-2026';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '30d';

module.exports = {
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  JWT_EXPIRY,
  JWT_REFRESH_EXPIRY
};
