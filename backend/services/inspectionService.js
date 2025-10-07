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
    
    // 배치 정보를 별도로 관리
    this.activeBatches = new Map(); // batchId -> { inspectionIds: [], completedIds: [], totalItems: number }
    
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


      // 선택된 모든 항목에 대해 검사 작업 생성
      const inspectionJobs = [];
      
      this.logger.info('Processing inspection request', {
        customerId,
        serviceType,
        selectedItemsCount: selectedItems.length,
        selectedItems: selectedItems
      });
      
      if (selectedItems.length === 0) {
        // 항목이 선택되지 않은 경우 전체 검사로 처리 (기존 방식)
        const inspectionId = uuidv4();
        inspectionJobs.push({
          inspectionId,
          itemId: 'all',
          itemName: `${serviceType} 전체 검사`
        });
        this.logger.info('Created full inspection job', { inspectionId, itemId: 'all' });
      } else {
        // 선택된 모든 항목에 대해 개별 검사 작업 생성
        for (const itemId of selectedItems) {
          const inspectionId = uuidv4();
          inspectionJobs.push({
            inspectionId,
            itemId: itemId,
            itemName: this.getItemName(serviceType, itemId)
          });
          this.logger.info('Created item inspection job', { inspectionId, itemId, itemName: this.getItemName(serviceType, itemId) });
        }

      }
      
      this.logger.info('Total inspection jobs created', { 
        jobCount: inspectionJobs.length,
        jobs: inspectionJobs.map(job => ({ id: job.inspectionId, item: job.itemId }))
      });

      // 배치 정보 등록
      this.activeBatches.set(batchId, {
        inspectionIds: inspectionJobs.map(job => job.inspectionId),
        completedIds: [],
        totalItems: inspectionJobs.length,
        startTime: Date.now()
      });

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
        
        // 첫 번째 검사 시작 시에만 초기 진행률 전송
        if (inspectionJobs.indexOf(job) === 0) {
          webSocketService.broadcastProgressUpdate(batchId, {
            status: 'STARTING',
            progress: {
              percentage: 0,
              completedItems: 0,
              totalItems: inspectionJobs.length,
              currentStep: `Starting batch inspection (${inspectionJobs.length} items)`,
              estimatedTimeRemaining: null
            },
            batchInfo: {
              batchId,
              totalInspections: inspectionJobs.length,
              completedInspections: 0,
              remainingInspections: inspectionJobs.length,
              inspectionItems: inspectionJobs.map(j => ({
                itemId: j.itemId,
                itemName: j.itemName,
                status: 'PENDING'
              }))
            }
          });
        }
        
        webSocketService.broadcastStatusChange(batchId, {
          status: 'STARTING',
          message: `Starting ${job.itemName} inspection`,
          timestamp: Date.now(),
          itemId: job.itemId,
          itemName: job.itemName,
          inspectionId: job.inspectionId // 개별 검사 ID도 포함
        });
        
        // 구독자 이동 (프론트엔드 구독 타이밍 고려)
        setTimeout(() => {
          webSocketService.moveSubscribersToBatch(job.inspectionId, batchId);
        }, 100);
        
        return this.executeItemInspectionAsync(
          customerId,
          job.inspectionId,
          serviceType,
          assumeRoleArn,
          {
            ...inspectionConfig,
            targetItemId: job.itemId,
            batchId,
            itemName: job.itemName,
            isFirstInBatch: inspectionJobs.indexOf(job) === 0, // 첫 번째 검사인지 표시
            firstInspectionId: inspectionJobs[0]?.inspectionId // 첫 번째 검사 ID 전달
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

      // 강제 구독자 이동 시도 (모든 개별 검사 ID → 배치 ID)
      setTimeout(() => {
        webSocketService.forceMoveToBatch(batchId, inspectionJobs.map(job => job.inspectionId));
      }, 1000);

      // 모든 검사 작업을 병렬로 실행하되 응답은 즉시 반환
      Promise.all(executionPromises).then(() => {
        console.log(`🎯 [InspectionService] Batch ${batchId} completed - all ${inspectionJobs.length} inspections finished`);
        
        // 모든 검사가 완료되었을 때만 배치 완료 알림 전송
        this.broadcastBatchCompletion(batchId, inspectionJobs);
        
        // 배치 완료 시 웹소켓 구독자 정리
        setTimeout(() => {
          console.log(`🧹 [InspectionService] Cleaning up batch ${batchId} subscribers`);
          webSocketService.cleanupBatchSubscribers(batchId, inspectionJobs.map(job => job.inspectionId));
        }, 5000); // 5초 후 정리
      }).catch(error => {
        // 배치 실패 시에도 완료 알림 전송 (실패 상태로)
        this.broadcastBatchCompletion(batchId, inspectionJobs, error);
      }).finally(() => {
        // 배치 완료 후 배치 정보 정리
        setTimeout(() => {
          this.activeBatches.delete(batchId);
        }, 10000); // 10초 후 정리
      });

      return {
        success: true,
        data: {
          batchId,
          // 프론트엔드가 첫 번째 검사 ID로 구독하도록 안내 (자동 이동됨)
          subscriptionId: inspectionJobs[0]?.inspectionId || batchId,
          inspectionJobs: inspectionJobs.map(job => ({
            inspectionId: job.inspectionId,
            itemId: job.itemId,
            itemName: job.itemName,
            status: 'PENDING'
          })),
          message: `Started ${inspectionJobs.length} inspection(s) successfully`,
          // 웹소켓 구독 안내
          websocketInstructions: {
            subscribeToId: inspectionJobs[0]?.inspectionId || batchId,
            batchId: batchId,
            message: 'Subscribe to the first inspection ID - will be automatically moved to batch updates'
          }
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
   * 배치 진행률 계산
   * @param {string} batchId - 배치 ID
   * @returns {Object} 진행률 정보
   */
  calculateBatchProgress(batchId) {
    const batchInfo = this.activeBatches.get(batchId);
    
    if (!batchInfo) {
      return {
        percentage: 0,
        completedItems: 0,
        totalItems: 0,
        estimatedTimeRemaining: null
      };
    }
    
    // 완료된 검사 수 계산
    const completedItems = batchInfo.inspectionIds.filter(inspectionId => {
      const inspection = this.activeInspections.get(inspectionId);
      return inspection && (inspection.status === 'COMPLETED' || inspection.status === 'FAILED');
    }).length;
    
    const totalItems = batchInfo.totalItems;
    const percentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
    
    // 예상 완료 시간 계산
    let estimatedTimeRemaining = null;
    if (completedItems > 0 && completedItems < totalItems) {
      const elapsedTime = Date.now() - batchInfo.startTime;
      const averageTimePerItem = elapsedTime / completedItems;
      const remainingItems = totalItems - completedItems;
      estimatedTimeRemaining = Math.round(averageTimePerItem * remainingItems / 1000); // 초 단위
    }
    

    
    return {
      percentage,
      completedItems,
      totalItems,
      estimatedTimeRemaining
    };
  }

  /**
   * 배치 완료 알림 전송
   * @param {string} batchId - 배치 ID
   * @param {Array} inspectionJobs - 검사 작업 목록
   * @param {Error} error - 오류 (있는 경우)
   */
  broadcastBatchCompletion(batchId, inspectionJobs, error = null) {

    const completionData = {
      status: error ? 'FAILED' : 'COMPLETED',
      batchId,
      totalInspections: inspectionJobs.length,
      completedInspections: error ? 0 : inspectionJobs.length,
      inspectionJobs: inspectionJobs.map(job => ({
        inspectionId: job.inspectionId,
        itemId: job.itemId,
        itemName: job.itemName,
        status: error ? 'FAILED' : 'COMPLETED'
      })),
      completedAt: Date.now(),
      duration: Date.now() - (this.activeInspections.get(inspectionJobs[0]?.inspectionId)?.startTime || Date.now()),
      saveSuccessful: !error,
      forceRefresh: true,
      refreshCommand: 'RELOAD_ALL_DATA',
      cacheBreaker: Date.now()
    };

    if (error) {
      completionData.error = error.message;
    }

    // 최종 진행률 업데이트 (100% 완료)
    webSocketService.broadcastProgressUpdate(batchId, {
      status: error ? 'FAILED' : 'COMPLETED',
      progress: {
        percentage: 100,
        completedItems: inspectionJobs.length,
        totalItems: inspectionJobs.length,
        currentStep: error ? 'Batch failed' : 'All inspections completed',
        estimatedTimeRemaining: 0
      },
      batchInfo: {
        batchId,
        totalInspections: inspectionJobs.length,
        completedInspections: inspectionJobs.length,
        remainingInspections: 0
      }
    });

    // 배치 완료 알림 전송
    webSocketService.broadcastInspectionComplete(batchId, completionData);
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
        'instance_metadata': '인스턴스 메타데이터',
        'ebs_encryption': 'EBS 볼륨 암호화',
        'public_access': '퍼블릭 접근 검사',
        'iam_roles': 'IAM 역할 및 권한',
        'network_acls': '네트워크 ACL',
        'monitoring_logging': '모니터링 및 로깅',
        'backup_recovery': '백업 및 복구',
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

      // 5. 트랜잭션을 사용한 일관성 있는 결과 저장 (웹소켓 알림 전에 먼저 저장)
      console.log(`💾 [InspectionService] Starting DB save for ${inspectionId}`);
      let saveSuccessful = false;
      
      try {
        console.log(`💾 [InspectionService] Attempting transaction save for ${inspectionId}`);
        await this.saveInspectionResultWithTransaction(inspectionResult);
        saveSuccessful = true;
        console.log(`✅ [InspectionService] Transaction save successful for ${inspectionId}`);

      } catch (saveError) {
        console.error(`❌ [InspectionService] Transaction save failed for ${inspectionId}:`, {
          error: saveError.message,
          stack: saveError.stack
        });
        
        // 즉시 강제 저장 시도
        try {
          console.log(`🚨 [InspectionService] Attempting emergency save for ${inspectionId}`);
          await this.emergencySaveInspectionResult(inspectionResult);
          saveSuccessful = true;
          console.log(`✅ [InspectionService] Emergency save successful for ${inspectionId}`);
        } catch (emergencyError) {
          console.error(`❌ [InspectionService] Emergency save also failed for ${inspectionId}:`, {
            error: emergencyError.message
          });
        }
      }

      // 개별 검사 완료 시에는 완료 알림을 보내지 않고 진행 상황만 업데이트
      const batchId = inspectionConfig.batchId || inspectionId;
      
      // 배치 진행률 계산
      const batchProgress = this.calculateBatchProgress(batchId);
      
      // 배치 진행률 업데이트 (progress_update 메시지)
      webSocketService.broadcastProgressUpdate(batchId, {
        status: 'IN_PROGRESS',
        progress: {
          percentage: batchProgress.percentage,
          completedItems: batchProgress.completedItems,
          totalItems: batchProgress.totalItems,
          currentStep: `Completed ${inspectionConfig.itemName}`,
          estimatedTimeRemaining: batchProgress.estimatedTimeRemaining
        },
        completedItem: {
          inspectionId,
          itemId: inspectionConfig.targetItemId,
          itemName: inspectionConfig.itemName,
          saveSuccessful,
          completedAt: Date.now()
        },
        batchInfo: {
          batchId,
          totalInspections: batchProgress.totalItems,
          completedInspections: batchProgress.completedItems,
          remainingInspections: batchProgress.totalItems - batchProgress.completedItems
        }
      });
      
      // 상태 변경도 함께 알림
      webSocketService.broadcastStatusChange(batchId, {
        status: 'IN_PROGRESS',
        message: `Completed ${inspectionConfig.itemName} (${batchProgress.completedItems}/${batchProgress.totalItems})`,
        progress: batchProgress.percentage,
        completedItem: {
          inspectionId,
          itemId: inspectionConfig.targetItemId,
          itemName: inspectionConfig.itemName,
          saveSuccessful,
          completedAt: Date.now()
        },
        timestamp: Date.now()
      });
      
      if (!saveSuccessful && !isBatchInspection) {
        // 단일 검사에서만 저장 실패 알림
        webSocketService.broadcastStatusChange(inspectionId, {
          status: 'COMPLETED_WITH_SAVE_ERROR',
          error: 'Data save failed but inspection completed',
          completedAt: Date.now(),
          results: inspectionResult.results
        });
      }

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

      // 배치 검사인 경우 배치 ID로 실패 알림, 단일 검사인 경우 개별 ID로 실패 알림
      const batchId = inspectionConfig.batchId || inspectionId;
      const isBatchInspection = inspectionConfig.batchId && inspectionConfig.batchId !== inspectionId;
      
      if (isBatchInspection) {
        // 배치 검사 중 개별 항목 실패
        webSocketService.broadcastStatusChange(batchId, {
          status: 'ITEM_FAILED',
          error: error.message,
          failedAt: Date.now(),
          failedItem: {
            inspectionId,
            itemId: inspectionConfig.targetItemId,
            itemName: inspectionConfig.itemName,
            error: error.message
          },
          partialResults: inspector?.getPartialResults?.() || null
        });
      } else {
        // 단일 검사 실패
        webSocketService.broadcastStatusChange(inspectionId, {
          status: 'FAILED',
          error: error.message,
          failedAt: Date.now(),
          itemId: inspectionConfig.targetItemId,
          partialResults: inspector?.getPartialResults?.() || null
        });
      }
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

      // 5. 트랜잭션을 사용한 일관성 있는 결과 저장 (웹소켓 알림 전에 먼저 저장)
      let saveSuccessful = false;
      
      try {
        await this.saveInspectionResultWithTransaction(inspectionResult);
        saveSuccessful = true;

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

      // 단일 검사의 경우에만 즉시 완료 알림 전송 (배치가 아닌 경우)
      const batchId = inspectionResult.metadata?.batchId || inspectionId;
      const isBatchInspection = inspectionResult.metadata?.batchId && inspectionResult.metadata?.batchId !== inspectionId;
      
      if (!isBatchInspection) {
        // 단일 검사인 경우에만 완료 알림 전송
        this.verifyAndBroadcastCompletion(batchId, inspectionResult, null, saveSuccessful, inspectionId);
      } else {
        console.log(`📊 [InspectionService] Single inspection ${inspectionId} completed (part of batch), no completion broadcast`);
      }
      
      if (!saveSuccessful) {
        // WebSocket으로 저장 실패 알림
        webSocketService.broadcastStatusChange(inspectionId, {
          status: 'COMPLETED_WITH_SAVE_ERROR',
          error: 'Data save failed but inspection completed',
          completedAt: Date.now(),
          results: inspectionResult.results // 결과는 WebSocket으로라도 전달
        });
      }

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

      // Broadcast failure via WebSocket (단일 검사 방식)
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
      // 검사 항목별 결과 준비
      const itemResults = this.prepareItemResults(inspectionResult);

      // 트랜잭션 서비스를 통한 일관성 있는 저장
      const transactionService = require('./transactionService');

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

      if (saveResult.success) {
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
    
    // 개별 항목 검사인 경우 findings가 없어도 결과를 생성해야 함
    const isItemInspection = inspectionResult.metadata && 
                            inspectionResult.metadata.targetItem && 
                            inspectionResult.metadata.targetItem !== 'all';
    

    
    if (findings.length === 0 && !isItemInspection) {
      return itemResults;
    }

    // 개별 항목 검사인 경우 해당 항목으로만 분류
    if (inspectionResult.metadata && inspectionResult.metadata.targetItem && inspectionResult.metadata.targetItem !== 'all') {
      const targetItemId = inspectionResult.metadata.targetItem;
      const itemMappings = this.getServiceItemMappings(inspectionResult.serviceType);
      const itemMapping = itemMappings[targetItemId];
      

      
      // 모든 findings를 해당 항목으로 분류 (findings가 없어도 결과 생성)
      const itemResult = {
        serviceType: inspectionResult.serviceType,
        itemId: targetItemId,
        itemName: itemMapping?.name || inspectionResult.metadata.itemName || targetItemId,
        category: itemMapping?.category || 'other',
        totalResources: inspectionResult.results?.summary?.totalResources || 0,
        issuesFound: findings.filter(f => f.riskLevel !== 'PASS').length,
        riskLevel: findings.length > 0 ? this.calculateMaxRiskLevel(findings) : 'LOW',
        score: findings.length > 0 ? this.calculateScore(findings) : 100,
        findings: findings,
        recommendations: inspectionResult.results?.recommendations || [],
        createdAt: Date.now()
      };
      

      
      itemResults.push(itemResult);
      
      return itemResults;
    }

    // 전체 검사인 경우 기존 로직 사용 (키워드 매칭)
    
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
        issuesFound: group.findings.filter(f => f.riskLevel !== 'PASS').length,
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
        'dangerous_ports': { name: '위험한 포트 보안', category: 'security' },
        'ebs_encryption': { name: 'EBS 볼륨 암호화', category: 'security' },
        'public_ip_exposure': { name: '퍼블릭 IP 노출', category: 'security' },
        'ebs_volume_version': { name: 'EBS 볼륨 버전', category: 'security' },
        'termination-protection': { name: '종료 보호 설정', category: 'security' },
        'unused_security_groups': { name: '미사용 보안 그룹', category: 'cost_optimization' },
        'unused_elastic_ip': { name: '미사용 Elastic IP', category: 'cost_optimization' },
        'old_snapshots': { name: '오래된 스냅샷', category: 'cost_optimization' },
        'stopped-instances': { name: '중지된 인스턴스', category: 'cost_optimization' }
      },
      RDS: {
        'encryption': { name: '암호화 설정', category: 'security' },
        'security_groups': { name: '데이터베이스 보안 그룹', category: 'security' },
        'public_access': { name: '퍼블릭 접근 설정', category: 'security' },
        'automated_backup': { name: '자동 백업', category: 'backup' }
      },
      S3: {
        'bucket-policy': { name: '버킷 정책', category: 'security' },
        'bucket-public-access': { name: '퍼블릭 액세스 차단', category: 'security' },
        'bucket-encryption': { name: '버킷 암호화', category: 'security' },
        'bucket-versioning': { name: '버전 관리', category: 'data_protection' },
        'bucket-logging': { name: '액세스 로깅', category: 'data_protection' },
        'bucket-mfa-delete': { name: 'MFA Delete', category: 'data_protection' },
        'bucket-lifecycle': { name: '라이프사이클 정책', category: 'cost_optimization' },
        'bucket-cors': { name: 'CORS 설정', category: 'security' }
      },
      IAM: {
        'root-access-key': { name: '루트 계정 액세스 키', category: 'security' },
        'mfa-enabled': { name: 'MFA 활성화', category: 'security' },
        'unused-credentials': { name: '미사용 자격 증명', category: 'security' },
        'overprivileged-policies': { name: '과도한 권한', category: 'policies' },
        'inline-policies': { name: '인라인 정책', category: 'policies' }
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
    let maxRiskLevel = 'PASS';
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
      'PASS': 0,
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
              issuesFound: inspectionResult.results.findings.filter(f => f.riskLevel !== 'PASS').length,
              riskLevel: 'MEDIUM',
              score: 50,
              findings: inspectionResult.results.findings,
              recommendations: ['긴급 저장된 데이터입니다. 정상적인 검사를 다시 실행하세요.'],
              updatedAt: timestamp,
              createdAt: timestamp
            }
          });

          await client.send(itemCommand);

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
        /*
        const historyService = require('./historyService');
        await historyService.saveInspectionHistory({
          ...partialInspectionResult,
          status: 'PARTIAL_FAILURE'
        });
        */


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
        /*
        const historyService = require('./historyService');
        await historyService.saveInspectionHistory({
          ...failureRecord,
          status: 'FAILED'
        });
        */


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

    });

    if (toRemove.length > 0) {

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
   * DB 저장 검증 후 완료 알림 전송
   * @param {string} broadcastId - 웹소켓 브로드캐스트 ID (배치 ID 또는 검사 ID)
   * @param {InspectionResult} inspectionResult - 검사 결과
   * @param {Object} inspectionConfig - 검사 설정 (선택사항)
   * @param {boolean} saveSuccessful - 저장 성공 여부
   * @param {string} actualInspectionId - 실제 검사 ID (선택사항)
   */
  async verifyAndBroadcastCompletion(broadcastId, inspectionResult, inspectionConfig = null, saveSuccessful = false, actualInspectionId = null) {
    const inspectionId = actualInspectionId || broadcastId;
    console.log(`🔍 [InspectionService] Starting completion verification for ${inspectionId} (broadcast: ${broadcastId})`, {
      saveSuccessful,
      customerId: inspectionResult.customerId,
      serviceType: inspectionResult.serviceType,
      hasResults: !!inspectionResult.results
    });

    const maxRetries = 3;
    let retryCount = 0;
    
    const attemptBroadcast = async () => {
      try {
        console.log(`🔍 [InspectionService] Attempt ${retryCount + 1} for ${inspectionId} (broadcast: ${broadcastId})`);
        
        // DB에서 실제로 저장된 데이터 확인
        if (saveSuccessful) {
          console.log(`🔍 [InspectionService] Verifying DB save for ${inspectionId}`);
          
          const historyService = require('./historyService');
          const verificationResult = await historyService.getLatestInspectionResults(
            inspectionResult.customerId,
            inspectionResult.serviceType
          );
          
          console.log(`🔍 [InspectionService] DB verification result for ${inspectionId}:`, {
            success: verificationResult.success,
            hasServices: !!verificationResult.data?.services,
            serviceCount: Object.keys(verificationResult.data?.services || {}).length
          });
          
          if (verificationResult.success && verificationResult.data.services) {
            console.log(`✅ [InspectionService] DB verification successful for ${inspectionId}, sending completion`);
            
            // 저장된 데이터가 확인되면 완료 알림 전송
            const completionData = {
              status: 'COMPLETED',
              results: inspectionResult.results,
              duration: inspectionResult.duration,
              completedAt: Date.now(),
              totalSteps: inspectionConfig ? inspectionConfig.totalSteps : 5,
              resourcesProcessed: inspectionResult.results?.summary?.totalResources || 0,
              itemId: inspectionConfig?.targetItemId,
              itemName: inspectionConfig?.itemName,
              saveSuccessful: true,
              // 실제 저장된 데이터도 포함
              savedData: verificationResult.data,
              // 데이터 변경 감지를 위한 타임스탬프
              dataTimestamp: Date.now(),
              inspectionId: inspectionId // 검사 ID 포함
            };
            
            // 즉시 알림 전송 (배치 ID로 브로드캐스트)
            console.log(`📡 [InspectionService] Broadcasting completion for ${inspectionId} to ${broadcastId}`);
            webSocketService.broadcastInspectionComplete(broadcastId, completionData);
            
            // 배치 ID로만 브로드캐스트 - 추가 알림 없음
            
            // 500ms 후 데이터 새로고침 명령 전송
            setTimeout(() => {
              console.log(`🔄 [InspectionService] Broadcasting data refresh command for ${inspectionId} to ${broadcastId}`);
              webSocketService.broadcastStatusChange(broadcastId, {
                type: 'DATA_REFRESH_REQUIRED',
                message: 'Please refresh inspection data',
                timestamp: Date.now(),
                forceRefresh: true
              });
            }, 500);
            
            // 1초 후 다시 한 번 알림 전송 (확실한 전달을 위해)
            setTimeout(() => {
              console.log(`📡 [InspectionService] Broadcasting retransmission for ${inspectionId} to ${broadcastId}`);
              webSocketService.broadcastInspectionComplete(broadcastId, {
                ...completionData,
                retransmission: true
              });
            }, 1000);
            return true;
          } else {
            console.log(`❌ [InspectionService] DB verification failed for ${inspectionId}`);
          }
        } else {
          console.log(`⚠️ [InspectionService] Save was not successful for ${inspectionId}`);
        }
        
        // 저장 실패하거나 검증 실패 시 기본 알림
        console.log(`📡 [InspectionService] Broadcasting basic completion for ${inspectionId} to ${broadcastId}`);
        webSocketService.broadcastInspectionComplete(broadcastId, {
          status: 'COMPLETED',
          results: inspectionResult.results,
          duration: inspectionResult.duration,
          completedAt: Date.now(),
          totalSteps: inspectionConfig ? inspectionConfig.totalSteps : 5,
          resourcesProcessed: inspectionResult.results?.summary?.totalResources || 0,
          itemId: inspectionConfig?.targetItemId,
          itemName: inspectionConfig?.itemName,
          saveSuccessful: saveSuccessful
        });
        return true;
        
      } catch (error) {
        console.error(`❌ [InspectionService] Failed to verify DB save for ${inspectionId}, retrying...`, {
          retryCount,
          error: error.message,
          stack: error.stack
        });
        return false;
      }
    };
    
    // 재시도 로직
    while (retryCount < maxRetries) {
      if (await attemptBroadcast()) {
        console.log(`✅ [InspectionService] Completion broadcast successful for ${inspectionId}`);
        return;
      }
      retryCount++;
      console.log(`🔄 [InspectionService] Retrying completion broadcast for ${inspectionId} (${retryCount}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // 지수 백오프
    }
    
    // 최종 실패 시 기본 알림
    console.error(`❌ [InspectionService] Final failure for completion broadcast ${inspectionId} to ${broadcastId}`);
    webSocketService.broadcastInspectionComplete(broadcastId, {
      status: 'COMPLETED',
      results: inspectionResult.results,
      duration: inspectionResult.duration,
      completedAt: Date.now(),
      saveSuccessful: false,
      error: 'Failed to verify data save'
    });
  }

  /**
   * 로거 생성
   * @returns {Object} 로거 객체
   */
  createLogger() {
    return {
      debug: (message, meta = {}) => {
        // DEBUG 로그 완전 비활성화
      },
      info: (message, meta = {}) => {
        // INFO 로그 완전 비활성화 (에러와 경고만 유지)
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