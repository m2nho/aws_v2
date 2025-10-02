// Mock the api module before importing
jest.mock('../api', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn()
  }
}));

import { inspectionService } from '../inspectionService';
import api from '../api';

describe('inspectionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('startInspection', () => {
    it('should start inspection successfully', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            inspectionId: 'test-inspection-id',
            status: 'PENDING'
          }
        }
      };

      api.post.mockResolvedValue(mockResponse);

      const inspectionData = {
        serviceType: 'EC2',
        assumeRoleArn: 'arn:aws:iam::123456789012:role/InspectionRole'
      };

      const result = await inspectionService.startInspection(inspectionData);

      expect(api.post).toHaveBeenCalledWith('/inspections/start', inspectionData);
      expect(result).toEqual(mockResponse.data);
    });

    it('should retry on retryable errors', async () => {
      const networkError = new Error('Network Error');
      networkError.response = null; // Network error

      const mockResponse = {
        data: {
          success: true,
          data: { inspectionId: 'test-id' }
        }
      };

      api.post
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValue(mockResponse);

      const result = await inspectionService.startInspection({
        serviceType: 'EC2',
        assumeRoleArn: 'test-arn'
      });

      expect(api.post).toHaveBeenCalledTimes(3);
      expect(result).toEqual(mockResponse.data);
    }, 10000); // Increase timeout to 10 seconds

    it('should not retry on non-retryable errors', async () => {
      const clientError = new Error('Bad Request');
      clientError.response = { status: 400 };

      api.post.mockRejectedValue(clientError);

      await expect(inspectionService.startInspection({
        serviceType: 'EC2',
        assumeRoleArn: 'test-arn'
      })).rejects.toThrow('Bad Request');

      expect(api.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('getInspectionDetails', () => {
    it('should get inspection details successfully', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            inspectionId: 'test-id',
            status: 'COMPLETED',
            results: {}
          }
        }
      };

      api.get.mockResolvedValue(mockResponse);

      const result = await inspectionService.getInspectionDetails('test-id');

      expect(api.get).toHaveBeenCalledWith('/inspections/test-id');
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('getInspectionHistory', () => {
    it('should get inspection history with default params', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            inspections: [],
            hasMore: false
          }
        }
      };

      api.get.mockResolvedValue(mockResponse);

      const result = await inspectionService.getInspectionHistory();

      expect(api.get).toHaveBeenCalledWith('/inspections/history');
      expect(result).toEqual(mockResponse.data);
    });

    it('should get inspection history with query parameters', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: { inspections: [] }
        }
      };

      api.get.mockResolvedValue(mockResponse);

      const params = {
        serviceType: 'EC2',
        limit: 10,
        startDate: '2024-01-01'
      };

      await inspectionService.getInspectionHistory(params);

      expect(api.get).toHaveBeenCalledWith('/inspections/history?serviceType=EC2&limit=10&startDate=2024-01-01');
    });

    it('should filter out undefined and null parameters', async () => {
      const mockResponse = {
        data: { success: true, data: { inspections: [] } }
      };

      api.get.mockResolvedValue(mockResponse);

      const params = {
        serviceType: 'EC2',
        limit: undefined,
        startDate: null,
        endDate: ''
      };

      await inspectionService.getInspectionHistory(params);

      expect(api.get).toHaveBeenCalledWith('/inspections/history?serviceType=EC2');
    });
  });

  describe('getInspectionStatus', () => {
    it('should get inspection status successfully', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            inspectionId: 'test-id',
            status: 'IN_PROGRESS',
            progress: { percentage: 50 }
          }
        }
      };

      api.get.mockResolvedValue(mockResponse);

      const result = await inspectionService.getInspectionStatus('test-id');

      expect(api.get).toHaveBeenCalledWith('/inspections/test-id/status');
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('pollInspectionStatus', () => {
    it('should create polling object with control methods', () => {
      const onStatusUpdate = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      const polling = inspectionService.pollInspectionStatus(
        'test-id',
        onStatusUpdate,
        onComplete,
        onError
      );

      expect(polling).toHaveProperty('stop');
      expect(polling).toHaveProperty('isPolling');
      expect(polling).toHaveProperty('getAttempts');
      expect(typeof polling.stop).toBe('function');
      expect(typeof polling.isPolling).toBe('function');
      expect(typeof polling.getAttempts).toBe('function');

      // Clean up
      polling.stop();
    });

    it('should stop polling when requested', () => {
      const onStatusUpdate = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      const polling = inspectionService.pollInspectionStatus(
        'test-id',
        onStatusUpdate,
        onComplete,
        onError
      );

      expect(polling.isPolling()).toBe(true);

      polling.stop();
      expect(polling.isPolling()).toBe(false);
    });

  });

  describe('waitForInspectionCompletion', () => {
    it('should return a promise', () => {
      const onProgress = jest.fn();

      const result = inspectionService.waitForInspectionCompletion('test-id', onProgress);

      expect(result).toBeInstanceOf(Promise);
      // The stop method is attached to the resolve function, not the promise itself
      expect(result).toBeDefined();
    });
  });

  describe('getAvailableServices', () => {
    it('should get available services successfully', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            services: ['EC2', 'RDS', 'S3']
          }
        }
      };

      api.get.mockResolvedValue(mockResponse);

      const result = await inspectionService.getAvailableServices();

      expect(api.get).toHaveBeenCalledWith('/inspections/services');
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('cancelInspection', () => {
    it('should cancel inspection successfully', async () => {
      const mockResponse = {
        data: {
          success: true,
          message: 'Inspection cancelled'
        }
      };

      api.post.mockResolvedValue(mockResponse);

      const result = await inspectionService.cancelInspection('test-id');

      expect(api.post).toHaveBeenCalledWith('/inspections/test-id/cancel');
      expect(result).toEqual(mockResponse.data);
    });
  });
});