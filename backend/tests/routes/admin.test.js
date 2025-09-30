const request = require('supertest');
const app = require('../../app');
const { generateToken } = require('../../utils/jwt');
const dynamoService = require('../../services/dynamoService');
const { v4: uuidv4 } = require('uuid');

describe('Admin Routes', () => {
  let adminToken;
  let userToken;
  let testUsers = [];

  // 헬퍼 함수: 테스트 사용자 생성
  const createTestUser = async (userData = {}) => {
    const defaultUserData = {
      username: `test-user-${uuidv4()}@example.com`,
      companyName: 'Test Company',
      roleArn: 'arn:aws:iam::123456789012:role/TestRole',
      ...userData
    };
    
    const createResult = await dynamoService.createUser(defaultUserData);
    expect(createResult.success).toBe(true);
    testUsers.push(createResult.userId);
    
    return { userId: createResult.userId, userData: defaultUserData };
  };

  // 헬퍼 함수: 인증 테스트
  const testAuthenticationAndAuthorization = (method, endpoint, body = {}) => {
    it.each([
      ['non-admin user', 'userToken', 403, 'PERMISSION_DENIED'],
      ['no token', null, 401, 'MISSING_TOKEN']
    ])('should deny access for %s', async (_, tokenType, expectedStatus, expectedCode) => {
      const token = tokenType === 'userToken' ? userToken : undefined;
      const requestBuilder = request(app)[method](endpoint);
      
      if (token) {
        requestBuilder.set('Authorization', `Bearer ${token}`);
      }

      if (Object.keys(body).length > 0) {
        requestBuilder.send(body);
      }

      const response = await requestBuilder.expect(expectedStatus);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(expectedCode);
    });
  };

  beforeEach(() => {
    adminToken = generateToken({
      userId: 'admin-1',
      username: 'admin',
      status: 'approved',
      isAdmin: true
    });

    userToken = generateToken({
      userId: 'user-1',
      username: 'testuser',
      status: 'approved',
      isAdmin: false
    });
  });

  afterAll(async () => {
    for (const userId of testUsers) {
      try {
        await dynamoService.deleteUser(userId);
      } catch (error) {
        console.log(`Failed to cleanup test user ${userId}:`, error.message);
      }
    }
  });

  describe('GET /api/admin/users', () => {
    it('should return user list for admin', async () => {
      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'User list retrieved successfully',
        data: {
          users: expect.any(Array),
          total: expect.any(Number)
        }
      });

      // 각 사용자 객체가 필요한 필드를 가지고 있는지 확인
      if (response.body.data.users.length > 0) {
        expect(response.body.data.users[0]).toMatchObject({
          userId: expect.any(String),
          username: expect.any(String),
          companyName: expect.any(String),
          status: expect.stringMatching(/^(pending|approved|rejected)$/),
          roleArn: expect.any(String),
          createdAt: expect.any(String),
          updatedAt: expect.any(String)
        });
      }
    });

    testAuthenticationAndAuthorization('get', '/api/admin/users');
  });

  describe('PUT /api/admin/users/:userId/status', () => {
    it.each([
      ['approved', 'approved'],
      ['rejected', 'rejected']
    ])('should successfully update user status to %s', async (statusName, newStatus) => {
      const { userId, userData } = await createTestUser();

      const response = await request(app)
        .put(`/api/admin/users/${userId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: newStatus })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: `User status updated to ${newStatus}`,
        data: {
          userId,
          newStatus,
          updatedBy: 'admin',
          user: expect.objectContaining({
            userId,
            status: newStatus,
            username: userData.username,
            companyName: userData.companyName
          })
        }
      });
    });

    testAuthenticationAndAuthorization('put', '/api/admin/users/some-user-id/status', { status: 'approved' });

    it.each([
      ['missing status', 'some-user-id', {}, 'Status is required'],
      ['invalid status', 'some-user-id', { status: 'invalid' }, 'Invalid status value'],
      ['pending status', 'some-user-id', { status: 'pending' }, 'Invalid status value'],
      ['whitespace userId', '   ', { status: 'approved' }, 'User ID is required']
    ])('should return validation error for %s', async (_, userId, body, expectedMessage) => {
      const response = await request(app)
        .put(`/api/admin/users/${userId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(body)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: expectedMessage
        }
      });
    });

    it('should return 404 when user not found', async () => {
      const response = await request(app)
        .put('/api/admin/users/nonexistent-user-id-12345/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'approved' })
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        }
      });
    });
  });

  describe('POST /api/admin/users/:userId/validate-arn', () => {
    it('should successfully validate a valid ARN', async () => {
      const { userId, userData } = await createTestUser({ 
        roleArn: process.env.TEST_ARN 
      });

      const response = await request(app)
        .post(`/api/admin/users/${userId}/validate-arn`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'ARN validation completed',
        data: {
          userId,
          roleArn: userData.roleArn,
          arnValid: expect.any(Boolean),
          lastChecked: expect.any(String),
          validatedBy: 'admin',
          user: expect.objectContaining({
            userId,
            username: userData.username,
            companyName: userData.companyName,
            roleArn: userData.roleArn,
            arnValidation: expect.objectContaining({
              isValid: expect.any(Boolean),
              lastChecked: expect.any(String)
            })
          })
        }
      });
    });

    it('should handle invalid ARN format', async () => {
      const { userId, userData } = await createTestUser({ 
        roleArn: 'invalid-arn-format' 
      });

      const response = await request(app)
        .post(`/api/admin/users/${userId}/validate-arn`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'ARN validation completed',
        data: {
          userId,
          roleArn: userData.roleArn,
          arnValid: false,
          error: expect.stringContaining('Invalid ARN format'),
          user: expect.objectContaining({
            arnValidation: expect.objectContaining({
              isValid: false,
              error: expect.any(String)
            })
          })
        }
      });
    });

    it('should handle user without ARN', async () => {
      const { userId } = await createTestUser({ roleArn: null });

      const response = await request(app)
        .post(`/api/admin/users/${userId}/validate-arn`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'MISSING_ARN',
          message: 'User does not have a Role ARN'
        }
      });
    });

    testAuthenticationAndAuthorization('post', '/api/admin/users/some-user-id/validate-arn');

    it.each([
      ['empty userId', '   ', 'User ID is required'],
      ['nonexistent user', 'nonexistent-user-id-12345', 'User not found']
    ])('should return error for %s', async (_, userId, expectedMessage) => {
      const expectedStatus = userId.trim() === '' ? 400 : 404;
      const expectedCode = userId.trim() === '' ? 'VALIDATION_ERROR' : 'USER_NOT_FOUND';

      const response = await request(app)
        .post(`/api/admin/users/${userId}/validate-arn`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(expectedStatus);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: expectedCode,
          message: expectedMessage
        }
      });
    });
  });

});