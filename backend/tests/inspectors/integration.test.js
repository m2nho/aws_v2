/**
 * Inspector Integration Tests
 * Inspector 모듈의 통합 테스트
 * Requirements: 4.1, 4.3, 4.4
 */

const { inspectors } = require('../../services');
const EC2Inspector = require('../../services/inspectors/ec2/index');

describe('Inspector Integration', () => {
  let mockCredentials;
  let mockConfig;

  beforeEach(() => {
    mockCredentials = {
      accessKeyId: 'mock-access-key',
      secretAccessKey: 'mock-secret-key',
      sessionToken: 'mock-session-token',
      roleArn: 'arn:aws:iam::123456789012:role/MockRole',
      region: 'us-east-1'
    };
    mockConfig = {
      targetItem: 'security_groups',
      regions: ['us-east-1']
    };

    // Mock console methods to avoid test output noise
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    inspectors.registry.clear();
  });

  describe('Inspector Registry Integration', () => {
    test('should register and create EC2 inspector', () => {
      // Register the EC2 inspector
      inspectors.registry.register('EC2', EC2Inspector);
      
      // Verify registration
      expect(inspectors.isServiceTypeSupported('EC2')).toBe(true);
      expect(inspectors.getSupportedServiceTypes()).toContain('EC2');
      
      // Create inspector instance
      const inspector = inspectors.createInspector('EC2');
      expect(inspector).toBeInstanceOf(EC2Inspector);
      expect(inspector.serviceType).toBe('EC2');
    });

    test('should get inspector info list', () => {
      inspectors.registry.register('EC2', EC2Inspector);
      
      const infoList = inspectors.getInspectorInfoList();
      expect(infoList).toHaveLength(1);
      
      const ec2Info = infoList[0];
      expect(ec2Info.serviceType).toBe('EC2');
      expect(ec2Info.version).toBe('ec2-inspector-v2.0');
      expect(ec2Info.supportedInspectionTypes).toEqual([
        'security-groups',
        'instance-security',
        'network-configuration',
        'access-control',
        'metadata-service',
        'key-management'
      ]);
    });
  });

  describe('End-to-End Inspector Execution', () => {
    test('should execute complete inspection workflow', async () => {
      // Mock AWS SDK calls to avoid actual API calls
      const mockEC2Client = {
        send: jest.fn().mockResolvedValue({
          SecurityGroups: [],
          Reservations: []
        })
      };
      
      // Register inspector
      inspectors.registry.register('EC2', EC2Inspector);
      
      // Create inspector
      const inspector = inspectors.createInspector('EC2', {
        timeout: 10000
      });
      
      // Mock the EC2 client
      inspector.ec2Client = mockEC2Client;
      
      // Execute inspection
      const result = await inspector.executeInspection(
        'test-customer-123',
        mockCredentials,
        mockConfig
      );
      
      // Verify result structure
      expect(result.customerId).toBe('test-customer-123');
      expect(result.serviceType).toBe('EC2');
      expect(result.status).toBe('COMPLETED');
      expect(result.inspectionId).toBeDefined();
      expect(result.assumeRoleArn).toBe(mockCredentials.roleArn);
      
      // Verify results content
      expect(result.results).toBeDefined();
      expect(result.results.summary).toBeDefined();
      expect(result.results.findings).toBeDefined();
      expect(result.results.recommendations).toBeDefined();
    }, 10000);

    test('should handle inspection errors gracefully', async () => {
      // Register inspector
      inspectors.registry.register('EC2', EC2Inspector);
      
      // Create inspector
      const inspector = inspectors.createInspector('EC2');
      
      // Execute inspection with invalid credentials to trigger error
      const invalidCredentials = { ...mockCredentials, accessKeyId: null };
      
      const result = await inspector.executeInspection(
        'test-customer-123',
        invalidCredentials,
        mockConfig
      );
      
      // Should return failed result with error info
      expect(result.status).toBe('FAILED');
      expect(result.results.error).toBeDefined();
      expect(result.results.metadata.partialResults).toBe(true);
    });
  });

  describe('Inspector Factory Functions', () => {
    beforeEach(() => {
      inspectors.registry.register('EC2', EC2Inspector);
    });

    test('should create inspector using factory function', () => {
      const inspector = inspectors.createInspector('EC2', {
        timeout: 600000,
        maxRetries: 5
      });
      
      expect(inspector).toBeInstanceOf(EC2Inspector);
      expect(inspector.options.timeout).toBe(600000);
      expect(inspector.options.maxRetries).toBe(5);
    });

    test('should check service type support', () => {
      expect(inspectors.isServiceTypeSupported('EC2')).toBe(true);
      expect(inspectors.isServiceTypeSupported('ec2')).toBe(true);
      expect(inspectors.isServiceTypeSupported('NonExistent')).toBe(false);
    });

    test('should get supported service types', () => {
      const serviceTypes = inspectors.getSupportedServiceTypes();
      expect(serviceTypes).toContain('EC2');
      expect(serviceTypes).toHaveLength(1);
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle registry errors', () => {
      expect(() => {
        inspectors.createInspector('NonExistent');
      }).toThrow('No inspector found for service type: NonExistent');
    });

    test('should handle invalid inspector registration', () => {
      class InvalidInspector {
        // Doesn't extend BaseInspector
      }

      expect(() => {
        inspectors.registry.register('Invalid', InvalidInspector);
      }).toThrow('Inspector class must extend BaseInspector');
    });
  });
});