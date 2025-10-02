const express = require('express');
const authRoutes = require('./auth');
const userRoutes = require('./users');
const adminRoutes = require('./admin');
const inspectionRoutes = require('./inspections');

const router = express.Router();

// Auth routes
router.use('/auth', authRoutes);

// User routes (requires authentication)
router.use('/users', userRoutes);

// Admin routes (requires admin privileges)
router.use('/admin', adminRoutes);

// Inspection routes (requires authentication)
router.use('/inspections', inspectionRoutes);

// Health check for API
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is healthy',
    timestamp: new Date().toISOString(),
    services: {
      cognito: 'available',
      dynamodb: 'available'
    }
  });
});

module.exports = router;