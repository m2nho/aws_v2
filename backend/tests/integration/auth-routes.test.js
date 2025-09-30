const request = require('supertest');
const express = require('express');
const { generateToken } = require('../../utils/jwt');
const userRoutes = require('../../routes/users');
const adminRoutes = require('../../routes/admin');
const dynamoService = require('../../services/dynamoService');
const { v4: uuidv4 } = require('uuid');

// Express 앱 설정 (테스트용)
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // 테스트 라우트 등록
  app.use('/api/users', userRoutes);
  app.use('/api/admin', adminRoutes);
  
  return app;
};

describe('Auth Middleware Integration Tests', () => {
  let app;
  let testUsers = [];
  
  beforeEach(() => {
    app = createTestApp();
  });

  // 테스트 후 생성된 사용자들 정리
  afterAll(async () => {
    for (const userId of testUsers) {
      try {
        await dynamoService.deleteUser(userId);
      } catch (error) {
        console.log(`Failed to cleanup test user ${userId}:`, error.message);
      }
    }
  });

  describe('User Routes with Auth Middleware', () => {
    test('GET /api/users/profile should require authentication', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .expect(401);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_TOKEN');
    });

    test('GET /api/users/profile should work with valid token', async () => {
      // 실제 테스트 사용자 생성
      const testUserData = {
        username: `test-user-${uuidv4()}@example.com`,
        companyName: 'Test Company',
        roleArn: 'arn:aws:iam::123456789012:role/TestRole'
      };
      
      const createResult = await dynamoService.createUser(testUserData);
      expect(createResult.success).toBe(true);
      
      const userId = createResult.userId;
      testUsers.push(userId); // 정리를 위해 추가
      
      // 사용자를 approved 상태로 변경
      await dynamoService.updateUserStatus(userId, 'approved');
      
      const tokenPayload = {
        userId: userId,
        username: testUserData.username,
        status: 'approved',
        isAdmin: false
      };
      
      const token = generateToken(tokenPayload);
      
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.userId).toBe(userId);
      expect(response.body.data.username).toBe(testUserData.username);
      expect(response.body.data.companyName).toBe(testUserData.companyName);
      expect(response.body.data.status).toBe('approved');
    });

    test('GET /api/users/dashboard should require approved user', async () => {
      const tokenPayload = {
        userId: 'pending-user-id',
        username: 'pendinguser',
        status: 'pending',
        isAdmin: false
      };
      
      const token = generateToken(tokenPayload);
      
      const response = await request(app)
        .get('/api/users/dashboard')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('ACCOUNT_STATUS_DENIED');
    });

    test('GET /api/users/dashboard should work for approved user', async () => {
      const tokenPayload = {
        userId: 'approved-user-id',
        username: 'approveduser',
        status: 'approved',
        isAdmin: false
      };
      
      const token = generateToken(tokenPayload);
      
      const response = await request(app)
        .get('/api/users/dashboard')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.username).toBe('approveduser');
    });
  });

  describe('Admin Routes with Auth Middleware', () => {
    test('GET /api/admin/users should require admin privileges', async () => {
      const tokenPayload = {
        userId: 'regular-user-id',
        username: 'regularuser',
        status: 'approved',
        isAdmin: false
      };
      
      const token = generateToken(tokenPayload);
      
      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('PERMISSION_DENIED');
    });

    test('GET /api/admin/users should work for admin user', async () => {
      // 실제 테스트 사용자 생성 (관리자용)
      const adminUserData = {
        username: `admin-user-${uuidv4()}@example.com`,
        companyName: 'Admin Company',
        roleArn: 'arn:aws:iam::123456789012:role/AdminRole'
      };
      
      const adminCreateResult = await dynamoService.createUser(adminUserData);
      expect(adminCreateResult.success).toBe(true);
      
      const adminUserId = adminCreateResult.userId;
      testUsers.push(adminUserId); // 정리를 위해 추가
      
      const tokenPayload = {
        userId: adminUserId,
        username: adminUserData.username,
        status: 'approved',
        isAdmin: true
      };
      
      const token = generateToken(tokenPayload);
      
      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.users).toBeDefined();
      expect(Array.isArray(response.body.data.users)).toBe(true);
      expect(response.body.data.total).toBeGreaterThanOrEqual(0);
    });

    test('PUT /api/admin/users/:userId/status should require admin privileges', async () => {
      const tokenPayload = {
        userId: 'regular-user-id',
        username: 'regularuser',
        status: 'approved',
        isAdmin: false
      };
      
      const token = generateToken(tokenPayload);
      
      const response = await request(app)
        .put('/api/admin/users/test-user-id/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'approved' })
        .expect(403);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('PERMISSION_DENIED');
    });

    test('PUT /api/admin/users/:userId/status should work for admin user', async () => {
      // First create a test user
      const testUserData = {
        username: `test-user-${uuidv4()}@example.com`,
        companyName: 'Test Company',
        roleArn: 'arn:aws:iam::123456789012:role/TestRole'
      };
      
      const createResult = await dynamoService.createUser(testUserData);
      expect(createResult.success).toBe(true);
      testUsers.push(createResult.userId);
      
      const tokenPayload = {
        userId: 'admin-user-id',
        username: 'admin',
        status: 'approved',
        isAdmin: true
      };
      
      const token = generateToken(tokenPayload);
      
      const response = await request(app)
        .put(`/api/admin/users/${createResult.userId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'approved' })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.newStatus).toBe('approved');
      expect(response.body.data.userId).toBe(createResult.userId);
    });

    test('POST /api/admin/users/:userId/validate-arn should require admin privileges', async () => {
      const tokenPayload = {
        userId: 'regular-user-id',
        username: 'regularuser',
        status: 'approved',
        isAdmin: false
      };
      
      const token = generateToken(tokenPayload);
      
      const response = await request(app)
        .post('/api/admin/users/test-user-id/validate-arn')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('PERMISSION_DENIED');
    });

    test('POST /api/admin/users/:userId/validate-arn should return 404 for non-existent user', async () => {
      const tokenPayload = {
        userId: 'admin-user-id',
        username: 'admin',
        status: 'approved',
        isAdmin: true
      };
      
      const token = generateToken(tokenPayload);
      
      const response = await request(app)
        .post('/api/admin/users/test-user-id/validate-arn')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('USER_NOT_FOUND');
    });
  });
});