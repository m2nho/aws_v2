import api from './api';
import webSocketService from './websocketService';

/**
 * Inspection Service
 * AWS 리소스 검사 관련 API 호출 및 WebSocket 기반 실시간 모니터링
 * Requirements: 1.1, 6.1, 6.2, 6.3, 6.4
 */

const RETRY_DELAY = 1000; // 재시도 지연 시간 (1초)
const MAX_RETRY_ATTEMPTS = 3; // 최대 재시도 횟수

/**
 * 지연 함수
 * @param {number} ms - 지연 시간 (밀리초)
 * @returns {Promise}
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 재시도 로직이 포함된 API 호출
 * @param {Function} apiCall - API 호출 함수
 * @param {number} maxAttempts - 최대 재시도 횟수
 * @param {number} delayMs - 재시도 간 지연 시간
 * @returns {Promise}
 */
const withRetry = async (apiCall, maxAttempts = MAX_RETRY_ATTEMPTS, delayMs = RETRY_DELAY) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      lastError = error;
      
      // 마지막 시도가 아니고, 재시도 가능한 에러인 경우에만 재시도
      if (attempt < maxAttempts && isRetryableError(error)) {
        await delay(delayMs * attempt); // 지수 백오프
        continue;
      }
      
      // 재시도 불가능한 에러이거나 마지막 시도인 경우 에러 던지기
      break;
    }
  }
  
  throw lastError;
};

/**
 * 재시도 가능한 에러인지 확인
 * @param {Error} error - 에러 객체
 * @returns {boolean}
 */
const isRetryableError = (error) => {
  // 네트워크 에러, 타임아웃, 5xx 서버 에러는 재시도 가능
  if (!error.response) return true; // 네트워크 에러
  if (error.code === 'ECONNABORTED') return true; // 타임아웃
  if (error.response.status >= 500) return true; // 서버 에러
  
  // 4xx 클라이언트 에러는 재시도하지 않음 (401, 403, 404 등)
  return false;
};

