require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth_routes');
const categoryRoutes = require('./routes/category_routes');
const menuRoutes = require('./routes/menu_routes');
const orderRoutes = require('./routes/order_routes');
const printerRoutes = require('./routes/printer_routes');
const reportRoutes = require('./routes/report_routes');
const superAdminRoutes = require('./routes/superadmin_routes');
const receiptRoutes = require('./routes/receipt_routes');

const app = express();
const PORT = process.env.PORT || 5000;

// Security Middlewares
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate Limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per window
  message: { error: 'Too many requests from this IP, please try again after 15 minutes' }
});
app.use('/api/', limiter);

// Serve uploads directory static files
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Serve virtual printers directory static files
const virtualPrintersDir = process.env.MOCK_PRINTER_PATH || path.join(__dirname, 'virtual_printers');
if (!fs.existsSync(virtualPrintersDir)) {
  fs.mkdirSync(virtualPrintersDir, { recursive: true });
}
app.use('/virtual_printers', express.static(virtualPrintersDir));

// API Route Bindings
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/printers', printerRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/superadmin', superAdminRoutes);
app.use('/api/settings/receipt', receiptRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date(),
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[Global Error Middleware]', err);
  const status = err.status || 500;
  return res.status(status).json({
    error: err.message || 'An unexpected error occurred on the server.'
  });
});

const runMigrations = require('./migrations/runner');

// Start Server
app.listen(PORT, async () => {
  try {
    await runMigrations();
  } catch (err) {
    console.error('[Migration Startup Error]', err.message);
  }
  console.log(`==================================================`);
  console.log(`   Restaurant SaaS POS Backend API Running`);
  console.log(`   URL: http://localhost:${PORT}`);
  console.log(`==================================================`);
});
