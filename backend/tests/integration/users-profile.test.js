const request = require('supertest');
const app = require('../../app');
const { generateToken } = require('../../utils/jwt');
const dynamoService = require('../../services/dynamoService');

// Mock the DynamoDB service for integration tests
jest.mock('../../services/dynamoService');

describe('Integration: GET /api/users/profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully retrieve user profile with valid token', async () => {
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
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('Profile retrieved successfully');
    expect(response.body.data.userId).toBe('test-user-id');
    expect(response.body.data.username).toBe('testuser');
    expect(response.body.data.companyName).toBe('Test Company');
    expect(response.body.data.status).toBe('approved');
    expect(response.body.data.accessLevel).toBe('full');
    expect(response.body.data.statusMessage).toContain('active and you have full access');
  });

  it('should handle different user statuses correctly', async () => {
    const testCases = [
      {
        status: 'pending',
        expectedAccessLevel: 'limited',
        expectedMessageContains: 'waiting for administrator approval'
      },
      {
        status: 'rejected',
        expectedAccessLevel: 'denied',
        expectedMessageContains: 'rejected by an administrator'
      },
      {
        status: 'approved',
        expectedAccessLevel: 'full',
        expectedMessageContains: 'active and you have full access'
      }
    ];

    for (const testCase of testCases) {
      const mockUser = {
        userId: 'test-user-id',
        username: 'testuser',
        companyName: 'Test Company',
        roleArn: 'arn:aws:iam::123456789012:role/TestRole',
        status: testCase.status,
        arnValidation: { isValid: null, lastChecked: null, error: null },
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      };

      const token = generateToken({
        userId: 'test-user-id',
        username: 'testuser',
        status: testCase.status,
        isAdmin: false
      });

      dynamoService.getUserById.mockResolvedValue({
        success: true,
        user: mockUser
      });

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data.status).toBe(testCase.status);
      expect(response.body.data.accessLevel).toBe(testCase.expectedAccessLevel);
      expect(response.body.data.statusMessage).toContain(testCase.expectedMessageContains);
    }
  });
});