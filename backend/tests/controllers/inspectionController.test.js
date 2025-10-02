const request = require('supertest');
const express = require('express');
const inspectionController = require('../../controllers/inspectionController');
const inspectionService = require('../../services/inspectionService');
const historyService = require('../../services/historyService');

// Mock services
jest.mock('../../services/inspectionService');
jest.mock('../../services/historyService');

const app = express();
app.use(express.json());

// Mock authentication middleware
app.use((req, res, next) => {
  req.user = { userId: 'test-customer-id' };
  next();
});

// Add routes
app.post('/api/inspections/start', inspectionController.startInspection);
app.get('/api/inspections/history', inspectionController.getInspectionHistory);
app.get('/api/inspections/:id', inspectionController.getInspectionDetails);
app.get('/api/inspections/:id/status', inspectionController.getInspectionStatus);

describe('Inspection Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/inspections/start', () => {
    it('should start inspection successfully', async () => {
      const mockResult = {
        success: true,
        inspectionId: 'test-inspection-id',
        serviceType: 'EC2',
        status: 'PENDING',
        estimatedDuration: 300000
      };

      inspectionService.startInspection.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/inspections/start')
        .send({
          serviceType: 'EC2',
          assumeRoleArn: 'arn:aws:iam::123456789012:role/TestRole'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.inspectionId).toBe('test-inspection-id');
      expect(inspectionService.startInspection).toHaveBeenCalledWith(
        'test-customer-id',
        'EC2',
        'arn:aws:iam::123456789012:role/TestRole',
        {}
      );
    });

    it('should return 400 for missing service type', async () => {
      const response = await request(app)
        .post('/api/inspections/start')
        .send({
          assumeRoleArn: 'arn:aws:iam::123456789012:role/TestRole'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_SERVICE_TYPE');
    });
  });

  describe('GET /api/inspections/history', () => {
    it('should retrieve inspection history successfully', async () => {
      const mockResult = {
        success: true,
        data: {
          items: [
            {
              inspectionId: 'test-inspection-1',
              serviceType: 'EC2',
              status: 'COMPLETED'
            }
          ],
          count: 1,
          lastEvaluatedKey: null,
          hasMore: false
        }
      };

      historyService.getInspectionHistoryList.mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/api/inspections/history');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.inspections).toHaveLength(1);
    });
  });
});