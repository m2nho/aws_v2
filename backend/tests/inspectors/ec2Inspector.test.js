/**
 * EC2 Inspector Unit Tests
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

const EC2Inspector = require('../../services/inspectors/ec2/index');
const InspectionFinding = require('../../models/InspectionFinding');

// Mock AWS SDK
jest.mock('@aws-sdk/client-ec2');
const { EC2Client, DescribeInstancesCommand, DescribeSecurityGroupsCommand } = require('@aws-sdk/client-ec2');

describe('EC2Inspector', () => {
  let inspector;
  let mockEC2Client;

  beforeEach(() => {
    inspector = new EC2Inspector();
    mockEC2Client = {
      send: jest.fn()
    };
    EC2Client.mockImplementation(() => mockEC2Client);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor and Basic Properties', () => {
    test('should initialize with correct service type', () => {
      expect(inspector.serviceType).toBe('EC2');
    });

    test('should return correct version', () => {
      expect(inspector.getVersion()).toBe('ec2-inspector-v1.0');
    });

    test('should return supported inspection types', () => {
      const types = inspector.getSupportedInspectionTypes();
      expect(types).toContain('security-groups');
      expect(types).toContain('instance-security');
      expect(types).toContain('network-configuration');
      expect(types).toContain('access-control');
    });
  });

  describe('Security Group Analysis', () => {
    test('should detect overly permissive security group rules', () => {
      const securityGroup = {
        GroupId: 'sg-123456',
        GroupName: 'test-sg',
        Description: 'Test security group',
        VpcId: 'vpc-123456',
        IpPermissions: [
          {
            IpProtocol: 'tcp',
            FromPort: 80,
            ToPort: 80,
            IpRanges: [{ CidrIp: '0.0.0.0/0' }]
          }
        ]
      };

      inspector.checkOverlyPermissiveRules(securityGroup);

      expect(inspector.findings).toHaveLength(1);
      expect(inspector.findings[0].riskLevel).toBe('HIGH');
      expect(inspector.findings[0].issue).toContain('unrestricted access');
    });

    test('should detect SSH access from anywhere', () => {
      const securityGroup = {
        GroupId: 'sg-123456',
        GroupName: 'test-sg',
        Description: 'Test security group',
        VpcId: 'vpc-123456',
        IpPermissions: [
          {
            IpProtocol: 'tcp',
            FromPort: 22,
            ToPort: 22,
            IpRanges: [{ CidrIp: '0.0.0.0/0' }]
          }
        ]
      };

      inspector.checkSSHRDPAccess(securityGroup);

      expect(inspector.findings).toHaveLength(1);
      expect(inspector.findings[0].riskLevel).toBe('CRITICAL');
      expect(inspector.findings[0].issue).toContain('SSH access');
      expect(inspector.findings[0].details.service).toBe('SSH');
    });

    test('should detect RDP access from anywhere', () => {
      const securityGroup = {
        GroupId: 'sg-123456',
        GroupName: 'test-sg',
        Description: 'Test security group',
        VpcId: 'vpc-123456',
        IpPermissions: [
          {
            IpProtocol: 'tcp',
            FromPort: 3389,
            ToPort: 3389,
            IpRanges: [{ CidrIp: '0.0.0.0/0' }]
          }
        ]
      };

      inspector.checkSSHRDPAccess(securityGroup);

      expect(inspector.findings).toHaveLength(1);
      expect(inspector.findings[0].riskLevel).toBe('CRITICAL');
      expect(inspector.findings[0].issue).toContain('RDP access');
      expect(inspector.findings[0].details.service).toBe('RDP');
    });

    test('should detect modified default security group', () => {
      const defaultSecurityGroup = {
        GroupId: 'sg-default',
        GroupName: 'default',
        Description: 'default VPC security group',
        VpcId: 'vpc-123456',
        IpPermissions: [
          {
            IpProtocol: 'tcp',
            FromPort: 80,
            ToPort: 80,
            IpRanges: [{ CidrIp: '10.0.0.0/8' }]
          }
        ]
      };

      inspector.checkDefaultSecurityGroup(defaultSecurityGroup);

      expect(inspector.findings).toHaveLength(1);
      expect(inspector.findings[0].riskLevel).toBe('MEDIUM');
      expect(inspector.findings[0].issue).toContain('Default security group');
    });

    test('should detect security groups without meaningful description', () => {
      const securityGroup = {
        GroupId: 'sg-123456',
        GroupName: 'test-sg',
        Description: '',
        VpcId: 'vpc-123456'
      };

      inspector.checkSecurityGroupDescription(securityGroup);

      expect(inspector.findings).toHaveLength(1);
      expect(inspector.findings[0].riskLevel).toBe('LOW');
      expect(inspector.findings[0].issue).toContain('lacks meaningful description');
    });

    test('should not flag security groups with restricted access', () => {
      const securityGroup = {
        GroupId: 'sg-123456',
        GroupName: 'test-sg',
        Description: 'Test security group',
        VpcId: 'vpc-123456',
        IpPermissions: [
          {
            IpProtocol: 'tcp',
            FromPort: 80,
            ToPort: 80,
            IpRanges: [{ CidrIp: '10.0.0.0/8' }]
          }
        ]
      };

      inspector.checkOverlyPermissiveRules(securityGroup);

      expect(inspector.findings).toHaveLength(0);
    });
  });

  describe('EC2 Instance Analysis', () => {
    test('should detect instances with public IP addresses', () => {
      const instance = {
        InstanceId: 'i-123456',
        InstanceType: 't3.micro',
        State: { Name: 'running' },
        PublicIpAddress: '1.2.3.4',
        PrivateIpAddress: '10.0.1.100'
      };

      inspector.checkPublicIPExposure(instance);

      expect(inspector.findings).toHaveLength(1);
      expect(inspector.findings[0].riskLevel).toBe('MEDIUM');
      expect(inspector.findings[0].issue).toContain('public IP address');
    });

    test('should detect instances allowing IMDSv1', () => {
      const instance = {
        InstanceId: 'i-123456',
        InstanceType: 't3.micro',
        State: { Name: 'running' },
        MetadataOptions: {
          HttpTokens: 'optional',
          HttpEndpoint: 'enabled'
        }
      };

      inspector.checkInstanceMetadataService(instance);

      expect(inspector.findings).toHaveLength(1);
      expect(inspector.findings[0].riskLevel).toBe('HIGH');
      expect(inspector.findings[0].issue).toContain('IMDSv1');
    });

    test('should detect instances without detailed monitoring', () => {
      const instance = {
        InstanceId: 'i-123456',
        InstanceType: 't3.micro',
        State: { Name: 'running' },
        Monitoring: { State: 'disabled' }
      };

      inspector.checkInstanceMonitoring(instance);

      expect(inspector.findings).toHaveLength(1);
      expect(inspector.findings[0].riskLevel).toBe('LOW');
      expect(inspector.findings[0].category).toBe('PERFORMANCE');
    });

    test('should detect unencrypted EBS volumes', () => {
      const instance = {
        InstanceId: 'i-123456',
        InstanceType: 't3.micro',
        State: { Name: 'running' },
        BlockDeviceMappings: [
          {
            DeviceName: '/dev/sda1',
            Ebs: {
              VolumeId: 'vol-123456',
              Encrypted: false
            }
          }
        ]
      };

      inspector.checkEBSEncryption(instance);

      expect(inspector.findings).toHaveLength(1);
      expect(inspector.findings[0].riskLevel).toBe('HIGH');
      expect(inspector.findings[0].issue).toContain('not encrypted');
    });

    test('should not flag instances with proper security configurations', () => {
      const instance = {
        InstanceId: 'i-123456',
        InstanceType: 't3.micro',
        State: { Name: 'running' },
        PrivateIpAddress: '10.0.1.100',
        MetadataOptions: {
          HttpTokens: 'required',
          HttpEndpoint: 'enabled'
        },
        Monitoring: { State: 'enabled' },
        BlockDeviceMappings: [
          {
            DeviceName: '/dev/sda1',
            Ebs: {
              VolumeId: 'vol-123456',
              Encrypted: true
            }
          }
        ]
      };

      inspector.checkPublicIPExposure(instance);
      inspector.checkInstanceMetadataService(instance);
      inspector.checkInstanceMonitoring(instance);
      inspector.checkEBSEncryption(instance);

      expect(inspector.findings).toHaveLength(0);
    });
  });

  describe('Instance-Security Group Relationships', () => {
    test('should detect unused security groups', async () => {
      const instances = [
        {
          InstanceId: 'i-123456',
          SecurityGroups: [{ GroupId: 'sg-used' }]
        }
      ];

      const securityGroups = [
        { GroupId: 'sg-used', GroupName: 'used-sg' },
        { GroupId: 'sg-unused', GroupName: 'unused-sg' }
      ];

      await inspector.analyzeInstanceSecurityRelationships(instances, securityGroups);

      const unusedSgFindings = inspector.findings.filter(f => 
        f.issue.includes('not attached to any instances')
      );
      expect(unusedSgFindings).toHaveLength(1);
      expect(unusedSgFindings[0].riskLevel).toBe('LOW');
    });

    test('should detect instances with too many security groups', async () => {
      const instances = [
        {
          InstanceId: 'i-123456',
          SecurityGroups: [
            { GroupId: 'sg-1' },
            { GroupId: 'sg-2' },
            { GroupId: 'sg-3' },
            { GroupId: 'sg-4' },
            { GroupId: 'sg-5' },
            { GroupId: 'sg-6' }
          ]
        }
      ];

      const securityGroups = [];

      await inspector.analyzeInstanceSecurityRelationships(instances, securityGroups);

      const tooManySgFindings = inspector.findings.filter(f => 
        f.issue.includes('security groups attached')
      );
      expect(tooManySgFindings).toHaveLength(1);
      expect(tooManySgFindings[0].category).toBe('RELIABILITY');
    });
  });

  describe('Network Accessibility Analysis', () => {
    test('should detect dangerous port combinations on public instances', async () => {
      const instances = [
        {
          InstanceId: 'i-123456',
          PublicIpAddress: '1.2.3.4',
          SecurityGroups: [{ GroupId: 'sg-123456' }]
        }
      ];

      const securityGroups = [
        {
          GroupId: 'sg-123456',
          IpPermissions: [
            {
              IpProtocol: 'tcp',
              FromPort: 3306,
              ToPort: 3306,
              IpRanges: [{ CidrIp: '0.0.0.0/0' }]
            }
          ]
        }
      ];

      await inspector.analyzeNetworkAccessibility(instances, securityGroups);

      const dangerousPortFindings = inspector.findings.filter(f => 
        f.issue.includes('MySQL access')
      );
      expect(dangerousPortFindings).toHaveLength(1);
      expect(dangerousPortFindings[0].riskLevel).toBe('CRITICAL');
    });
  });

  describe('AWS API Integration', () => {
    test('should handle getSecurityGroups successfully', async () => {
      const mockSecurityGroups = [
        {
          GroupId: 'sg-123456',
          GroupName: 'test-sg',
          Description: 'Test security group'
        }
      ];

      // Initialize the EC2 client for the inspector
      inspector.ec2Client = mockEC2Client;
      
      mockEC2Client.send.mockResolvedValue({
        SecurityGroups: mockSecurityGroups
      });

      const result = await inspector.getSecurityGroups();

      expect(result).toEqual(mockSecurityGroups);
      expect(mockEC2Client.send).toHaveBeenCalledWith(
        expect.any(DescribeSecurityGroupsCommand)
      );
    });

    test('should handle getEC2Instances successfully', async () => {
      const mockInstances = [
        {
          InstanceId: 'i-123456',
          InstanceType: 't3.micro',
          State: { Name: 'running' }
        }
      ];

      // Initialize the EC2 client for the inspector
      inspector.ec2Client = mockEC2Client;

      mockEC2Client.send.mockResolvedValue({
        Reservations: [
          {
            Instances: mockInstances
          }
        ]
      });

      const result = await inspector.getEC2Instances();

      expect(result).toEqual(mockInstances);
      expect(mockEC2Client.send).toHaveBeenCalledWith(
        expect.any(DescribeInstancesCommand)
      );
    });

    test('should handle API errors gracefully', async () => {
      // Initialize the EC2 client for the inspector
      inspector.ec2Client = mockEC2Client;
      
      mockEC2Client.send.mockRejectedValue(new Error('API Error'));

      const result = await inspector.getSecurityGroups();

      expect(result).toEqual([]);
      expect(inspector.errors).toHaveLength(1);
    });
  });

  describe('Service-Specific Recommendations', () => {
    test('should generate security group recommendations', () => {
      // Add a security group finding
      const finding = InspectionFinding.createSecurityGroupFinding(
        { GroupId: 'sg-123', GroupName: 'test' },
        'Test issue',
        'Test recommendation'
      );
      inspector.addFinding(finding);

      const recommendations = inspector.getServiceSpecificRecommendations();

      expect(recommendations).toContain(
        '보안 그룹 규칙을 정기적으로 검토하고 최소 권한 원칙을 적용하세요.'
      );
    });

    test('should generate public IP recommendations', () => {
      // Add a public IP finding
      const finding = new InspectionFinding({
        resourceId: 'i-123',
        resourceType: 'EC2Instance',
        riskLevel: 'MEDIUM',
        issue: 'Instance has a public IP address',
        recommendation: 'Use private subnets'
      });
      inspector.addFinding(finding);

      const recommendations = inspector.getServiceSpecificRecommendations();

      expect(recommendations).toContain(
        '가능한 한 프라이빗 서브넷을 사용하고 NAT Gateway를 통해 인터넷 접근을 제어하세요.'
      );
    });

    test('should generate encryption recommendations', () => {
      // Add an encryption finding
      const finding = new InspectionFinding({
        resourceId: 'vol-123',
        resourceType: 'EBSVolume',
        riskLevel: 'HIGH',
        issue: 'Volume is not encrypted',
        recommendation: 'Enable encryption'
      });
      inspector.addFinding(finding);

      const recommendations = inspector.getServiceSpecificRecommendations();

      expect(recommendations).toContain(
        '모든 EBS 볼륨에 대해 암호화를 활성화하여 데이터를 보호하세요.'
      );
    });
  });

  describe('Error Handling', () => {
    test('should record errors during analysis', () => {
      const error = new Error('Test error');
      inspector.recordError(error, { operation: 'test' });

      expect(inspector.errors).toHaveLength(1);
      expect(inspector.errors[0].message).toBe('Test error');
      expect(inspector.errors[0].context.operation).toBe('test');
    });

    test('should handle missing security group permissions', () => {
      const securityGroup = {
        GroupId: 'sg-123456',
        GroupName: 'test-sg',
        Description: 'Test security group',
        VpcId: 'vpc-123456'
        // IpPermissions is missing
      };

      // Should not throw error
      expect(() => {
        inspector.checkOverlyPermissiveRules(securityGroup);
        inspector.checkSSHRDPAccess(securityGroup);
      }).not.toThrow();

      expect(inspector.findings).toHaveLength(0);
    });

    test('should handle missing instance metadata options', () => {
      const instance = {
        InstanceId: 'i-123456',
        InstanceType: 't3.micro',
        State: { Name: 'running' }
        // MetadataOptions is missing
      };

      inspector.checkInstanceMetadataService(instance);

      expect(inspector.findings).toHaveLength(1);
      expect(inspector.findings[0].issue).toContain('metadata service configuration is not available');
    });
  });

  describe('Integration with Base Inspector', () => {
    test('should properly initialize with base inspector features', () => {
      expect(inspector.serviceType).toBe('EC2');
      expect(inspector.findings).toEqual([]);
      expect(inspector.errors).toEqual([]);
      expect(inspector.metadata).toBeDefined();
    });

    test('should properly add findings using base inspector method', () => {
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

    test('should increment resource count', () => {
      expect(inspector.metadata.resourcesScanned).toBe(0);
      
      inspector.incrementResourceCount(5);
      
      expect(inspector.metadata.resourcesScanned).toBe(5);
    });
  });
});