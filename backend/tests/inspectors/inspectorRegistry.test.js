/**
 * Inspector Registry Unit Tests
 * InspectorRegistry 클래스의 단위 테스트
 * Requirements: 4.1, 4.3
 */

const { InspectorRegistry, BaseInspector } = require('../../services/inspectors');

// Mock Inspector classes for testing
class MockEC2Inspector extends BaseInspector {
  constructor(serviceType, options = {}) {
    super(serviceType || 'EC2', options);
  }

  async performInspection(awsCredentials, inspectionConfig) {
    return { ec2Results: true };
  }

  getVersion() {
    return 'ec2-inspector-v1.0';
  }

  getSupportedInspectionTypes() {
    return ['security-groups', 'instances'];
  }
}

class MockRDSInspector extends BaseInspector {
  constructor(serviceType, options = {}) {
    super(serviceType || 'RDS', options);
  }

  async performInspection(awsCredentials, inspectionConfig) {
    return { rdsResults: true };
  }

  getVersion() {
    return 'rds-inspector-v1.0';
  }

  getSupportedInspectionTypes() {
    return ['instances', 'snapshots'];
  }
}

class InvalidInspector {
  // This class doesn't extend BaseInspector
}

describe('InspectorRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new InspectorRegistry();
    
    // Mock console methods to avoid test output noise
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('register', () => {
    test('should register valid inspector', () => {
      registry.register('EC2', MockEC2Inspector);
      
      expect(registry.get('EC2')).toBe(MockEC2Inspector);
      expect(registry.get('ec2')).toBe(MockEC2Inspector); // Case insensitive
    });

    test('should throw error for invalid service type', () => {
      expect(() => {
        registry.register('', MockEC2Inspector);
      }).toThrow('Service type must be a non-empty string');

      expect(() => {
        registry.register(null, MockEC2Inspector);
      }).toThrow('Service type must be a non-empty string');

      expect(() => {
        registry.register(123, MockEC2Inspector);
      }).toThrow('Service type must be a non-empty string');
    });

    test('should throw error for invalid inspector class', () => {
      expect(() => {
        registry.register('Invalid', InvalidInspector);
      }).toThrow('Inspector class must extend BaseInspector');

      expect(() => {
        registry.register('Invalid', null);
      }).toThrow('Inspector class must extend BaseInspector');

      expect(() => {
        registry.register('Invalid', 'not-a-class');
      }).toThrow('Inspector class must extend BaseInspector');
    });

    test('should overwrite existing registration', () => {
      registry.register('EC2', MockEC2Inspector);
      registry.register('EC2', MockRDSInspector); // Overwrite with different class
      
      expect(registry.get('EC2')).toBe(MockRDSInspector);
    });
  });

  describe('get', () => {
    beforeEach(() => {
      registry.register('EC2', MockEC2Inspector);
      registry.register('RDS', MockRDSInspector);
    });

    test('should return registered inspector class', () => {
      expect(registry.get('EC2')).toBe(MockEC2Inspector);
      expect(registry.get('RDS')).toBe(MockRDSInspector);
    });

    test('should be case insensitive', () => {
      expect(registry.get('ec2')).toBe(MockEC2Inspector);
      expect(registry.get('Ec2')).toBe(MockEC2Inspector);
      expect(registry.get('rds')).toBe(MockRDSInspector);
    });

    test('should return null for unregistered service type', () => {
      expect(registry.get('S3')).toBeNull();
      expect(registry.get('NonExistent')).toBeNull();
    });
  });

  describe('createInspector', () => {
    beforeEach(() => {
      registry.register('EC2', MockEC2Inspector);
      registry.register('RDS', MockRDSInspector);
    });

    test('should create inspector instance', () => {
      const inspector = registry.createInspector('EC2');
      
      expect(inspector).toBeInstanceOf(MockEC2Inspector);
      expect(inspector).toBeInstanceOf(BaseInspector);
      expect(inspector.serviceType).toBe('EC2');
    });

    test('should pass options to inspector constructor', () => {
      const options = { timeout: 600000, customOption: 'test' };
      const inspector = registry.createInspector('EC2', options);
      
      expect(inspector.options.timeout).toBe(600000);
      expect(inspector.options.customOption).toBe('test');
    });

    test('should throw error for unregistered service type', () => {
      expect(() => {
        registry.createInspector('S3');
      }).toThrow('No inspector found for service type: S3');
    });

    test('should be case insensitive', () => {
      const inspector = registry.createInspector('ec2');
      expect(inspector).toBeInstanceOf(MockEC2Inspector);
    });
  });

  describe('getRegisteredServiceTypes', () => {
    test('should return array with EC2 inspector when initialized', () => {
      expect(registry.getRegisteredServiceTypes()).toEqual(['EC2']);
    });

    test('should return list of registered service types', () => {
      registry.register('EC2', MockEC2Inspector);
      registry.register('RDS', MockRDSInspector);
      
      const serviceTypes = registry.getRegisteredServiceTypes();
      expect(serviceTypes).toContain('EC2');
      expect(serviceTypes).toContain('RDS');
      expect(serviceTypes).toHaveLength(2);
    });
  });

  describe('getInspectorInfoList', () => {
    beforeEach(() => {
      registry.register('EC2', MockEC2Inspector);
      registry.register('RDS', MockRDSInspector);
    });

    test('should return inspector info for all registered inspectors', () => {
      const infoList = registry.getInspectorInfoList();
      
      expect(infoList).toHaveLength(2);
      
      const ec2Info = infoList.find(info => info.serviceType === 'EC2');
      expect(ec2Info).toBeDefined();
      expect(ec2Info.version).toBe('ec2-inspector-v1.0');
      expect(ec2Info.supportedInspectionTypes).toEqual(['security-groups', 'instances']);
      
      const rdsInfo = infoList.find(info => info.serviceType === 'RDS');
      expect(rdsInfo).toBeDefined();
      expect(rdsInfo.version).toBe('rds-inspector-v1.0');
      expect(rdsInfo.supportedInspectionTypes).toEqual(['instances', 'snapshots']);
    });

    test('should handle errors when getting inspector info', () => {
      // Register a class that will throw error during instantiation
      class ErrorInspector extends BaseInspector {
        constructor() {
          throw new Error('Constructor error');
        }
      }
      
      registry.register('ERROR', ErrorInspector);
      
      const infoList = registry.getInspectorInfoList();
      
      // Should not include the error inspector in the list
      expect(infoList.find(info => info.serviceType === 'ERROR')).toBeUndefined();
    });
  });

  describe('unregister', () => {
    beforeEach(() => {
      registry.register('EC2', MockEC2Inspector);
      registry.register('RDS', MockRDSInspector);
    });

    test('should unregister existing inspector', () => {
      const result = registry.unregister('EC2');
      
      expect(result).toBe(true);
      expect(registry.get('EC2')).toBeNull();
      expect(registry.get('RDS')).toBe(MockRDSInspector); // Should not affect other registrations
    });

    test('should return false for non-existent inspector', () => {
      const result = registry.unregister('S3');
      
      expect(result).toBe(false);
    });

    test('should be case insensitive', () => {
      const result = registry.unregister('ec2');
      
      expect(result).toBe(true);
      expect(registry.get('EC2')).toBeNull();
    });
  });

  describe('clear', () => {
    beforeEach(() => {
      registry.register('EC2', MockEC2Inspector);
      registry.register('RDS', MockRDSInspector);
    });

    test('should clear all registrations', () => {
      registry.clear();
      
      expect(registry.getRegisteredServiceTypes()).toEqual([]);
      expect(registry.get('EC2')).toBeNull();
      expect(registry.get('RDS')).toBeNull();
    });
  });

  describe('isSupported', () => {
    beforeEach(() => {
      registry.register('EC2', MockEC2Inspector);
      registry.register('RDS', MockRDSInspector);
    });

    test('should return true for supported service types', () => {
      expect(registry.isSupported('EC2')).toBe(true);
      expect(registry.isSupported('RDS')).toBe(true);
    });

    test('should return false for unsupported service types', () => {
      expect(registry.isSupported('S3')).toBe(false);
      expect(registry.isSupported('Lambda')).toBe(false);
    });

    test('should be case insensitive', () => {
      expect(registry.isSupported('ec2')).toBe(true);
      expect(registry.isSupported('Ec2')).toBe(true);
      expect(registry.isSupported('rds')).toBe(true);
    });
  });
});