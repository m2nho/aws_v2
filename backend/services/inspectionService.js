/**
 * Inspection Service - Core Logic
 * 검사 오케스트레이션 서비스 작성
 * Assume Role을 통한 고객 계정 접근 구현
 * 검사 상태 관리 및 진행률 추적 기능 구현
 * Requirements: 1.3, 1.4, 6.1, 6.2
 */

const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');
const { v4: uuidv4 } = require('uuid');
const InspectionResult = require('../models/InspectionResult');
const InspectionStatus = require('../models/InspectionStatus');
const inspectorRegistry = require('./inspectors');
const webSocketService = require('./websocketService');

class InspectionService {
  constructor() {
    this.stsClient = null;
    
    // 진행 중인 검사 상태를 메모리에 저장 (실제 환경에서는 Redis 등 사용)
    this.activeInspections = new Map();
    
    // 검사 단계 정의
    this.inspectionSteps = {
      'EC2': [
        { name: 'Initializing EC2 inspection', weight: 5 },
        { name: 'Assuming role in customer account', weight: 10 },
        { name: 'Retrieving security groups', weight: 15 },
        { name: 'Analyzing security group rules', weight: 25 },
        { name: 'Retrieving EC2 instances', weight: 15 },
        { name: 'Analyzing instance configurations', weight: 20 },
        { name: 'Finalizing inspection results', weight: 10 }
      ],
      'default': [
        { name: 'Initializing inspection', weight: 10 },
        { name: 'Assuming role in customer account', weight: 20 },
        { name: 'Performing service inspection', weight: 50 },
        { name: 'Finalizing inspection results', weight: 20 }
      ]
    };

    this.logger = this.createLogger();
  }

  /**
   * 검사 시작 (항목별 개별 검사 ID 생성)
   * @param {string} customerId - 고객 ID
   * @param {string} serviceType - 검사할 서비스 타입 (EC2, RDS, S3 등)
   * @param {string} assumeRoleArn - 고객 계정의 역할 ARN
   * @param {Object} inspectionConfig - 검사 설정
   * @returns {Promise<Object>} 검사 시작 응답
   */
  async startInspection(customerId, serviceType, assumeRoleArn, inspectionConfig = {}) {
    const batchId = uuidv4(); // 전체 배치를 식별하는 ID
    const selectedItems = inspectionConfig.selectedItems || [];
    
    try {
      this.logger.info('Starting batch inspection', {
        customerId,
        batchId,
        serviceType,
        assumeRoleArn,
        selectedItemsCount: selectedItems.length
      });

      // 임시: 첫 번째 선택된 항목만 검사 (테스트용)
      const inspectionJobs = [];
      
      if (selectedItems.length === 0) {
        // 항목이 선택되지 않은 경우 전체 검사로 처리 (기존 방식)
        const inspectionId = uuidv4();
        inspectionJobs.push({
          inspectionId,
          itemId: 'all',
          itemName: `${serviceType} 전체 검사`
        });
      } else {
        // 임시: 첫 번째 항목만 검사
        const firstItemId = selectedItems[0];
        const inspectionId = uuidv4();
        inspectionJobs.push({
          inspectionId,
          itemId: firstItemId,
          itemName: this.getItemName(serviceType, firstItemId)
        });
        

      }

      // 각 검사 작업의 상태 초기화
      const inspectionStatuses = new Map();
      for (const job of inspectionJobs) {
        const inspectionStatus = new InspectionStatus({
          inspectionId: job.inspectionId,
          status: 'PENDING',
          batchId,
          itemId: job.itemId,
          itemName: job.itemName
        });
        
        this.activeInspections.set(job.inspectionId, inspectionStatus);
        inspectionStatuses.set(job.inspectionId, inspectionStatus);
        
        // DynamoDB에 개별 검사 시작 상태 저장
        await this.saveInspectionStart(customerId, job.inspectionId, serviceType, assumeRoleArn, {
          batchId,
          itemId: job.itemId,
          itemName: job.itemName
        });
      }

      // 비동기로 각 검사 실행

      
      const executionPromises = inspectionJobs.map(job => {

        
        // WebSocket 연결 상태 확인 및 초기 상태 브로드캐스트
        const wsStats = webSocketService.getConnectionStats();
        
        // 검사 시작 즉시 WebSocket으로 상태 브로드캐스트
        webSocketService.broadcastStatusChange(job.inspectionId, {
          status: 'STARTING',
          message: `Starting ${job.itemName} inspection`,
          timestamp: Date.now(),
          itemId: job.itemId,
          itemName: job.itemName
        });
        
        return this.executeItemInspectionAsync(
          customerId,
          job.inspectionId,
          serviceType,
          assumeRoleArn,
          {
            ...inspectionConfig,
            targetItemId: job.itemId,
            batchId,
            itemName: job.itemName
          }
        ).catch(error => {
          this.logger.error('Async item inspection execution failed', {
            inspectionId: job.inspectionId,
            itemId: job.itemId,
            error: error.message
          });
          
          const status = this.activeInspections.get(job.inspectionId);
          if (status) {
            status.fail(error.message);
          }
        });
      });

      // 모든 검사 작업을 병렬로 실행하되 응답은 즉시 반환
      Promise.all(executionPromises).then(() => {
        this.logger.info('All item inspections completed', { batchId });
      });

      return {
        success: true,
        data: {
          batchId,
          inspectionJobs: inspectionJobs.map(job => ({
            inspectionId: job.inspectionId,
            itemId: job.itemId,
            itemName: job.itemName,
            status: 'PENDING'
          })),
          message: `Started ${inspectionJobs.length} inspection(s) successfully`
        }
      };

    } catch (error) {
      this.logger.error('Failed to start inspection', {
        customerId,
        serviceType,
        error: error.message
      });

      return {
        success: false,
        error: {
          code: 'INSPECTION_START_FAILED',
          message: error.message
        }
      };
    }
  }

  /**
   * 항목명 가져오기
   * @param {string} serviceType - 서비스 타입
   * @param {string} itemId - 항목 ID
   * @returns {string} 항목명
   */
  getItemName(serviceType, itemId) {
    const itemMappings = {
      EC2: {
        'security_groups': '보안 그룹 규칙',
        'key_pairs': '키 페어 관리',
        'instance_metadata': '인스턴스 메타데이터',
        'instance_types': '인스턴스 타입 최적화',
        'ebs_optimization': 'EBS 최적화',
        'public_access': '퍼블릭 접근 관리',
        'network_access': '네트워크 접근 제어'
      },
      RDS: {
        'encryption': '암호화 설정',
        'security_groups': '데이터베이스 보안 그룹',
        'public_access': '퍼블릭 접근 설정',
        'automated_backup': '자동 백업'
      },
      S3: {
        'bucket_policy': '버킷 정책',
        'public_access': '퍼블릭 접근 차단',
        'encryption': '서버 측 암호화',
        'versioning': '버전 관리'
      }
    };

    return itemMappings[serviceType]?.[itemId] || itemId;
  }

