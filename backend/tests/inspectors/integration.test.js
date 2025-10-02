/**
 * Inspector Integration Tests
 * Inspector 모듈의 통합 테스트
 * Requirements: 4.1, 4.3, 4.4
 */

const { inspectors } = require('../../services');
const ExampleInspector = require('../../services/inspectors/exampleInspector');

describe('Inspector Integration', () => {
  let mockCredentials;
  let mockConfig;

  beforeEach(() => {
    mockCredentials = {
      accessKeyId: 'mock-access-key',
      secretAccessKey: 'mock-secret-key',
      sessionToken: 'mock-session-token',
      roleArn: 'arn:aws:iam::123456789012:role/MockRole'
    };
    mockConfig = {
      exampleMode: 'demo',
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
    test('should register and create example inspector', () => {
      // Register the example inspector
      inspectors.registry.register('Example', ExampleInspector);
      
      // Verify registration
      expect(inspectors.isServiceTypeSupported('Example')).toBe(true);
      expect(inspectors.getSupportedServiceTypes()).toContain('EXAMPLE');
      
      // Create inspector instance
      const inspector = inspectors.createInspector('Example');
      expect(inspector).toBeInstanceOf(ExampleInspector);
      expect(inspector.serviceType).toBe('Example');
    });

    test('should get inspector info list', () => {
      inspectors.registry.register('Example', ExampleInspector);
      
      const infoList = inspectors.getInspectorInfoList();
      expect(infoList).toHaveLength(1);
      
      const exampleInfo = infoList[0];
      expect(exampleInfo.serviceType).toBe('EXAMPLE');
      expect(exampleInfo.version).toBe('example-inspector-v1.0');
      expect(exampleInfo.supportedInspectionTypes).toEqual([
        'security-check',
        'compliance-check',
        'configuration-review'
      ]);
    });
  });

  describe('End-to-End Inspector Execution', () => {
    test('should execute complete inspection workflow', async () => {
      // Register inspector
      inspectors.registry.register('Example', ExampleInspector);
      
      // Create inspector
      const inspector = inspectors.createInspector('Example', {
        timeout: 10000
      });
      
      // Execute inspection
      const result = await inspector.executeInspection(
        'test-customer-123',
        mockCredentials,
        mockConfig
      );
      
      // Verify result structure
      expect(result.customerId).toBe('test-customer-123');
      expect(result.serviceType).toBe('Example');
      expect(result.status).toBe('COMPLETED');
      expect(result.inspectionId).toBeDefined();
      expect(result.assumeRoleArn).toBe(mockCredentials.roleArn);
      
      // Verify results content
      expect(result.results).toBeDefined();
      expect(result.results.summary).toBeDefined();
      expect(result.results.summary.totalResources).toBe(5);
      expect(result.results.findings).toBeDefined();
      expect(result.results.recommendations).toBeDefined();
      
      // Verify findings were generated
      expect(result.results.findings.length).toBeGreaterThan(0);
      
      // Verify recommendations include service-specific ones
      expect(result.results.recommendations).toContain(
        '보안 설정을 정기적으로 검토하고 업데이트하시기 바랍니다.'
      );
    }, 10000);

    test('should handle inspection errors gracefully', async () => {
      // Register inspector
      inspectors.registry.register('Example', ExampleInspector);
      
      // Create inspector
      const inspector = inspectors.createInspector('Example');
      
      // Execute inspection with invalid config to trigger error
      const invalidConfig = { exampleMode: 'invalid' };
      
      const result = await inspector.executeInspection(
        'test-customer-123',
        mockCredentials,
        invalidConfig
      );
      
      // Should return failed result with error info
      expect(result.status).toBe('FAILED');
      expect(result.results.error).toBeDefined();
      expect(result.results.error.message).toContain('Invalid example mode');
      expect(result.results.metadata.partialResults).toBe(true);
    });
  });

  describe('Inspector Factory Functions', () => {
    beforeEach(() => {
      inspectors.registry.register('Example', ExampleInspector);
    });

    test('should create inspector using factory function', () => {
      const inspector = inspectors.createInspector('Example', {
        timeout: 600000,
        maxRetries: 5
      });
      
      expect(inspector).toBeInstanceOf(ExampleInspector);
      expect(inspector.options.timeout).toBe(600000);
      expect(inspector.options.maxRetries).toBe(5);
    });

    test('should check service type support', () => {
      expect(inspectors.isServiceTypeSupported('Example')).toBe(true);
      expect(inspectors.isServiceTypeSupported('example')).toBe(true);
      expect(inspectors.isServiceTypeSupported('NonExistent')).toBe(false);
    });

    test('should get supported service types', () => {
      const serviceTypes = inspectors.getSupportedServiceTypes();
      expect(serviceTypes).toContain('EXAMPLE');
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