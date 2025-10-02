/**
 * Base Inspector Unit Tests
 * BaseInspector 클래스의 단위 테스트
 * Requirements: 4.3, 4.4
 */

const BaseInspector = require('../../services/inspectors/baseInspector');
const InspectionResult = require('../../models/InspectionResult');
const InspectionFinding = require('../../models/InspectionFinding');

// Mock Inspector for testing
class MockInspector extends BaseInspector {
  constructor(options = {}) {
    super('MockService', options);
    this.mockResults = null;
    this.shouldThrowError = false;
    this.errorToThrow = null;
  }

  async performInspection(awsCredentials, inspectionConfig) {
    if (this.shouldThrowError) {
      throw this.errorToThrow || new Error('Mock inspection error');
    }

    // Mock some findings
    const finding1 = new InspectionFinding({
      resourceId: 'resource-1',
      resourceType: 'MockResource',
      riskLevel: 'HIGH',
      issue: 'Mock high risk issue',
      recommendation: 'Fix this issue'
    });

    const finding2 = new InspectionFinding({
      resourceId: 'resource-2',
      resourceType: 'MockResource',
      riskLevel: 'MEDIUM',
      issue: 'Mock medium risk issue',
      recommendation: 'Consider fixing this'
    });

    this.addFinding(finding1);
    this.addFinding(finding2);
    this.incrementResourceCount(2);

    return this.mockResults || { processed: true };
  }

  getVersion() {
    return 'mock-inspector-v1.0';
  }

  getSupportedInspectionTypes() {
    return ['mock-type-1', 'mock-type-2'];
  }

  getServiceSpecificRecommendations() {
    return ['Mock specific recommendation'];
  }
}