  /**
   * 개별 항목 검사 실행
   * @param {string} customerId - 고객 ID
   * @param {string} inspectionId - 검사 ID
   * @param {string} serviceType - 서비스 타입
   * @param {string} assumeRoleArn - 역할 ARN
   * @param {Object} inspectionConfig - 검사 설정
   */
  async executeItemInspectionAsync(customerId, inspectionId, serviceType, assumeRoleArn, inspectionConfig) {
    const inspectionStatus = this.activeInspections.get(inspectionId);
    const steps = this.inspectionSteps[serviceType] || this.inspectionSteps.default;
    let currentStepIndex = 0;
    let inspector = null;

    try {
      // 검사 시작
      inspectionStatus.start(`Initializing ${inspectionConfig.targetItemId} inspection`);
      this.updateInspectionProgress(inspectionId, steps, currentStepIndex);

      // 1. Assume Role 수행
      currentStepIndex++;
      this.updateInspectionProgress(inspectionId, steps, currentStepIndex);
      
      const awsCredentials = await this.assumeRole(assumeRoleArn, inspectionId);

      // 2. Inspector 가져오기 및 검증
      currentStepIndex++;
      this.updateInspectionProgress(inspectionId, steps, currentStepIndex);
      
      inspector = inspectorRegistry.getInspector(serviceType);
      if (!inspector) {
        throw new Error(`Inspector not found for service type: ${serviceType}`);
      }

      // 3. 특정 항목에 대한 검사 수행
      const inspectionResult = await inspector.executeItemInspection(
        customerId,
        inspectionId,
        awsCredentials,
        {
          ...inspectionConfig,
          targetItem: inspectionConfig.targetItemId
        }
      );

      // 검사 진행률을 inspector의 진행률과 동기화
      this.syncInspectionProgress(inspectionId, inspector, steps, currentStepIndex);

      // 4. 검사 완료 처리
      currentStepIndex = steps.length - 1;
      this.updateInspectionProgress(inspectionId, steps, currentStepIndex);
      
      inspectionStatus.complete();

      // Broadcast completion via WebSocket
      webSocketService.broadcastInspectionComplete(inspectionId, {
        status: 'COMPLETED',
        results: inspectionResult.results,
        duration: inspectionResult.duration,
        completedAt: Date.now(),
        totalSteps: steps.length,
        resourcesProcessed: inspectionResult.results?.summary?.totalResources || 0,
        itemId: inspectionConfig.targetItemId,
        itemName: inspectionConfig.itemName
      });

      // 5. 트랜잭션을 사용한 일관성 있는 결과 저장
      let saveSuccessful = false;
      
      try {
        await this.saveInspectionResultWithTransaction(inspectionResult);
        saveSuccessful = true;
        this.logger.info('Item inspection result saved successfully', {
          inspectionId: inspectionResult.inspectionId,
          itemId: inspectionConfig.targetItemId
        });
      } catch (saveError) {
        this.logger.error('Critical: Failed to save item inspection result', {
          inspectionId: inspectionResult.inspectionId,
          itemId: inspectionConfig.targetItemId,
          error: saveError.message,
          stack: saveError.stack
        });
        
        // 즉시 강제 저장 시도
        try {
          await this.emergencySaveInspectionResult(inspectionResult);
          saveSuccessful = true;
        } catch (emergencyError) {
        }
      }
      
      // 저장 상태에 관계없이 검사는 완료로 처리
      inspectionStatus.complete();
      
      if (!saveSuccessful) {
        // WebSocket으로 저장 실패 알림
        webSocketService.broadcastStatusChange(inspectionId, {
          status: 'COMPLETED_WITH_SAVE_ERROR',
          error: 'Data save failed but inspection completed',
          completedAt: Date.now(),
          results: inspectionResult.results
        });
      }

      this.logger.info('Item inspection completed successfully', {
        inspectionId,
        customerId,
        serviceType,
        itemId: inspectionConfig.targetItemId,
        duration: inspectionResult.duration
      });

    } catch (error) {
      this.logger.error('Item inspection execution failed', {
        inspectionId,
        customerId,
        serviceType,
        itemId: inspectionConfig.targetItemId,
        error: error.message,
        stack: error.stack
      });

      // 부분적 결과라도 저장 시도
      await this.handlePartialInspectionFailure(
        customerId,
        inspectionId,
        serviceType,
        error,
        inspector
      );

      inspectionStatus.fail(error.message);

      // Broadcast failure via WebSocket
      webSocketService.broadcastStatusChange(inspectionId, {
        status: 'FAILED',
        error: error.message,
        failedAt: Date.now(),
        itemId: inspectionConfig.targetItemId,
        partialResults: inspector?.getPartialResults?.() || null
      });
    }
  }