export const inspectionService = {
  /**
   * 검사 시작
   * Requirements: 1.1 - 승인된 고객이 AWS 서비스 검사를 요청
   * @param {Object} inspectionData - 검사 데이터
   * @param {string} inspectionData.serviceType - AWS 서비스 타입 (EC2, RDS, S3 등)
   * @param {string} inspectionData.assumeRoleArn - Assume Role ARN
   * @param {Object} inspectionData.inspectionConfig - 검사 설정 (선택사항)
   * @returns {Promise<Object>} 검사 시작 결과
   */
  startInspection: async (inspectionData) => {
    return withRetry(async () => {
      const response = await api.post('/inspections/start', inspectionData);
      return response.data;
    });
  },

  /**
   * 검사 상세 조회
   * Requirements: 1.1 - 고객이 특정 검사 결과를 선택하여 상세 조회
   * @param {string} inspectionId - 검사 ID
   * @returns {Promise<Object>} 검사 상세 결과
   */
  getInspectionDetails: async (inspectionId) => {
    return withRetry(async () => {
      const response = await api.get(`/inspections/${inspectionId}`);
      return response.data;
    });
  },

  /**
   * 검사 이력 조회
   * Requirements: 1.1 - 고객이 검사 이력을 요청
   * @param {Object} params - 쿼리 파라미터
   * @param {string} params.serviceType - 서비스 타입 필터 (선택사항)
   * @param {number} params.limit - 조회할 항목 수 (기본값: 20)
   * @param {string} params.lastEvaluatedKey - 페이지네이션 키 (선택사항)
   * @param {string} params.startDate - 시작 날짜 (선택사항)
   * @param {string} params.endDate - 종료 날짜 (선택사항)
   * @returns {Promise<Object>} 검사 이력 목록
   */
  getInspectionHistory: async (params = {}) => {
    return withRetry(async () => {
      const queryParams = new URLSearchParams();
      
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          queryParams.append(key, value);
        }
      });
      
      const queryString = queryParams.toString();
      const url = queryString ? `/inspections/history?${queryString}` : '/inspections/history';
      
      const response = await api.get(url);
      return response.data;
    });
  },

  /**
   * 검사 상태 조회
   * Requirements: 6.3 - 검사 진행 상황을 실시간으로 확인
   * @param {string} inspectionId - 검사 ID
   * @returns {Promise<Object>} 검사 상태
   */
  getInspectionStatus: async (inspectionId) => {
    return withRetry(async () => {
      const response = await api.get(`/inspections/${inspectionId}/status`);
      return response.data;
    });
  },



  /**
   * 사용 가능한 검사 서비스 목록 조회
   * Requirements: 1.1 - 사용 가능한 검사 유형 목록을 표시
   * @returns {Promise<Object>} 사용 가능한 서비스 목록
   */
  getAvailableServices: async () => {
    return withRetry(async () => {
      const response = await api.get('/inspections/services');
      return response.data;
    });
  },

  /**
   * 검사 취소
   * @param {string} inspectionId - 검사 ID
   * @returns {Promise<Object>} 취소 결과
   */
  cancelInspection: async (inspectionId) => {
    return withRetry(async () => {
      const response = await api.post(`/inspections/${inspectionId}/cancel`);
      return response.data;
    });
  },

  /**
   * 모든 서비스의 검사 항목 상태 조회
   * Trusted Advisor 스타일 - 각 검사 항목별 최근 상태
   * @returns {Promise<Object>} 모든 검사 항목 상태
   */
  getAllItemStatus: async () => {
    return withRetry(async () => {
      const response = await api.get('/inspections/items/status');
      return response.data;
    });
  },

  /**
   * 특정 서비스의 검사 항목 상태 조회
   * Trusted Advisor 스타일 - 서비스별 검사 항목 상태
   * @param {string} serviceType - 서비스 타입 (EC2, RDS, S3, IAM)
   * @returns {Promise<Object>} 서비스별 검사 항목 상태
   */
  getServiceItemStatus: async (serviceType) => {
    return withRetry(async () => {
      const response = await api.get(`/inspections/services/${serviceType}/items`);
      return response.data;
    });
  },

  /**
   * 항목별 검사 이력 조회
   * @param {Object} params - 쿼리 파라미터
   * @param {string} params.serviceType - 서비스 타입 필터 (선택사항)
   * @param {number} params.limit - 조회할 항목 수 (기본값: 50)
   * @returns {Promise<Object>} 항목별 검사 이력 목록
   */
  getItemInspectionHistory: async (params = {}) => {
    return withRetry(async () => {
      const queryParams = new URLSearchParams();
      
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          queryParams.append(key, value);
        }
      });
      
      const queryString = queryParams.toString();
      const url = queryString ? `/inspections/items/history?${queryString}` : '/inspections/items/history';
      
      const response = await api.get(url);
      return response.data;
    });
  },

  /**
   * WebSocket 기반 실시간 검사 모니터링
   * Requirements: 6.1, 6.2, 6.3, 6.4 - WebSocket을 통한 실시간 상태 업데이트
   * @param {string} inspectionId - 검사 ID
   * @param {Object} callbacks - 콜백 함수들
   * @param {Function} callbacks.onProgress - 진행률 업데이트 콜백
   * @param {Function} callbacks.onStepChange - 단계 변경 콜백
   * @param {Function} callbacks.onTimeUpdate - 시간 정보 업데이트 콜백
   * @param {Function} callbacks.onComplete - 완료 콜백
   * @param {Function} callbacks.onError - 에러 콜백
   * @param {Function} callbacks.onStagnant - 진행률 정체 콜백
   * @param {Object} options - 모니터링 옵션
   * @returns {Object} 모니터링 제어 객체
   */
  startWebSocketMonitoring: async (inspectionId, callbacks = {}, options = {}) => {
    
    const {
      onProgress,
      onStepChange,
      onTimeUpdate,
      onComplete,
      onError,
      onStagnant,
      onDisconnection
    } = callbacks;

    let lastStep = null;
    let lastPercentage = null;
    let startTime = Date.now();
    let progressHistory = [];
    let stagnantCount = 0;
    let lastUpdateTime = Date.now();
    let unsubscribe = null;
    let isActive = true;

    const { stagnantThreshold = 8 } = options;

    try {
      // Ensure WebSocket connection
      const token = webSocketService.getStoredToken();
      
      if (!token) {
        throw new Error('No authentication token available for WebSocket connection');
      }

      const connectionStatus = webSocketService.getConnectionStatus();

      if (!connectionStatus.isConnected) {
        await webSocketService.connect(token);
      }

      // Subscribe to inspection updates
      unsubscribe = webSocketService.subscribeToInspection(inspectionId, (message) => {
        if (!isActive) {
          return;
        }
        const { type, data } = message;
        const now = Date.now();

        switch (type) {
          case 'progress':
            handleProgressUpdate(data, now);
            break;

          case 'status_change':
            handleStatusChange(data, now);
            break;

          case 'complete':
            handleCompletion(data, now);
            break;

          case 'subscription_confirmed':
            break;

          case 'disconnected':
            if (onDisconnection) {
              onDisconnection(data);
            }
            break;

          default:
            break;
        }
      });

    } catch (error) {
      
      if (onError) {
        onError({
          code: 'WEBSOCKET_CONNECTION_FAILED',
          message: 'Failed to establish WebSocket connection',
          originalError: error
        });
      }
      return { stop: () => {} };
    }

    const handleProgressUpdate = (data, timestamp) => {
      lastUpdateTime = timestamp;
      const progress = data.progress || {};
      
      // Reset stagnant count on progress update
      stagnantCount = 0;
      
      // Progress change detection
      if (progress.percentage !== lastPercentage) {
        lastPercentage = progress.percentage;
        
        // Update progress history
        progressHistory.push({
          timestamp,
          percentage: progress.percentage,
          step: progress.currentStep,
          resourcesProcessed: progress.resourcesProcessed
        });
        
        // Keep only recent 20 entries
        if (progressHistory.length > 20) {
          progressHistory.shift();
        }
        
        if (onProgress) {
          onProgress({
            percentage: progress.percentage,
            completedSteps: progress.completedSteps,
            totalSteps: progress.totalSteps,
            resourcesProcessed: progress.resourcesProcessed,
            velocity: calculateProgressVelocity(progressHistory),
            trend: calculateProgressTrend(progressHistory),
            stepProgress: progress.stepProgress,
            stepDetails: progress.stepDetails
          });
        }
      }
      
      // Step change detection
      if (progress.currentStep !== lastStep) {
        const previousStep = lastStep;
        lastStep = progress.currentStep;
        
        if (onStepChange) {
          onStepChange({
            currentStep: progress.currentStep,
            previousStep,
            stepStartTime: timestamp,
            completedSteps: progress.completedSteps,
            totalSteps: progress.totalSteps
          });
        }
      }
      
      // Time information update
      if (onTimeUpdate) {
        const elapsedTime = timestamp - (data.startTime || startTime);
        onTimeUpdate({
          elapsedTime,
          estimatedTimeRemaining: data.estimatedTimeRemaining,
          startTime: data.startTime || startTime,
          lastUpdated: timestamp,
          progressVelocity: calculateProgressVelocity(progressHistory)
        });
      }
    };

    const handleStatusChange = (data, timestamp) => {
      lastUpdateTime = timestamp;
      
      // Handle step changes from status updates
      if (data.stepChange) {
        if (onStepChange) {
          onStepChange({
            currentStep: data.stepChange.to,
            previousStep: data.stepChange.from,
            stepStartTime: timestamp,
            stepChangeReason: 'status_update'
          });
        }
      }
    };

    const handleCompletion = (data, timestamp) => {
      // 이미 비활성화된 경우 중복 처리 방지
      if (!isActive) {
        return;
      }
      
      isActive = false;
      
      // 완료 시 진행률을 100%로 업데이트
      if (onProgress) {
        onProgress({
          percentage: 100,
          completedSteps: data.totalSteps || 7,
          totalSteps: data.totalSteps || 7,
          currentStep: 'Inspection completed',
          resourcesProcessed: data.resourcesProcessed || null
        });
      }
      
      if (onComplete) {
        const totalDuration = timestamp - startTime;
        onComplete({
          ...data,
          totalDuration,
          averageVelocity: calculateAverageVelocity(progressHistory),
          completionAccuracy: calculateCompletionAccuracy(data, progressHistory),
          progressHistory: [...progressHistory]
        });
      }
      
      // Cleanup
      cleanup();
    };

    const startStagnationMonitoring = () => {
      // Monitor for stagnation
      const checkStagnation = () => {
        if (!isActive) return;
        
        const now = Date.now();
        const timeSinceLastUpdate = now - lastUpdateTime;
        
        // If no update for more than 10 seconds, increment stagnant count
        if (timeSinceLastUpdate > 10000) {
          stagnantCount++;
          
          if (stagnantCount >= stagnantThreshold && onStagnant) {
            onStagnant({
              stagnantCount,
              currentPercentage: lastPercentage,
              stagnantDuration: timeSinceLastUpdate,
              lastUpdateTime
            });
          }
        }
        
        // Schedule next check
        if (isActive) {
          setTimeout(checkStagnation, 5000); // Check every 5 seconds
        }
      };
      
      // Start stagnation checking
      setTimeout(checkStagnation, 10000); // Start after 10 seconds
    };

    const cleanup = () => {
      isActive = false;
      
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    };

    // Start stagnation monitoring after all functions are defined
    startStagnationMonitoring();

    return {
      stop: cleanup,
      isActive: () => isActive,
      getProgressHistory: () => [...progressHistory],
      getElapsedTime: () => Date.now() - startTime,
      getCurrentVelocity: () => calculateProgressVelocity(progressHistory),
      getConnectionStatus: () => webSocketService.getConnectionStatus(),
      getStagnantCount: () => stagnantCount,
      getCurrentProgress: () => lastPercentage
    };
  }
};