describe('BaseInspector', () => {
  let inspector;
  let mockCredentials;
  let mockConfig;

  beforeEach(() => {
    inspector = new MockInspector();
    mockCredentials = {
      accessKeyId: 'mock-access-key',
      secretAccessKey: 'mock-secret-key',
      sessionToken: 'mock-session-token',
      roleArn: 'arn:aws:iam::123456789012:role/MockRole'
    };
    mockConfig = {
      regions: ['us-east-1'],
      inspectionTypes: ['mock-type-1']
    };

    // Mock console methods to avoid test output noise
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with default options', () => {
      const inspector = new MockInspector();
      
      expect(inspector.serviceType).toBe('MockService');
      expect(inspector.options.timeout).toBe(300000);
      expect(inspector.options.maxRetries).toBe(3);
      expect(inspector.findings).toEqual([]);
      expect(inspector.errors).toEqual([]);
    });

    test('should merge custom options', () => {
      const customOptions = {
        timeout: 600000,
        maxRetries: 5,
        customOption: 'test'
      };
      
      const inspector = new MockInspector(customOptions);
      
      expect(inspector.options.timeout).toBe(600000);
      expect(inspector.options.maxRetries).toBe(5);
      expect(inspector.options.customOption).toBe('test');
    });
  });

  describe('executeInspection', () => {
    test('should successfully execute inspection', async () => {
      const result = await inspector.executeInspection('customer-123', mockCredentials, mockConfig);
      
      expect(result).toBeInstanceOf(InspectionResult);
      expect(result.customerId).toBe('customer-123');
      expect(result.serviceType).toBe('MockService');
      expect(result.status).toBe('COMPLETED');
      expect(result.results).toBeDefined();
      expect(result.results.summary.totalResources).toBe(2);
      expect(result.results.summary.highRiskIssues).toBe(1);
      expect(result.results.summary.mediumRiskIssues).toBe(1);
      expect(result.results.findings).toHaveLength(2);
    });

    test('should handle inspection errors gracefully', async () => {
      inspector.shouldThrowError = true;
      inspector.errorToThrow = new Error('Test error');
      
      const result = await inspector.executeInspection('customer-123', mockCredentials, mockConfig);
      
      expect(result).toBeInstanceOf(InspectionResult);
      expect(result.status).toBe('FAILED');
      expect(result.results.error).toBeDefined();
      expect(result.results.error.message).toBe('Test error');
      expect(result.results.metadata.partialResults).toBe(true);
    });

    test('should validate AWS credentials', async () => {
      const invalidCredentials = {};
      
      const result = await inspector.executeInspection('customer-123', invalidCredentials, mockConfig);
      
      expect(result.status).toBe('FAILED');
      expect(result.results.error.message).toContain('Invalid AWS credentials');
    });
  });

  describe('addFinding', () => {
    test('should add valid finding', () => {
      const finding = new InspectionFinding({
        resourceId: 'test-resource',
        resourceType: 'TestResource',
        riskLevel: 'HIGH',
        issue: 'Test issue',
        recommendation: 'Test recommendation'
      });

      inspector.addFinding(finding);
      
      expect(inspector.findings).toHaveLength(1);
      expect(inspector.findings[0]).toBe(finding);
    });

    test('should reject invalid finding', () => {
      const invalidFinding = { invalid: 'object' };
      
      expect(() => {
        inspector.addFinding(invalidFinding);
      }).toThrow('Finding must be an instance of InspectionFinding');
    });

    test('should reject finding with validation errors', () => {
      const invalidFinding = new InspectionFinding({
        resourceId: '', // Invalid - empty
        resourceType: 'TestResource',
        riskLevel: 'INVALID', // Invalid risk level
        issue: 'Test issue',
        recommendation: 'Test recommendation'
      });
      
      expect(() => {
        inspector.addFinding(invalidFinding);
      }).toThrow('Invalid finding');
    });
  });

  describe('recordError', () => {
    test('should record error with context', () => {
      const error = new Error('Test error');
      const context = { operation: 'test-operation' };
      
      inspector.recordError(error, context);
      
      expect(inspector.errors).toHaveLength(1);
      expect(inspector.errors[0].message).toBe('Test error');
      expect(inspector.errors[0].context).toEqual(context);
      expect(inspector.errors[0].timestamp).toBeDefined();
    });
  });

  describe('calculateOverallScore', () => {
    test('should return 100 for no findings', () => {
      const summary = {
        totalFindings: 0,
        criticalIssues: 0,
        highRiskIssues: 0,
        mediumRiskIssues: 0,
        lowRiskIssues: 0
      };
      
      const score = inspector.calculateOverallScore(summary);
      expect(score).toBe(100);
    });

    test('should calculate score based on risk levels', () => {
      inspector.metadata.resourcesScanned = 10;
      
      const summary = {
        totalFindings: 3,
        criticalIssues: 1,
        highRiskIssues: 1,
        mediumRiskIssues: 1,
        lowRiskIssues: 0
      };
      
      const score = inspector.calculateOverallScore(summary);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(100);
    });
  });

  describe('retryableApiCall', () => {
    test('should succeed on first attempt', async () => {
      const mockApiCall = jest.fn().mockResolvedValue('success');
      
      const result = await inspector.retryableApiCall(mockApiCall, 'test-operation');
      
      expect(result).toBe('success');
      expect(mockApiCall).toHaveBeenCalledTimes(1);
    });

    test('should retry on retryable errors', async () => {
      const retryableError = new Error('Throttling');
      retryableError.code = 'Throttling';
      
      const mockApiCall = jest.fn()
        .mockRejectedValueOnce(retryableError)
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValue('success');
      
      // Mock sleep to avoid actual delays in tests
      jest.spyOn(inspector, 'sleep').mockResolvedValue();
      
      const result = await inspector.retryableApiCall(mockApiCall, 'test-operation');
      
      expect(result).toBe('success');
      expect(mockApiCall).toHaveBeenCalledTimes(3);
    });

    test('should not retry on non-retryable errors', async () => {
      const nonRetryableError = new Error('AccessDenied');
      nonRetryableError.code = 'AccessDenied';
      
      const mockApiCall = jest.fn().mockRejectedValue(nonRetryableError);
      
      await expect(
        inspector.retryableApiCall(mockApiCall, 'test-operation')
      ).rejects.toThrow('AccessDenied');
      
      expect(mockApiCall).toHaveBeenCalledTimes(1);
    });

    test('should fail after max retries', async () => {
      const retryableError = new Error('Throttling');
      retryableError.code = 'Throttling';
      
      const mockApiCall = jest.fn().mockRejectedValue(retryableError);
      
      // Mock sleep to avoid actual delays in tests
      jest.spyOn(inspector, 'sleep').mockResolvedValue();
      
      await expect(
        inspector.retryableApiCall(mockApiCall, 'test-operation')
      ).rejects.toThrow('Throttling');
      
      expect(mockApiCall).toHaveBeenCalledTimes(3); // maxRetries
    });
  });

  describe('isRetryableError', () => {
    test('should identify retryable errors', () => {
      const retryableErrors = [
        { code: 'Throttling' },
        { code: 'ThrottlingException' },
        { code: 'RequestLimitExceeded' },
        { code: 'ServiceUnavailable' },
        { message: 'NetworkingError occurred' }
      ];
      
      retryableErrors.forEach(error => {
        expect(inspector.isRetryableError(error)).toBe(true);
      });
    });

    test('should identify non-retryable errors', () => {
      const nonRetryableErrors = [
        { code: 'AccessDenied' },
        { code: 'InvalidParameter' },
        { message: 'Some other error' }
      ];
      
      nonRetryableErrors.forEach(error => {
        expect(inspector.isRetryableError(error)).toBe(false);
      });
    });
  });

  describe('getInspectorInfo', () => {
    test('should return inspector information', () => {
      const info = inspector.getInspectorInfo();
      
      expect(info.serviceType).toBe('MockService');
      expect(info.version).toBe('mock-inspector-v1.0');
      expect(info.supportedInspectionTypes).toEqual(['mock-type-1', 'mock-type-2']);
      expect(info.options).toBeDefined();
    });
  });

  describe('incrementResourceCount', () => {
    test('should increment resource count by 1 by default', () => {
      expect(inspector.metadata.resourcesScanned).toBe(0);
      
      inspector.incrementResourceCount();
      expect(inspector.metadata.resourcesScanned).toBe(1);
    });

    test('should increment resource count by specified amount', () => {
      inspector.incrementResourceCount(5);
      expect(inspector.metadata.resourcesScanned).toBe(5);
    });
  });

  describe('generateRecommendations', () => {
    test('should generate recommendations based on findings', () => {
      // Add some findings
      const criticalFinding = new InspectionFinding({
        resourceId: 'critical-resource',
        resourceType: 'TestResource',
        riskLevel: 'CRITICAL',
        issue: 'Critical issue',
        recommendation: 'Fix immediately'
      });

      const highFinding = new InspectionFinding({
        resourceId: 'high-resource',
        resourceType: 'TestResource',
        riskLevel: 'HIGH',
        issue: 'High risk issue',
        recommendation: 'Fix soon'
      });

      inspector.addFinding(criticalFinding);
      inspector.addFinding(highFinding);
      
      const recommendations = inspector.generateRecommendations();
      
      expect(recommendations).toContain('즉시 조치가 필요한 심각한 보안 문제가 발견되었습니다.');
      expect(recommendations).toContain('높은 위험도의 문제들을 우선적으로 해결하시기 바랍니다.');
      expect(recommendations).toContain('Mock specific recommendation');
    });
  });

  describe('Abstract method enforcement', () => {
    test('should throw error when calling abstract inspect method', async () => {
      const baseInspector = new BaseInspector('TestService');
      
      await expect(
        baseInspector.inspect(mockCredentials, mockConfig)
      ).rejects.toThrow('inspect() method must be implemented by subclass');
    });

    test('should throw error when calling abstract performInspection method', async () => {
      const baseInspector = new BaseInspector('TestService');
      
      await expect(
        baseInspector.performInspection(mockCredentials, mockConfig)
      ).rejects.toThrow('performInspection() method must be implemented by subclass');
    });
  });
});