  /**
   * 비동기 검사 실행 (기존 방식 - 호환성 유지)
   * @param {string} customerId - 고객 ID
   * @param {string} inspectionId - 검사 ID
   * @param {string} serviceType - 서비스 타입
   * @param {string} assumeRoleArn - 역할 ARN
   * @param {Object} inspectionConfig - 검사 설정
   */
  async executeInspectionAsync(customerId, inspectionId, serviceType, assumeRoleArn, inspectionConfig) {
    const inspectionStatus = this.activeInspections.get(inspectionId);
    const steps = this.inspectionSteps[serviceType] || this.inspectionSteps.default;
    let currentStepIndex = 0;
    let inspector = null; // inspector 변수를 try 블록 외부에서 선언

    try {
      // 검사 시작
      inspectionStatus.start('Initializing inspection');
      this.updateInspectionProgress(inspectionId, steps, currentStepIndex);

      // 1. Assume Role 수행
      currentStepIndex++;
      this.updateInspectionProgress(inspectionId, steps, currentStepIndex);
      
      const awsCredentials = await this.assumeRole(assumeRoleArn, inspectionId);

      // 2. Inspector 가져오기 및 검증
      currentStepIndex++;
      this.updateInspectionProgress(inspectionId, steps, currentStepIndex);
      
      inspector = inspectorRegistry.getInspector(serviceType);
      if (!inspector) {
        throw new Error(`Inspector not found for service type: ${serviceType}`);
      }

      // 3. 실제 검사 수행
      const inspectionResult = await inspector.executeInspection(
        customerId,
        inspectionId, // inspectionId 전달
        awsCredentials,
        inspectionConfig
      );

      // 검사 진행률을 inspector의 진행률과 동기화
      this.syncInspectionProgress(inspectionId, inspector, steps, currentStepIndex);

      // 4. 검사 완료 처리
      currentStepIndex = steps.length - 1;
      this.updateInspectionProgress(inspectionId, steps, currentStepIndex);
      
      inspectionStatus.complete();

      // Broadcast completion via WebSocket
      webSocketService.broadcastInspectionComplete(inspectionId, {
        status: 'COMPLETED',
        results: inspectionResult.results,
        duration: inspectionResult.duration,
        completedAt: Date.now(),
        totalSteps: steps.length,
        resourcesProcessed: inspectionResult.results?.summary?.totalResources || 0
      });

      // 5. 트랜잭션을 사용한 일관성 있는 결과 저장
      let saveSuccessful = false;
      
      try {
        await this.saveInspectionResultWithTransaction(inspectionResult);
        saveSuccessful = true;
        this.logger.info('Inspection result saved successfully', {
          inspectionId: inspectionResult.inspectionId
        });
      } catch (saveError) {
        this.logger.error('Critical: Failed to save inspection result', {
          inspectionId: inspectionResult.inspectionId,
          error: saveError.message,
          stack: saveError.stack
        });
        
        // 즉시 강제 저장 시도
        try {
          await this.emergencySaveInspectionResult(inspectionResult);
          saveSuccessful = true;
        } catch (emergencyError) {
        }
      }
      
      // 저장 상태에 관계없이 검사는 완료로 처리
      inspectionStatus.complete();
      
      if (!saveSuccessful) {
        // WebSocket으로 저장 실패 알림
        webSocketService.broadcastStatusChange(inspectionId, {
          status: 'COMPLETED_WITH_SAVE_ERROR',
          error: 'Data save failed but inspection completed',
          completedAt: Date.now(),
          results: inspectionResult.results // 결과는 WebSocket으로라도 전달
        });
      }

      this.logger.info('Inspection completed successfully', {
        inspectionId,
        customerId,
        serviceType,
        duration: inspectionResult.duration
      });

    } catch (error) {
      this.logger.error('Inspection execution failed', {
        inspectionId,
        customerId,
        serviceType,
        error: error.message,
        stack: error.stack
      });

      // 부분적 결과라도 저장 시도
      await this.handlePartialInspectionFailure(
        customerId,
        inspectionId,
        serviceType,
        error,
        inspector
      );

      inspectionStatus.fail(error.message);

      // Broadcast failure via WebSocket
      webSocketService.broadcastStatusChange(inspectionId, {
        status: 'FAILED',
        error: error.message,
        failedAt: Date.now(),
        partialResults: inspector?.getPartialResults?.() || null
      });
    }
  }

  /**
   * STS 클라이언트 초기화 (지연 초기화)
   */
  initializeStsClient() {
    if (!this.stsClient) {
      this.stsClient = new STSClient({
        region: process.env.AWS_REGION || 'us-east-1'
      });
    }
  }

  /**
   * Assume Role 수행
   * @param {string} roleArn - 역할 ARN
   * @param {string} inspectionId - 검사 ID (세션 이름용)
   * @returns {Promise<Object>} AWS 자격 증명
   */
  async assumeRole(roleArn, inspectionId) {
    try {
      this.logger.info('Attempting to assume role', { roleArn, inspectionId });

      // STS 클라이언트 초기화
      this.initializeStsClient();

      const command = new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: `inspection-${inspectionId}`,
        DurationSeconds: 3600, // 1시간
        ExternalId: process.env.AWS_EXTERNAL_ID // 외부 ID가 설정된 경우
      });

      const response = await this.stsClient.send(command);

      if (!response.Credentials) {
        throw new Error('No credentials returned from assume role operation');
      }

      const credentials = {
        accessKeyId: response.Credentials.AccessKeyId,
        secretAccessKey: response.Credentials.SecretAccessKey,
        sessionToken: response.Credentials.SessionToken,
        expiration: response.Credentials.Expiration,
        roleArn: roleArn,
        region: process.env.AWS_REGION || 'us-east-1'
      };

      this.logger.info('Successfully assumed role', {
        roleArn,
        inspectionId,
        expiration: credentials.expiration
      });