/**
 * 진행률 속도 계산 (percentage per minute)
 * @param {Array} history - 진행률 히스토리
 * @returns {number|null} 진행률 속도
 */
const calculateProgressVelocity = (history) => {
  if (history.length < 2) return null;
  
  const recent = history.slice(-5); // 최근 5개 포인트 사용
  if (recent.length < 2) return null;
  
  const timeDiff = recent[recent.length - 1].timestamp - recent[0].timestamp;
  const progressDiff = recent[recent.length - 1].percentage - recent[0].percentage;
  
  if (timeDiff <= 0) return null;
  
  // percentage per minute
  return (progressDiff / timeDiff) * 60000;
};

/**
 * 진행률 트렌드 계산
 * @param {Array} history - 진행률 히스토리
 * @returns {string} 트렌드 ('accelerating', 'steady', 'decelerating', 'stagnant')
 */
const calculateProgressTrend = (history) => {
  if (history.length < 3) return 'unknown';
  
  const recent = history.slice(-3);
  const velocity1 = (recent[1].percentage - recent[0].percentage) / (recent[1].timestamp - recent[0].timestamp);
  const velocity2 = (recent[2].percentage - recent[1].percentage) / (recent[2].timestamp - recent[1].timestamp);
  
  const velocityChange = velocity2 - velocity1;
  
  if (Math.abs(velocityChange) < 0.0001) return 'steady';
  if (velocityChange > 0.0001) return 'accelerating';
  if (velocityChange < -0.0001) return 'decelerating';
  
  return 'stagnant';
};

/**
 * 평균 진행률 속도 계산
 * @param {Array} history - 진행률 히스토리
 * @returns {number|null} 평균 속도
 */
const calculateAverageVelocity = (history) => {
  if (history.length < 2) return null;
  
  const totalTime = history[history.length - 1].timestamp - history[0].timestamp;
  const totalProgress = history[history.length - 1].percentage - history[0].percentage;
  
  if (totalTime <= 0) return null;
  
  return (totalProgress / totalTime) * 60000; // percentage per minute
};

/**
 * 완료 시간 예측 정확도 계산
 * @param {Object} finalData - 최종 데이터
 * @param {Array} history - 진행률 히스토리
 * @returns {number|null} 정확도 (0-100)
 */
const calculateCompletionAccuracy = (finalData, history) => {
  // 실제 구현에서는 예측된 완료 시간과 실제 완료 시간을 비교
  // 현재는 간단한 구현만 제공
  return null;
};