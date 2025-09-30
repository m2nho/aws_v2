# Authentication Middleware

This directory contains middleware functions for handling JWT token verification and authorization in the AWS User Management System.

## Available Middleware

### `authenticateToken`

Verifies JWT tokens from the Authorization header and extracts user information.

**Usage:**
```javascript
const { authenticateToken } = require('../middleware/auth');

router.get('/protected-route', authenticateToken, (req, res) => {
  // req.user contains: { userId, username, status, isAdmin }
  res.json({ user: req.user });
});
```

**Headers Required:**
- `Authorization: Bearer <jwt-token>`

**Sets `req.user` with:**
- `userId`: User's unique identifier
- `username`: User's username
- `status`: User's approval status (pending, approved, rejected)
- `isAdmin`: Boolean indicating admin privileges

### `requireAdmin`

Ensures the authenticated user has admin privileges. Must be used after `authenticateToken`.

**Usage:**
```javascript
const { authenticateToken, requireAdmin } = require('../middleware/auth');

router.get('/admin-only', authenticateToken, requireAdmin, (req, res) => {
  // Only admin users can access this route
  res.json({ message: 'Admin access granted' });
});
```

### `requireApprovedUser`

Ensures the authenticated user has 'approved' status. Must be used after `authenticateToken`.

**Usage:**
```javascript
const { authenticateToken, requireApprovedUser } = require('../middleware/auth');

router.get('/approved-only', authenticateToken, requireApprovedUser, (req, res) => {
  // Only approved users can access this route
  res.json({ message: 'Approved user access granted' });
});
```

## Error Responses

All middleware functions return standardized error responses:

### Authentication Errors (401)
- `MISSING_TOKEN`: No Authorization header provided
- `INVALID_TOKEN_FORMAT`: Token not in Bearer format
- `INVALID_TOKEN`: Token signature verification failed
- `TOKEN_EXPIRED`: Token has expired
- `INVALID_TOKEN_PAYLOAD`: Token missing required fields

### Authorization Errors (403)
- `PERMISSION_DENIED`: Admin privileges required
- `ACCOUNT_STATUS_DENIED`: User status doesn't allow access

## Example Route Implementation

```javascript
const express = require('express');
const { authenticateToken, requireAdmin, requireApprovedUser } = require('../middleware/auth');

const router = express.Router();

// Public route - no authentication required
router.get('/public', (req, res) => {
  res.json({ message: 'Public access' });
});

// Protected route - authentication required
router.get('/profile', authenticateToken, (req, res) => {
  res.json({ 
    message: 'Authenticated user access',
    user: req.user 
  });
});

// Approved users only
router.get('/dashboard', authenticateToken, requireApprovedUser, (req, res) => {
  res.json({ 
    message: 'Approved user access',
    user: req.user 
  });
});

// Admin only
router.get('/admin', authenticateToken, requireAdmin, (req, res) => {
  res.json({ 
    message: 'Admin access',
    user: req.user 
  });
});

module.exports = router;
```

## Testing

The middleware includes comprehensive tests in:
- `tests/middleware/auth.test.js` - Unit tests for individual middleware functions
- `tests/integration/auth-routes.test.js` - Integration tests with actual routes

Run tests with:
```bash
npm test -- --testPathPattern=auth
```