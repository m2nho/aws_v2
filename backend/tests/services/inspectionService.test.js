/**
 * Inspection Service Tests
 * 검사 서비스 핵심 로직 테스트
 * Requirements: 1.3, 1.4, 6.1, 6.2
 */

const inspectionService = require('../../services/inspectionService');
const InspectionStatus = require('../../models/InspectionStatus');
const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');

// AWS SDK 모킹
jest.mock('@aws-sdk/client-sts');

describe('InspectionService', () => {
  let mockSTSClient;
  let mockSend;

  beforeEach(() => {
    // STS 클라이언트 모킹
    mockSend = jest.fn();
    mockSTSClient = {
      send: mockSend
    };
    STSClient.mockImplementation(() => mockSTSClient);

    // 환경 변수 설정
    process.env.AWS_REGION = 'us-east-1';
    
    // 활성 검사 초기화
    inspectionService.activeInspections.clear();
    
    // STS 클라이언트 재설정 (테스트용)
    inspectionService.stsClient = null;
    
    // 기본 STS 응답 모킹 (성공 케이스)
    mockSend.mockResolvedValue({
      Credentials: {
        AccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        SecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        SessionToken: 'session-token-example',
        Expiration: new Date(Date.now() + 3600000)
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    // 활성 검사 정리
    inspectionService.activeInspections.clear();
  });

  afterAll(() => {
    // 모든 타이머 정리
    jest.clearAllTimers();
  });

  describe('startInspection', () => {
    it('should start inspection successfully', async () => {
      const customerId = 'customer-123';
      const serviceType = 'EC2';
      const assumeRoleArn = 'arn:aws:iam::123456789012:role/InspectionRole';

      const result = await inspectionService.startInspection(
        customerId,
        serviceType,
        assumeRoleArn
      );

      expect(result.success).toBe(true);
      expect(result.data.inspectionId).toBeDefined();
      expect(result.data.status).toBe('PENDING');
      expect(result.data.message).toBe('Inspection started successfully');

      // 활성 검사 목록에 추가되었는지 확인
      const inspectionId = result.data.inspectionId;
      expect(inspectionService.activeInspections.has(inspectionId)).toBe(true);
    });

    it('should handle invalid service type', async () => {
      const customerId = 'customer-123';
      const serviceType = 'INVALID_SERVICE';
      const assumeRoleArn = 'arn:aws:iam::123456789012:role/InspectionRole';

      // 비동기 실행이므로 시작은 성공하지만 실행 중 실패할 것
      const result = await inspectionService.startInspection(
        customerId,
        serviceType,
        assumeRoleArn
      );

      expect(result.success).toBe(true);
      
      // 잠시 대기 후 상태 확인
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const status = inspectionService.getInspectionStatus(result.data.inspectionId);
      expect(status.success).toBe(true);
      // 실행 중 실패로 상태가 변경될 수 있음
    });
  });

  describe('assumeRole', () => {
    it('should assume role successfully', async () => {
      const roleArn = 'arn:aws:iam::123456789012:role/InspectionRole';
      const inspectionId = 'inspection-123';

      // STS 응답 모킹 (이미 beforeEach에서 설정됨)
      const result = await inspectionService.assumeRole(roleArn, inspectionId);

      expect(result.accessKeyId).toBe('AKIAIOSFODNN7EXAMPLE');
      expect(result.secretAccessKey).toBe('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
      expect(result.sessionToken).toBe('session-token-example');
      expect(result.roleArn).toBe(roleArn);
      expect(result.region).toBe('us-east-1');

      expect(mockSend).toHaveBeenCalledWith(
        expect.any(AssumeRoleCommand)
      );
    });

    it('should handle assume role failure', async () => {
      const roleArn = 'arn:aws:iam::123456789012:role/InspectionRole';
      const inspectionId = 'inspection-123';

      // STS 오류 모킹
      const error = new Error('Access denied');
      error.name = 'AccessDenied';
      mockSend.mockRejectedValueOnce(error);

      await expect(
        inspectionService.assumeRole(roleArn, inspectionId)
      ).rejects.toThrow('Access denied when assuming role');
    });

    it('should handle invalid role ARN', async () => {
      const roleArn = 'invalid-arn';
      const inspectionId = 'inspection-123';

      const error = new Error('Invalid parameter');
      error.name = 'InvalidParameterValue';
      mockSend.mockRejectedValueOnce(error);

      await expect(
        inspectionService.assumeRole(roleArn, inspectionId)
      ).rejects.toThrow('Invalid role ARN');
    });
  });

  describe('getInspectionStatus', () => {
    it('should return inspection status', () => {
      const inspectionId = 'inspection-123';
      const status = new InspectionStatus({
        inspectionId,
        status: 'IN_PROGRESS'
      });

      inspectionService.activeInspections.set(inspectionId, status);

      const result = inspectionService.getInspectionStatus(inspectionId);

      expect(result.success).toBe(true);
      expect(result.data.inspectionId).toBe(inspectionId);
      expect(result.data.status).toBe('IN_PROGRESS');
    });

    it('should return error for non-existent inspection', () => {
      const inspectionId = 'non-existent';

      const result = inspectionService.getInspectionStatus(inspectionId);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INSPECTION_NOT_FOUND');
    });
  });

  describe('updateInspectionProgress', () => {
    it('should update inspection progress correctly', () => {
      const inspectionId = 'inspection-123';
      const status = new InspectionStatus({
        inspectionId,
        status: 'IN_PROGRESS'
      });

      inspectionService.activeInspections.set(inspectionId, status);

      const steps = [
        { name: 'Step 1', weight: 30 },
        { name: 'Step 2', weight: 40 },
        { name: 'Step 3', weight: 30 }
      ];

      inspectionService.updateInspectionProgress(inspectionId, steps, 1);

      const updatedStatus = inspectionService.activeInspections.get(inspectionId);
      expect(updatedStatus.progress.currentStep).toBe('Step 2');
      expect(updatedStatus.progress.percentage).toBe(30); // 첫 번째 단계 완료
      expect(updatedStatus.progress.completedSteps).toBe(1);
      expect(updatedStatus.progress.totalSteps).toBe(3);
    });
  });

  describe('cancelInspection', () => {
    it('should cancel active inspection', () => {
      const inspectionId = 'inspection-123';
      const status = new InspectionStatus({
        inspectionId,
        status: 'IN_PROGRESS'
      });

      inspectionService.activeInspections.set(inspectionId, status);

      const result = inspectionService.cancelInspection(inspectionId);

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('CANCELLED');

      const updatedStatus = inspectionService.activeInspections.get(inspectionId);
      expect(updatedStatus.status).toBe('FAILED');
      expect(updatedStatus.error).toBe('Inspection cancelled by user');
    });

    it('should not cancel completed inspection', () => {
      const inspectionId = 'inspection-123';
      const status = new InspectionStatus({
        inspectionId,
        status: 'COMPLETED'
      });

      inspectionService.activeInspections.set(inspectionId, status);

      const result = inspectionService.cancelInspection(inspectionId);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INSPECTION_ALREADY_FINISHED');
    });

    it('should return error for non-existent inspection', () => {
      const inspectionId = 'non-existent';

      const result = inspectionService.cancelInspection(inspectionId);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INSPECTION_NOT_FOUND');
    });
  });

  describe('getActiveInspections', () => {
    it('should return list of active inspections', () => {
      const inspection1 = new InspectionStatus({
        inspectionId: 'inspection-1',
        status: 'IN_PROGRESS'
      });

      const inspection2 = new InspectionStatus({
        inspectionId: 'inspection-2',
        status: 'PENDING'
      });

      inspectionService.activeInspections.set('inspection-1', inspection1);
      inspectionService.activeInspections.set('inspection-2', inspection2);

      const result = inspectionService.getActiveInspections();

      expect(result).toHaveLength(2);
      expect(result[0].inspectionId).toBeDefined();
      expect(result[1].inspectionId).toBeDefined();
    });

    it('should return empty array when no active inspections', () => {
      const result = inspectionService.getActiveInspections();
      expect(result).toHaveLength(0);
    });
  });

  describe('cleanupCompletedInspections', () => {
    it('should remove old completed inspections', () => {
      const oldInspection = new InspectionStatus({
        inspectionId: 'old-inspection',
        status: 'COMPLETED'
      });
      
      // 오래된 시간으로 설정
      oldInspection.lastUpdated = Date.now() - 7200000; // 2시간 전

      const recentInspection = new InspectionStatus({
        inspectionId: 'recent-inspection',
        status: 'COMPLETED'
      });

      inspectionService.activeInspections.set('old-inspection', oldInspection);
      inspectionService.activeInspections.set('recent-inspection', recentInspection);

      expect(inspectionService.activeInspections.size).toBe(2);

      inspectionService.cleanupCompletedInspections(3600000); // 1시간

      expect(inspectionService.activeInspections.size).toBe(1);
      expect(inspectionService.activeInspections.has('recent-inspection')).toBe(true);
      expect(inspectionService.activeInspections.has('old-inspection')).toBe(false);
    });

    it('should not remove active inspections', () => {
      const activeInspection = new InspectionStatus({
        inspectionId: 'active-inspection',
        status: 'IN_PROGRESS'
      });
      
      // 오래된 시간으로 설정해도 활성 상태면 제거되지 않아야 함
      activeInspection.lastUpdated = Date.now() - 7200000;

      inspectionService.activeInspections.set('active-inspection', activeInspection);

      inspectionService.cleanupCompletedInspections(3600000);

      expect(inspectionService.activeInspections.size).toBe(1);
      expect(inspectionService.activeInspections.has('active-inspection')).toBe(true);
    });
  });

  describe('getSupportedServiceTypes', () => {
    it('should return supported service types', () => {
      const result = inspectionService.getSupportedServiceTypes();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      
      // EC2는 기본적으로 지원되어야 함
      const ec2Service = result.find(service => service.serviceType === 'EC2');
      expect(ec2Service).toBeDefined();
      expect(ec2Service.inspectorInfo).toBeDefined();
    });
  });

  describe('getServiceHealth', () => {
    it('should return service health information', () => {
      const health = inspectionService.getServiceHealth();

      expect(health.status).toBe('healthy');
      expect(typeof health.activeInspections).toBe('number');
      expect(Array.isArray(health.supportedServices)).toBe(true);
      expect(typeof health.uptime).toBe('number');
      expect(typeof health.timestamp).toBe('number');
    });
  });
});

describe('InspectionService Integration', () => {
  beforeEach(() => {
    // 통합 테스트를 위한 설정
    process.env.AWS_REGION = 'us-east-1';
  });

  it('should handle complete inspection workflow', async () => {
    // 이 테스트는 실제 AWS 호출 없이 전체 워크플로우를 테스트
    const customerId = 'customer-123';
    const serviceType = 'EC2';
    const assumeRoleArn = 'arn:aws:iam::123456789012:role/InspectionRole';

    // 1. 검사 시작
    const startResult = await inspectionService.startInspection(
      customerId,
      serviceType,
      assumeRoleArn
    );

    expect(startResult.success).toBe(true);
    const inspectionId = startResult.data.inspectionId;

    // 2. 상태 확인 (비동기 실행으로 인해 상태가 변경될 수 있음)
    const statusResult = inspectionService.getInspectionStatus(inspectionId);
    expect(statusResult.success).toBe(true);
    expect(['PENDING', 'IN_PROGRESS']).toContain(statusResult.data.status);

    // 3. 활성 검사 목록 확인
    const activeInspections = inspectionService.getActiveInspections();
    expect(activeInspections.length).toBeGreaterThan(0);
    
    const foundInspection = activeInspections.find(
      inspection => inspection.inspectionId === inspectionId
    );
    expect(foundInspection).toBeDefined();
  });
});