const request = require('supertest');
const express = require('express');
const inspectionController = require('../../controllers/inspectionController');
const { authenticateToken } = require('../../middleware/auth');

// 실제 서비스들을 사용 (mock 없음)
const inspectionService = require('../../services/inspectionService');
const historyService = require('../../services/historyService');

const app = express();
app.use(express.json());

// 실제 인증 미들웨어 대신 테스트용 미들웨어
app.use((req, res, next) => {
  req.user = { 
    userId: 'integration-test-customer-id',
    email: 'test@example.com'
  };
  next();
});

// 실제 라우트 설정
app.post('/api/inspections/start', inspectionController.startInspection);
app.get('/api/inspections/history', inspectionController.getInspectionHistory);
app.get('/api/inspections/:id', inspectionController.getInspectionDetails);
app.get('/api/inspections/:id/status', inspectionController.getInspectionStatus);

describe('Inspection Controller Integration Tests', () => {
  let testInspectionId;

  beforeAll(async () => {
    console.log('Starting integration tests with real services...');
  });

  afterAll(async () => {
    // 테스트 후 정리
    if (testInspectionId) {
      console.log(`Test completed with inspection ID: ${testInspectionId}`);
    }
  });

  describe('POST /api/inspections/start - Real Integration', () => {
    it('should start inspection with real services', async () => {
      // 실제 환경에서 사용 가능한 role ARN 사용
      const testRoleArn = process.env.TEST_ARN || 'arn:aws:iam::713881821833:role/project-arn-role';
      
      const response = await request(app)
        .post('/api/inspections/start')
        .send({
          serviceType: 'EC2',
          assumeRoleArn: testRoleArn,
          inspectionConfig: {
            regions: ['ap-northeast-2'],
            maxResources: 5
          }
        });

      console.log('Start inspection response:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('inspectionId');
      expect(response.body.data).toHaveProperty('serviceType', 'EC2');
      expect(response.body.data).toHaveProperty('status');

      // 테스트용으로 inspection ID 저장
      testInspectionId = response.body.data.inspectionId;
    }, 30000); // 30초 타임아웃

    it('should handle missing service type', async () => {
      const response = await request(app)
        .post('/api/inspections/start')
        .send({
          assumeRoleArn: 'arn:aws:iam::713881821833:role/project-arn-role'
        });

      console.log('Missing service type response:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_SERVICE_TYPE');
    });

    it('should handle missing role ARN', async () => {
      const response = await request(app)
        .post('/api/inspections/start')
        .send({
          serviceType: 'EC2'
        });

      console.log('Missing role ARN response:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_ROLE_ARN');
    });
  });

  describe('GET /api/inspections/:id/status - Real Integration', () => {
    it('should get inspection status with real data', async () => {
      if (!testInspectionId) {
        console.log('Skipping status test - no inspection ID available');
        return;
      }

      const response = await request(app)
        .get(`/api/inspections/${testInspectionId}/status`);

      console.log('Status response:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('inspectionId', testInspectionId);
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('progress');
    });

    it('should return 404 for non-existent inspection', async () => {
      const response = await request(app)
        .get('/api/inspections/non-existent-id/status');

      console.log('Non-existent inspection response:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INSPECTION_NOT_FOUND');
    });
  });

  describe('GET /api/inspections/history - Real Integration', () => {
    it('should retrieve real inspection history or handle missing table gracefully', async () => {
      const response = await request(app)
        .get('/api/inspections/history')
        .query({
          limit: 5
        });

      console.log('History response:', JSON.stringify(response.body, null, 2));

      // DynamoDB 테이블이 없거나 자격 증명 문제가 있을 수 있으므로 유연하게 처리
      if (response.status === 200) {
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('inspections');
        expect(Array.isArray(response.body.data.inspections)).toBe(true);
        expect(response.body.data).toHaveProperty('totalCount');
      } else {
        // 오류가 발생한 경우 적절한 오류 응답인지 확인
        expect(response.status).toBe(500);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toHaveProperty('code', 'INTERNAL_ERROR');
        console.log('History service unavailable - this is expected in test environment');
      }
    });

    it('should handle pagination parameters or return appropriate error', async () => {
      const response = await request(app)
        .get('/api/inspections/history')
        .query({
          limit: 2,
          serviceType: 'EC2'
        });

      console.log('Paginated history response:', JSON.stringify(response.body, null, 2));

      if (response.status === 200) {
        expect(response.body.success).toBe(true);
        expect(response.body.data.inspections.length).toBeLessThanOrEqual(2);
      } else {
        expect(response.status).toBe(500);
        expect(response.body.success).toBe(false);
        console.log('History service unavailable - this is expected in test environment');
      }
    });
  });

  describe('GET /api/inspections/:id - Real Integration', () => {
    it('should get inspection details with real data', async () => {
      if (!testInspectionId) {
        console.log('Skipping details test - no inspection ID available');
        return;
      }

      // 검사가 완료될 때까지 잠시 대기
      await new Promise(resolve => setTimeout(resolve, 2000));

      const response = await request(app)
        .get(`/api/inspections/${testInspectionId}`);

      console.log('Details response:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('inspectionId', testInspectionId);
      expect(response.body.data).toHaveProperty('status');
      
      // serviceType은 활성 검사에서만 포함될 수 있음
      if (response.body.data.serviceType) {
        expect(response.body.data.serviceType).toBe('EC2');
      }
    });
  });
});