const request = require('supertest');
const express = require('express');
const usersRouter = require('../../routes/users');
const { generateToken } = require('../../utils/jwt');
const dynamoService = require('../../services/dynamoService');

// Mock the DynamoDB service
jest.mock('../../services/dynamoService');

const app = express();
app.use(express.json());
app.use('/api/users', usersRouter);

describe('GET /api/users/profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should return 401 when no token is provided', async () => {
      const response = await request(app)
        .get('/api/users/profile');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_TOKEN');
    });

    it('should return 401 when invalid token is provided', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('Profile Retrieval', () => {
    const mockUser = {
      userId: 'test-user-id',
      username: 'testuser',
      companyName: 'Test Company',
      roleArn: 'arn:aws:iam::123456789012:role/TestRole',
      status: 'approved',
      arnValidation: {
        isValid: true,
        lastChecked: '2024-01-01T00:00:00.000Z',
        error: null
      },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z'
    };

    it('should return user profile for approved user (Requirement 4.2, 4.5)', async () => {
      const token = generateToken({
        userId: 'test-user-id',
        username: 'testuser',
        status: 'approved',
        isAdmin: false
      });

      dynamoService.getUserById.mockResolvedValue({
        success: true,
        user: mockUser
      });

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.userId).toBe('test-user-id');
      expect(response.body.data.username).toBe('testuser');
      expect(response.body.data.status).toBe('approved');
      expect(response.body.data.accessLevel).toBe('full');
      expect(response.body.data.statusMessage).toContain('active and you have full access');
    });

    it('should return pending status message for pending user (Requirement 4.3)', async () => {
      const pendingUser = { ...mockUser, status: 'pending' };
      const token = generateToken({
        userId: 'test-user-id',
        username: 'testuser',
        status: 'pending',
        isAdmin: false
      });

      dynamoService.getUserById.mockResolvedValue({
        success: true,
        user: pendingUser
      });

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('pending');
      expect(response.body.data.accessLevel).toBe('limited');
      expect(response.body.data.statusMessage).toContain('waiting for administrator approval');
    });

    it('should return rejected status message for rejected user (Requirement 4.4)', async () => {
      const rejectedUser = { ...mockUser, status: 'rejected' };
      const token = generateToken({
        userId: 'test-user-id',
        username: 'testuser',
        status: 'rejected',
        isAdmin: false
      });

      dynamoService.getUserById.mockResolvedValue({
        success: true,
        user: rejectedUser
      });

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('rejected');
      expect(response.body.data.accessLevel).toBe('denied');
      expect(response.body.data.statusMessage).toContain('rejected by an administrator');
    });

    it('should return 404 when user not found in database', async () => {
      const token = generateToken({
        userId: 'non-existent-user',
        username: 'testuser',
        status: 'approved',
        isAdmin: false
      });

      dynamoService.getUserById.mockResolvedValue({
        success: false,
        error: '사용자를 찾을 수 없습니다'
      });

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('USER_NOT_FOUND');
    });

    it('should handle database errors gracefully', async () => {
      const token = generateToken({
        userId: 'test-user-id',
        username: 'testuser',
        status: 'approved',
        isAdmin: false
      });

      dynamoService.getUserById.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INTERNAL_ERROR');
    });

    it('should include all required user data fields', async () => {
      const token = generateToken({
        userId: 'test-user-id',
        username: 'testuser',
        status: 'approved',
        isAdmin: false
      });

      dynamoService.getUserById.mockResolvedValue({
        success: true,
        user: mockUser
      });

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('userId');
      expect(response.body.data).toHaveProperty('username');
      expect(response.body.data).toHaveProperty('companyName');
      expect(response.body.data).toHaveProperty('roleArn');
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('statusMessage');
      expect(response.body.data).toHaveProperty('accessLevel');
      expect(response.body.data).toHaveProperty('arnValidation');
      expect(response.body.data).toHaveProperty('createdAt');
      expect(response.body.data).toHaveProperty('updatedAt');
    });
  });
});