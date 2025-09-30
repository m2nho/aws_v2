const request = require('supertest');
const express = require('express');
const { authenticateToken, requireAdmin, requireApprovedUser } = require('../../middleware/auth');
const { generateToken } = require('../../utils/jwt');

// Express 앱 설정 (테스트용)
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // 테스트 라우트들
  app.get('/protected', authenticateToken, (req, res) => {
    res.json({ success: true, user: req.user });
  });
  
  app.get('/admin-only', authenticateToken, requireAdmin, (req, res) => {
    res.json({ success: true, message: 'Admin access granted' });
  });
  
  app.get('/approved-only', authenticateToken, requireApprovedUser, (req, res) => {
    res.json({ success: true, message: 'Approved user access granted' });
  });
  
  return app;
};

describe('Auth Middleware Tests', () => {
  let app;
  
  beforeEach(() => {
    app = createTestApp();
  });

  describe('authenticateToken middleware', () => {
    test('should reject request without Authorization header', async () => {
      const response = await request(app)
        .get('/protected')
        .expect(401);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_TOKEN');
    });

    test('should reject request with invalid token format', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'InvalidFormat token123')
        .expect(401);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_TOKEN_FORMAT');
    });

    test('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer invalid.token.here')
        .expect(401);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });

    test('should accept request with valid token', async () => {
      const tokenPayload = {
        userId: 'test-user-id',
        username: 'testuser',
        status: 'approved',
        isAdmin: false
      };
      
      const token = generateToken(tokenPayload);
      
      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.user.userId).toBe('test-user-id');
      expect(response.body.user.username).toBe('testuser');
    });
  });

  describe('requireAdmin middleware', () => {
    test('should reject non-admin user', async () => {
      const tokenPayload = {
        userId: 'test-user-id',
        username: 'testuser',
        status: 'approved',
        isAdmin: false
      };
      
      const token = generateToken(tokenPayload);
      
      const response = await request(app)
        .get('/admin-only')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('PERMISSION_DENIED');
    });

    test('should accept admin user', async () => {
      const tokenPayload = {
        userId: 'admin-user-id',
        username: 'admin',
        status: 'approved',
        isAdmin: true
      };
      
      const token = generateToken(tokenPayload);
      
      const response = await request(app)
        .get('/admin-only')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Admin access granted');
    });
  });

  describe('requireApprovedUser middleware', () => {
    test('should reject pending user', async () => {
      const tokenPayload = {
        userId: 'pending-user-id',
        username: 'pendinguser',
        status: 'pending',
        isAdmin: false
      };
      
      const token = generateToken(tokenPayload);
      
      const response = await request(app)
        .get('/approved-only')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('ACCOUNT_STATUS_DENIED');
      expect(response.body.error.message).toBe('Account pending approval');
    });

    test('should reject rejected user', async () => {
      const tokenPayload = {
        userId: 'rejected-user-id',
        username: 'rejecteduser',
        status: 'rejected',
        isAdmin: false
      };
      
      const token = generateToken(tokenPayload);
      
      const response = await request(app)
        .get('/approved-only')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('ACCOUNT_STATUS_DENIED');
      expect(response.body.error.message).toBe('Account access rejected');
    });

    test('should accept approved user', async () => {
      const tokenPayload = {
        userId: 'approved-user-id',
        username: 'approveduser',
        status: 'approved',
        isAdmin: false
      };
      
      const token = generateToken(tokenPayload);
      
      const response = await request(app)
        .get('/approved-only')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Approved user access granted');
    });
  });
});