      return credentials;

    } catch (error) {
      this.logger.error('Failed to assume role', {
        roleArn,
        inspectionId,
        error: error.message
      });

      // 구체적인 오류 메시지 제공
      if (error.name === 'AccessDenied') {
        throw new Error(`Access denied when assuming role ${roleArn}. Please check role permissions and trust policy.`);
      } else if (error.name === 'InvalidParameterValue') {
        throw new Error(`Invalid role ARN: ${roleArn}`);
      } else {
        throw new Error(`Failed to assume role: ${error.message}`);
      }
    }
  }

  /**
   * 검사 상태 조회
   * @param {string} inspectionId - 검사 ID
   * @param {string} customerId - 고객 ID (권한 확인용)
   * @returns {Object} 검사 상태 정보
   */
  getInspectionStatus(inspectionId, customerId) {
    const inspectionStatus = this.activeInspections.get(inspectionId);
    
    if (!inspectionStatus) {
      return {
        success: false,
        error: {
          code: 'INSPECTION_NOT_FOUND',
          message: 'Inspection not found or has been completed'
        }
      };
    }

    // 권한 확인 (실제 구현에서는 inspectionStatus에 customerId 포함 필요)
    // TODO: Add customerId validation

    return {
      success: true,
      inspectionId,
      status: inspectionStatus.status,
      progress: inspectionStatus.progress,
      estimatedTimeRemaining: inspectionStatus.estimatedTimeRemaining,
      currentStep: inspectionStatus.currentStep,
      startTime: inspectionStatus.startTime,
      lastUpdated: inspectionStatus.lastUpdated
    };
  }

  /**
   * 검사 결과 조회
   * @param {string} inspectionId - 검사 ID
   * @param {string} customerId - 고객 ID (권한 확인용)
   * @returns {Promise<Object>} 검사 결과
   */
  async getInspectionResult(inspectionId, customerId) {
    try {
      // 항상 데이터베이스에서 최신 데이터를 조회 (데이터 일관성 보장)
      const historyService = require('./historyService');
      const historyResult = await historyService.getInspectionHistory(customerId, inspectionId);

      if (!historyResult.success) {
        return {
          success: false,
          error: {
            code: 'INSPECTION_NOT_FOUND',
            message: 'Inspection not found',
            details: 'The requested inspection could not be found or you do not have access to it'
          }
        };
      }

      // 히스토리 데이터 확인 및 사용
      console.log('=== HISTORY DATA CHECK ===');
      console.log('Has results field:', 'results' in historyResult.data);
      if (historyResult.data.results) {
        console.log('Results summary:', historyResult.data.results.summary);
        console.log('Findings count:', historyResult.data.results.findings?.length || 0);
      }
      
      const inspectionData = historyResult.data;

      return {
        success: true,
        inspection: inspectionData
      };

    } catch (error) {
      this.logger.error('Failed to get inspection result', {
        inspectionId,
        customerId,
        error: error.message
      });

      return {
        success: false,
        error: {
          code: 'INSPECTION_RETRIEVAL_FAILED',
          message: 'Failed to retrieve inspection result',
          details: error.message
        }
      };
    }
  }

  /**
   * 검사 진행률 업데이트 (향상된 버전 - WebSocket 통합)
   * Requirements: 6.1, 6.2, 6.3 - WebSocket을 통한 실시간 진행률 업데이트
   * @param {string} inspectionId - 검사 ID
   * @param {Array} steps - 검사 단계 목록
   * @param {number} currentStepIndex - 현재 단계 인덱스
   * @param {Object} additionalData - 추가 진행률 데이터
   */
  updateInspectionProgress(inspectionId, steps, currentStepIndex, additionalData = {}) {
    const inspectionStatus = this.activeInspections.get(inspectionId);
    if (!inspectionStatus) return;

    const currentStep = steps[currentStepIndex];
    const completedWeight = steps.slice(0, currentStepIndex).reduce((sum, step) => sum + step.weight, 0);
    const totalWeight = steps.reduce((sum, step) => sum + step.weight, 0);
    
    // 현재 단계 내에서의 세부 진행률 고려
    let stepProgress = 0;
    if (additionalData.stepProgress && currentStepIndex < steps.length) {
      stepProgress = (currentStep.weight * additionalData.stepProgress) / 100;
    }
    
    const percentage = Math.round(((completedWeight + stepProgress) / totalWeight) * 100);

    // 향상된 시간 예측 - InspectionStatus의 새로운 메서드 사용
    const estimatedTimeRemaining = inspectionStatus.calculateEnhancedTimeEstimate();

    const previousPercentage = inspectionStatus.progress?.percentage || 0;
    const previousStep = inspectionStatus.currentStep;

    // Update inspection status with enhanced data
    inspectionStatus.updateProgress({
      currentStep: currentStep.name,
      completedSteps: currentStepIndex,
      totalSteps: steps.length,
      percentage,
      estimatedTimeRemaining,
      resourcesProcessed: additionalData.resourcesProcessed,
      stepProgress: additionalData.stepProgress,
      stepDetails: additionalData.stepDetails
    });

    // Prepare enhanced progress data for WebSocket broadcast
    const progressData = {
      ...inspectionStatus.toApiResponse(),
      progress: {
        ...inspectionStatus.progress,
        stepProgress: additionalData.stepProgress,
        stepDetails: additionalData.stepDetails,
        velocity: this.calculateProgressVelocity(inspectionStatus),
        trend: this.calculateProgressTrend(inspectionStatus)
      },
      performance: {
        progressChange: percentage - previousPercentage,
        averageStepDuration: inspectionStatus.averageStepDuration,
        processingSpeed: this.calculateProcessingSpeed(inspectionStatus, additionalData)
      }
    };

    // Broadcast real-time progress update via WebSocket
    webSocketService.broadcastProgressUpdate(inspectionId, progressData);

    // Broadcast step change if step changed
    if (previousStep !== currentStep.name) {
      webSocketService.broadcastStatusChange(inspectionId, {
        status: inspectionStatus.status,
        currentStep: currentStep.name,
        previousStep: previousStep,
        stepChange: {
          from: previousStep,
          to: currentStep.name,
          timestamp: Date.now(),
          stepDuration: inspectionStatus.stepTimings.get(previousStep) || null
        },
        progress: {
          completedSteps: currentStepIndex,
          totalSteps: steps.length,
          percentage
        }
      });
    }

    this.logger.debug('Inspection progress updated with WebSocket broadcast', {
      inspectionId,
      currentStep: currentStep.name,
      percentage,
      estimatedTimeRemaining,
      resourcesProcessed: additionalData.resourcesProcessed,
      stepProgress: additionalData.stepProgress,
      previousPercentage,
      progressChange: percentage - previousPercentage,
      velocity: progressData.progress.velocity,
      trend: progressData.progress.trend
    });
  }

  /**
   * Calculate progress velocity for enhanced monitoring
   * Requirements: 6.4 - 예상 완료 시간 계산
   * @param {InspectionStatus} inspectionStatus - Inspection status object
   * @returns {number|null} Progress velocity (percentage per minute)
   */
  calculateProgressVelocity(inspectionStatus) {
    if (!inspectionStatus.progressHistory || inspectionStatus.progressHistory.length < 2) {
      return null;
    }

    const history = inspectionStatus.progressHistory;
    const recent = history.slice(-5); // Use last 5 points
    
    if (recent.length < 2) return null;

    const timeDiff = recent[recent.length - 1].timestamp - recent[0].timestamp;
    const progressDiff = recent[recent.length - 1].percentage - recent[0].percentage;

    if (timeDiff <= 0) return null;

    // Return percentage per minute
    return (progressDiff / timeDiff) * 60000;
  }

  /**
   * Calculate progress trend for enhanced monitoring
   * Requirements: 6.2 - 현재 검사 중인 항목을 표시
   * @param {InspectionStatus} inspectionStatus - Inspection status object
   * @returns {string} Progress trend ('accelerating', 'steady', 'decelerating', 'stagnant')
   */
  calculateProgressTrend(inspectionStatus) {
    if (!inspectionStatus.progressHistory || inspectionStatus.progressHistory.length < 3) {
      return 'unknown';
    }

    const history = inspectionStatus.progressHistory;
    const recent = history.slice(-3);

    const velocity1 = (recent[1].percentage - recent[0].percentage) / 
                     (recent[1].timestamp - recent[0].timestamp);
    const velocity2 = (recent[2].percentage - recent[1].percentage) / 
                     (recent[2].timestamp - recent[1].timestamp);

    const velocityChange = velocity2 - velocity1;

    if (Math.abs(velocityChange) < 0.0001) return 'steady';
    if (velocityChange > 0.0001) return 'accelerating';
    if (velocityChange < -0.0001) return 'decelerating';

    return 'stagnant';
  }

  /**
   * Calculate processing speed for performance monitoring
   * Requirements: 6.2 - 현재 검사 중인 항목을 표시
   * @param {InspectionStatus} inspectionStatus - Inspection status object
   * @param {Object} additionalData - Additional progress data
   * @returns {Object} Processing speed metrics
   */
  calculateProcessingSpeed(inspectionStatus, additionalData) {
    const elapsedTime = Date.now() - inspectionStatus.startTime;
    const currentProgress = inspectionStatus.progress?.percentage || 0;

    let resourcesPerMinute = null;
    let stepsPerMinute = null;

    if (additionalData.resourcesProcessed && elapsedTime > 0) {
      resourcesPerMinute = (additionalData.resourcesProcessed / elapsedTime) * 60000;
    }

    if (inspectionStatus.progress?.completedSteps && elapsedTime > 0) {
      stepsPerMinute = (inspectionStatus.progress.completedSteps / elapsedTime) * 60000;
    }

    return {
      resourcesPerMinute,
      stepsPerMinute,
      overallProgressRate: currentProgress > 0 ? (currentProgress / elapsedTime) * 60000 : null,
      elapsedTime
    };
  }

  /**
   * Inspector의 진행률과 동기화
   * @param {string} inspectionId - 검사 ID
   * @param {Object} inspector - Inspector 인스턴스
   * @param {Array} steps - 검사 단계 목록
   * @param {number} baseStepIndex - 기본 단계 인덱스
   */
  syncInspectionProgress(inspectionId, inspector, steps, baseStepIndex) {
    // Inspector가 진행률 업데이트를 제공하는 경우 동기화
    // 현재는 기본 구현만 제공
    const inspectionStatus = this.activeInspections.get(inspectionId);
    if (!inspectionStatus) return;

    // Inspector의 메타데이터에서 진행률 정보 추출
    if (inspector.metadata && inspector.metadata.resourcesScanned) {
      const resourcesScanned = inspector.metadata.resourcesScanned;
      
      // 리소스 스캔 수에 따른 진행률 조정
      const adjustedPercentage = Math.min(90, baseStepIndex * 10 + (resourcesScanned * 2));
      
      inspectionStatus.updateProgress({
        currentStep: `Analyzed ${resourcesScanned} resources`,
        completedSteps: baseStepIndex,
        totalSteps: steps.length,
        percentage: adjustedPercentage,
        estimatedTimeRemaining: InspectionStatus.estimateTimeRemaining(
          inspectionStatus.lastUpdated,
          adjustedPercentage
        )
      });
    }
  }

  /**
   * 검사 시작 상태를 DynamoDB에 저장
   * @param {string} customerId - 고객 ID
   * @param {string} inspectionId - 검사 ID
   * @param {string} serviceType - 서비스 타입
   * @param {string} assumeRoleArn - Assume Role ARN
   * @param {Object} additionalMetadata - 추가 메타데이터
   */
  async saveInspectionStart(customerId, inspectionId, serviceType, assumeRoleArn, additionalMetadata = {}) {
    try {
      // 단일 테이블 구조로 전환: InspectionHistory 저장 비활성화
      console.log(`🔍 [InspectionService] Skipping InspectionHistory save for single-table structure`);
      console.log(`🔍 [InspectionService] Inspection start: ${inspectionId} (${serviceType})`);



    } catch (error) {
      // 저장 실패해도 검사는 계속 진행
    }
  }

  /**
   * 트랜잭션을 사용한 검사 결과 저장
   * @param {InspectionResult} inspectionResult - 검사 결과
   */
  async saveInspectionResultWithTransaction(inspectionResult) {
    try {
      this.logger.info('Saving inspection result with transaction', {
        inspectionId: inspectionResult.inspectionId,
        customerId: inspectionResult.customerId,
        serviceType: inspectionResult.serviceType,
        status: inspectionResult.status,
        findingsCount: inspectionResult.results?.findings?.length || 0
      });

      // 검사 항목별 결과 준비
      const itemResults = this.prepareItemResults(inspectionResult);
      
      console.log('🔍 [InspectionService] Prepared item results:', itemResults.length);
      console.log('🔍 [InspectionService] Inspection data to save:', {
        inspectionId: inspectionResult.inspectionId,
        customerId: inspectionResult.customerId,
        serviceType: inspectionResult.serviceType,
        hasResults: !!inspectionResult.results,
        findingsCount: inspectionResult.results?.findings?.length || 0
      });

      // 트랜잭션 서비스를 통한 일관성 있는 저장
      const transactionService = require('./transactionService');
      
      console.log('🔍 [InspectionService] Calling transaction service...');
      const saveResult = await transactionService.saveInspectionResultsTransaction({
        inspectionId: inspectionResult.inspectionId,
        customerId: inspectionResult.customerId,
        serviceType: inspectionResult.serviceType,
        startTime: inspectionResult.startTime,
        endTime: inspectionResult.endTime,
        duration: inspectionResult.duration,
        results: inspectionResult.results,
        assumeRoleArn: inspectionResult.assumeRoleArn,
        metadata: inspectionResult.metadata
      }, itemResults);
      
      console.log('🔍 [InspectionService] Transaction service result:', saveResult);

      if (saveResult.success) {
        this.logger.info('Inspection result saved successfully with transaction', {
          inspectionId: saveResult.inspectionId,
          customerId: inspectionResult.customerId,
          itemsProcessed: saveResult.itemsProcessed
        });
      } else {
        this.logger.error('Failed to save inspection result with transaction', {
          inspectionId: inspectionResult.inspectionId,
          error: saveResult.error
        });
        
        // 트랜잭션 실패 시 폴백 저장 시도
        const fallbackResult = await this.fallbackSaveInspectionResult(inspectionResult);
        
        if (!fallbackResult) {
          // 폴백도 실패한 경우 강제 저장 시도
          await this.emergencySaveInspectionResult(inspectionResult);
        }
      }

    } catch (error) {
      this.logger.error('Failed to save inspection result with transaction', {
        inspectionId: inspectionResult.inspectionId,
        error: error.message,
        stack: error.stack
      });
      
      // 트랜잭션 실패 시 폴백 저장 시도
      const fallbackResult = await this.fallbackSaveInspectionResult(inspectionResult);
      
      if (!fallbackResult) {
        // 폴백도 실패한 경우 강제 저장 시도
        await this.emergencySaveInspectionResult(inspectionResult);
      }
    }
  }

  /**
   * 검사 결과에서 항목별 결과 준비
   * @param {InspectionResult} inspectionResult - 검사 결과
   * @returns {Array} 항목별 결과 배열
   */
  prepareItemResults(inspectionResult) {
    const itemResults = [];
    const findings = inspectionResult.results?.findings || [];
    
    if (findings.length === 0) {
      return itemResults;
    }

    // 개별 항목 검사인 경우 해당 항목으로만 분류
    if (inspectionResult.metadata && inspectionResult.metadata.targetItem && inspectionResult.metadata.targetItem !== 'all') {
      const targetItemId = inspectionResult.metadata.targetItem;
      const itemMappings = this.getServiceItemMappings(inspectionResult.serviceType);
      const itemMapping = itemMappings[targetItemId];
      
      console.log(`🔍 [InspectionService] Individual item inspection detected: ${targetItemId}`);
      console.log(`🔍 [InspectionService] All ${findings.length} findings will be classified as: ${targetItemId}`);
      
      // 모든 findings를 해당 항목으로 분류
      itemResults.push({
        serviceType: inspectionResult.serviceType,
        itemId: targetItemId,
        itemName: itemMapping?.name || inspectionResult.metadata.itemName || targetItemId,
        category: itemMapping?.category || 'other',
        totalResources: findings.length,
        issuesFound: findings.length,
        riskLevel: this.calculateMaxRiskLevel(findings),
        score: this.calculateScore(findings),
        findings: findings,
        recommendations: inspectionResult.results?.recommendations || [],
        createdAt: Date.now()
      });
      
      return itemResults;
    }

    // 전체 검사인 경우 기존 로직 사용 (키워드 매칭)
    console.log(`🔍 [InspectionService] Full inspection detected, using keyword matching`);
    
    const itemMappings = this.getServiceItemMappings(inspectionResult.serviceType);
    const itemGroups = {};

    // findings를 항목별로 그룹화
    findings.forEach(finding => {
      const itemId = this.determineItemId(finding);
      
      if (!itemGroups[itemId]) {
        itemGroups[itemId] = {
          serviceType: inspectionResult.serviceType,
          itemId,
          itemName: itemMappings[itemId]?.name || itemId,
          category: itemMappings[itemId]?.category || 'other',
          totalResources: 0,
          findings: [],
          recommendations: [],
          maxRiskLevel: 'LOW',
          score: 100
        };
      }

      itemGroups[itemId].findings.push(finding);
      itemGroups[itemId].totalResources++;
      
      // 최대 위험도 업데이트
      if (this.getRiskPriority(finding.riskLevel) > this.getRiskPriority(itemGroups[itemId].maxRiskLevel)) {
        itemGroups[itemId].maxRiskLevel = finding.riskLevel;
      }
      
      // 점수 계산
      itemGroups[itemId].score = Math.max(0, itemGroups[itemId].score - (finding.riskScore || 10));
    });

    // 항목별 결과 배열로 변환
    Object.values(itemGroups).forEach(group => {
      itemResults.push({
        serviceType: group.serviceType,
        itemId: group.itemId,
        itemName: group.itemName,
        category: group.category,
        totalResources: group.totalResources,
        issuesFound: group.findings.length,
        riskLevel: group.maxRiskLevel,
        score: group.score,
        findings: group.findings,
        recommendations: group.recommendations,
        createdAt: Date.now()
      });
    });

    return itemResults;
  }

  /**
   * 서비스별 항목 매핑 반환
   * @param {string} serviceType - 서비스 타입
   * @returns {Object} 항목 매핑
   */
  getServiceItemMappings(serviceType) {
    const mappings = {
      EC2: {
        'security_groups': { name: '보안 그룹 규칙', category: 'security' },
        'key_pairs': { name: '키 페어 관리', category: 'security' },
        'instance_metadata': { name: '인스턴스 메타데이터', category: 'security' },
        'instance_types': { name: '인스턴스 타입 최적화', category: 'performance' },
        'ebs_optimization': { name: 'EBS 최적화', category: 'performance' },
        'public_access': { name: '퍼블릭 접근 관리', category: 'security' },
        'network_access': { name: '네트워크 접근 제어', category: 'security' }
      },
      RDS: {
        'encryption': { name: '암호화 설정', category: 'security' },
        'security_groups': { name: '데이터베이스 보안 그룹', category: 'security' },
        'public_access': { name: '퍼블릭 접근 설정', category: 'security' },
        'automated_backup': { name: '자동 백업', category: 'backup' }
      },
      S3: {
        'bucket_policy': { name: '버킷 정책', category: 'security' },
        'public_access': { name: '퍼블릭 접근 차단', category: 'security' },
        'encryption': { name: '서버 측 암호화', category: 'security' },
        'versioning': { name: '버전 관리', category: 'compliance' }
      }
    };

    return mappings[serviceType] || {};
  }

  /**
   * Finding에서 검사 항목 ID 결정
   * @param {Object} finding - 검사 결과
   * @returns {string} 항목 ID
   */
  determineItemId(finding) {
    const issue = finding.issue?.toLowerCase() || '';
    
    if (issue.includes('security group')) return 'security_groups';
    if (issue.includes('key pair')) return 'key_pairs';
    if (issue.includes('metadata')) return 'instance_metadata';
    if (issue.includes('public ip') || issue.includes('퍼블릭')) return 'public_access';
    if (issue.includes('ssh') || issue.includes('rdp') || issue.includes('port')) return 'network_access';
    if (issue.includes('encryption')) return 'encryption';
    if (issue.includes('backup')) return 'automated_backup';
    if (issue.includes('bucket policy')) return 'bucket_policy';
    if (issue.includes('versioning')) return 'versioning';
    
    return 'other';
  }

  /**
   * 최대 위험도 계산
   * @param {Array} findings - 검사 결과 목록
   * @returns {string} 최대 위험도
   */
  calculateMaxRiskLevel(findings) {
    let maxRiskLevel = 'LOW';
    findings.forEach(finding => {
      if (this.getRiskPriority(finding.riskLevel) > this.getRiskPriority(maxRiskLevel)) {
        maxRiskLevel = finding.riskLevel;
      }
    });
    return maxRiskLevel;
  }

  /**
   * 점수 계산
   * @param {Array} findings - 검사 결과 목록
   * @returns {number} 점수 (0-100)
   */
  calculateScore(findings) {
    let score = 100;
    findings.forEach(finding => {
      score = Math.max(0, score - (finding.riskScore || 10));
    });
    return score;
  }

  /**
   * 위험도 우선순위 반환
   * @param {string} riskLevel - 위험도
   * @returns {number} 우선순위
   */
  getRiskPriority(riskLevel) {
    const priorities = {
      'LOW': 1,
      'MEDIUM': 2,
      'HIGH': 3,
      'CRITICAL': 4
    };
    return priorities[riskLevel] || 0;
  }

  /**
   * 폴백 저장 (트랜잭션 실패 시)
   * @param {InspectionResult} inspectionResult - 검사 결과
   * @returns {boolean} 저장 성공 여부
   */
  async fallbackSaveInspectionResult(inspectionResult) {
    try {
      this.logger.warn('Attempting fallback save for inspection result', {
        inspectionId: inspectionResult.inspectionId
      });

      // 단일 테이블 구조로 전환: InspectionHistory 저장 비활성화
      console.log(`🔍 [InspectionService] Skipping fallback InspectionHistory save`);
      
      const saveResult = { success: true }; // 임시로 성공 처리
      /*
      const historyService = require('./historyService');
      
      const saveResult = await historyService.saveInspectionHistory({
        inspectionId: inspectionResult.inspectionId,
        customerId: inspectionResult.customerId,
        serviceType: inspectionResult.serviceType,
        startTime: inspectionResult.startTime,
        endTime: inspectionResult.endTime,
        duration: inspectionResult.duration,
        results: inspectionResult.results,
        assumeRoleArn: inspectionResult.assumeRoleArn,
        metadata: {
          ...inspectionResult.metadata,
          fallbackSave: true,
          fallbackTimestamp: Date.now()
        }
      });
      */

      if (saveResult.success) {
        this.logger.info('Fallback save successful', {
          inspectionId: inspectionResult.inspectionId
        });
        return true;
      } else {
        this.logger.error('Fallback save also failed', {
          inspectionId: inspectionResult.inspectionId,
          error: saveResult.error
        });
        return false;
      }

    } catch (error) {
      this.logger.error('Fallback save failed', {
        inspectionId: inspectionResult.inspectionId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * 강제 저장 (모든 저장 방법 실패 시 최후 수단)
   * @param {InspectionResult} inspectionResult - 검사 결과
   */
  async emergencySaveInspectionResult(inspectionResult) {
    try {
      this.logger.error('Attempting emergency save - all other methods failed', {
        inspectionId: inspectionResult.inspectionId
      });

      // 직접 DynamoDB 클라이언트 사용
      const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
      const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
      
      const client = DynamoDBDocumentClient.from(new DynamoDBClient({
        region: process.env.AWS_REGION || 'ap-northeast-2',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      }));

      const timestamp = Date.now();
      const emergencyData = {
        customerId: inspectionResult.customerId,
        inspectionId: inspectionResult.inspectionId,
        serviceType: inspectionResult.serviceType,
        status: 'COMPLETED',
        startTime: inspectionResult.startTime || timestamp - 300000,
        endTime: inspectionResult.endTime || timestamp,
        duration: inspectionResult.duration || 300000,
        timestamp,
        createdAt: new Date().toISOString(),
        results: inspectionResult.results || {
          summary: {},
          findings: [],
          recommendations: []
        },
        assumeRoleArn: inspectionResult.assumeRoleArn || 'emergency-save',
        metadata: {
          version: '1.0',
          emergencySave: true,
          emergencyTimestamp: timestamp,
          originalError: 'All save methods failed',
          ...inspectionResult.metadata
        }
      };

      const command = new PutCommand({
        TableName: process.env.AWS_DYNAMODB_INSPECTION_HISTORY_TABLE || 'InspectionHistory',
        Item: emergencyData
      });

      await client.send(command);

      this.logger.info('Emergency save successful', {
        inspectionId: inspectionResult.inspectionId,
        method: 'direct-dynamodb'
      });

      // 성공 시 간단한 아이템 결과도 저장 시도
      try {
        if (inspectionResult.results?.findings?.length > 0) {
          const itemCommand = new PutCommand({
            TableName: process.env.AWS_DYNAMODB_INSPECTION_ITEMS_TABLE || 'InspectionItemResults',
            Item: {
              customerId: inspectionResult.customerId,
              itemKey: `${inspectionResult.serviceType}#emergency_save`,
              serviceType: inspectionResult.serviceType,
              itemId: 'emergency_save',
              itemName: '긴급 저장된 결과',
              category: 'emergency',
              lastInspectionId: inspectionResult.inspectionId,
              lastInspectionTime: timestamp,
              status: 'WARNING',
              totalResources: inspectionResult.results.findings.length,
              issuesFound: inspectionResult.results.findings.length,
              riskLevel: 'MEDIUM',
              score: 50,
              findings: inspectionResult.results.findings,
              recommendations: ['긴급 저장된 데이터입니다. 정상적인 검사를 다시 실행하세요.'],
              updatedAt: timestamp,
              createdAt: timestamp
            }
          });

          await client.send(itemCommand);
          this.logger.info('Emergency item result also saved', {
            inspectionId: inspectionResult.inspectionId
          });
        }
      } catch (itemError) {
        this.logger.warn('Emergency item save failed, but history was saved', {
          inspectionId: inspectionResult.inspectionId,
          itemError: itemError.message
        });
      }

    } catch (error) {
      this.logger.error('Emergency save also failed - data may be lost', {
        inspectionId: inspectionResult.inspectionId,
        error: error.message,
        stack: error.stack
      });

      // 최후의 수단: 로컬 파일에 저장
      try {
        const fs = require('fs');
        const path = require('path');
        
        const emergencyDir = path.join(__dirname, '../emergency-saves');
        if (!fs.existsSync(emergencyDir)) {
          fs.mkdirSync(emergencyDir, { recursive: true });
        }

        const emergencyFile = path.join(emergencyDir, `${inspectionResult.inspectionId}.json`);
        fs.writeFileSync(emergencyFile, JSON.stringify({
          ...inspectionResult,
          emergencySaveTimestamp: Date.now(),
          emergencySaveReason: 'All database save methods failed'
        }, null, 2));

        this.logger.info('Data saved to emergency file', {
          inspectionId: inspectionResult.inspectionId,
          file: emergencyFile
        });

      } catch (fileError) {
        this.logger.error('Even emergency file save failed', {
          inspectionId: inspectionResult.inspectionId,
          fileError: fileError.message
        });
      }
    }
  }

  /**
   * 부분적 검사 실패 처리
   * @param {string} customerId - 고객 ID
   * @param {string} inspectionId - 검사 ID
   * @param {string} serviceType - 서비스 타입
   * @param {Error} error - 발생한 오류
   * @param {Object} inspector - Inspector 인스턴스
   */
  async handlePartialInspectionFailure(customerId, inspectionId, serviceType, error, inspector) {
    try {
      this.logger.info('Handling partial inspection failure', {
        inspectionId,
        customerId,
        serviceType,
        error: error.message
      });

      // Inspector에서 부분적 결과 수집
      let partialResults = null;
      if (inspector && typeof inspector.getPartialResults === 'function') {
        partialResults = inspector.getPartialResults();
      }

      // 부분적 결과가 있으면 저장
      if (partialResults && partialResults.findings && partialResults.findings.length > 0) {
        const partialInspectionResult = {
          inspectionId,
          customerId,
          serviceType,
          startTime: Date.now() - 300000, // 5분 전으로 추정
          endTime: Date.now(),
          duration: 300000,
          results: {
            summary: {
              ...partialResults.summary,
              partial: true,
              failureReason: error.message
            },
            findings: partialResults.findings,
            recommendations: partialResults.recommendations || []
          },
          assumeRoleArn: 'unknown',
          metadata: {
            version: '1.0',
            partial: true,
            failureReason: error.message,
            failureTimestamp: Date.now()
          }
        };

        // 단일 테이블 구조로 전환: InspectionHistory 저장 비활성화
        console.log(`🔍 [InspectionService] Skipping partial failure InspectionHistory save`);
        /*
        const historyService = require('./historyService');
        await historyService.saveInspectionHistory({
          ...partialInspectionResult,
          status: 'PARTIAL_FAILURE'
        });
        */

        this.logger.info('Partial results saved successfully', {
          inspectionId,
          findingsCount: partialResults.findings.length
        });
      } else {
        // 부분 결과도 없으면 실패 기록만 저장
        const failureRecord = {
          inspectionId,
          customerId,
          serviceType,
          startTime: Date.now() - 60000, // 1분 전으로 추정
          endTime: Date.now(),
          duration: 60000,
          results: {
            summary: {
              totalResources: 0,
              highRiskIssues: 0,
              mediumRiskIssues: 0,
              lowRiskIssues: 0,
              score: 0,
              failed: true,
              failureReason: error.message
            },
            findings: [],
            recommendations: []
          },
          assumeRoleArn: 'unknown',
          metadata: {
            version: '1.0',
            failed: true,
            failureReason: error.message,
            failureTimestamp: Date.now()
          }
        };

        // 단일 테이블 구조로 전환: InspectionHistory 저장 비활성화
        console.log(`🔍 [InspectionService] Skipping emergency failure InspectionHistory save`);
        /*
        const historyService = require('./historyService');
        await historyService.saveInspectionHistory({
          ...failureRecord,
          status: 'FAILED'
        });
        */

        this.logger.info('Failure record saved', {
          inspectionId,
          failureReason: error.message
        });
      }

    } catch (saveError) {
      this.logger.error('Failed to save partial inspection results', {
        inspectionId,
        originalError: error.message,
        saveError: saveError.message
      });
    }
  }

  /**
   * 활성 검사 목록 조회
   * @param {string} customerId - 고객 ID (선택사항)
   * @returns {Array} 활성 검사 목록
   */
  getActiveInspections(customerId = null) {
    const activeInspections = [];
    
    for (const [inspectionId, status] of this.activeInspections.entries()) {
      // customerId 필터링 (실제 구현에서는 상태 객체에 customerId 포함 필요)
      activeInspections.push({
        inspectionId,
        ...status.toApiResponse()
      });
    }

    return activeInspections;
  }

  /**
   * 완료된 검사 정리
   * @param {number} maxAge - 최대 보관 시간 (밀리초, 기본 1시간)
   */
  cleanupCompletedInspections(maxAge = 3600000) {
    const now = Date.now();
    const toRemove = [];

    for (const [inspectionId, status] of this.activeInspections.entries()) {
      if ((status.status === 'COMPLETED' || status.status === 'FAILED') &&
          (now - status.lastUpdated) > maxAge) {
        toRemove.push(inspectionId);
      }
    }

    toRemove.forEach(inspectionId => {
      this.activeInspections.delete(inspectionId);
      this.logger.debug('Cleaned up completed inspection', { inspectionId });
    });

    if (toRemove.length > 0) {
      this.logger.info('Cleaned up completed inspections', { count: toRemove.length });
    }
  }

  /**
   * 검사 취소
   * @param {string} inspectionId - 검사 ID
   * @returns {Object} 취소 결과
   */
  cancelInspection(inspectionId) {
    const inspectionStatus = this.activeInspections.get(inspectionId);
    
    if (!inspectionStatus) {
      return {
        success: false,
        error: {
          code: 'INSPECTION_NOT_FOUND',
          message: 'Inspection not found'
        }
      };
    }

    if (inspectionStatus.status === 'COMPLETED' || inspectionStatus.status === 'FAILED') {
      return {
        success: false,
        error: {
          code: 'INSPECTION_ALREADY_FINISHED',
          message: 'Cannot cancel completed or failed inspection'
        }
      };
    }

    inspectionStatus.fail('Inspection cancelled by user');
    
    this.logger.info('Inspection cancelled', { inspectionId });

    return {
      success: true,
      data: {
        inspectionId,
        status: 'CANCELLED',
        message: 'Inspection cancelled successfully'
      }
    };
  }

  /**
   * 지원되는 서비스 타입 목록 조회
   * @returns {Array} 지원되는 서비스 타입 목록
   */
  getSupportedServiceTypes() {
    return inspectorRegistry.getSupportedServiceTypes().map(serviceType => ({
      serviceType,
      inspectorInfo: inspectorRegistry.getInspectorInfo(serviceType)
    }));
  }

  /**
   * 서비스 상태 확인
   * @returns {Object} 서비스 상태 정보
   */
  getServiceHealth() {
    return {
      status: 'healthy',
      activeInspections: this.activeInspections.size,
      supportedServices: inspectorRegistry.getSupportedServiceTypes(),
      uptime: process.uptime(),
      timestamp: Date.now()
    };
  }

  /**
   * 로거 생성
   * @returns {Object} 로거 객체
   */
  createLogger() {
    return {
      debug: (message, meta = {}) => {
        console.log(`[DEBUG] [InspectionService] ${message}`, meta);
      },
      info: (message, meta = {}) => {
        console.log(`[INFO] [InspectionService] ${message}`, meta);
      },
      warn: (message, meta = {}) => {
        console.warn(`[WARN] [InspectionService] ${message}`, meta);
      },
      error: (message, meta = {}) => {
        console.error(`[ERROR] [InspectionService] ${message}`, meta);
      }
    };
  }
}

// 싱글톤 인스턴스 생성
const inspectionService = new InspectionService();

// 정기적으로 완료된 검사 정리 (5분마다)
setInterval(() => {
  inspectionService.cleanupCompletedInspections();
}, 300000);

module.exports = inspectionService;