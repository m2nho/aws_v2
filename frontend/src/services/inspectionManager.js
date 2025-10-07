/**
 * Inspection Manager Service
 * 검사 시작과 WebSocket 관리를 통합하는 서비스
 */

import { inspectionService } from './index';
import webSocketService from './websocketService';
import swWebSocketClient from './serviceWorkerWebSocket';
import webSocketManager from './webSocketManager';

class InspectionManager {
  constructor() {
    this.inspectionContextRef = null;
    this.activeInspections = new Map();
    // 개발 환경에서는 Service Worker 비활성화
    this.useServiceWorker = process.env.NODE_ENV === 'production';
    this.disconnectScheduled = false; // 중복 연결 해제 방지
    
    console.log(`🔧 [InspectionManager] Service Worker mode: ${this.useServiceWorker ? 'enabled' : 'disabled'} (${process.env.NODE_ENV})`);
  }

  // InspectionContext 참조 설정
  setInspectionContext(contextRef) {
    this.inspectionContextRef = contextRef;
  }

  // WebSocket 연결 보장 (Service Worker 또는 직접 연결)
  async ensureWebSocketConnection() {
    const token = webSocketService.getStoredToken();
    if (!token) {
      console.warn('⚠️ [InspectionManager] No auth token available');
      return;
    }

    if (this.useServiceWorker) {
      // Service Worker를 통한 연결 시도
      try {
        const connected = await swWebSocketClient.connectWebSocket(token);
        if (connected) {
          console.log('🔗 [InspectionManager] WebSocket connected via Service Worker');
          return;
        }
      } catch (error) {
        console.warn('⚠️ [InspectionManager] Service Worker connection failed, falling back to direct connection:', error.message);
        this.useServiceWorker = false; // Service Worker 비활성화
      }
    }

    // 직접 연결 (fallback 또는 기본 모드)
    if (!webSocketService.getConnectionStatus().isConnected) {
      try {
        await webSocketService.connect(token);
        console.log('🔗 [InspectionManager] Direct WebSocket connected');
      } catch (error) {
        console.warn('⚠️ [InspectionManager] Direct WebSocket connection failed:', error.message);
      }
    }
  }

  // 검사 시작 및 자동 등록
  async startInspectionWithAutoTracking(serviceType, selectedItems, assumeRoleArn) {
    try {
      console.log('🚀 [InspectionManager] Starting inspection with auto tracking:', {
        serviceType,
        selectedItemsCount: selectedItems?.length || 0
      });

      // 백엔드에 검사 시작 요청
      const response = await inspectionService.startInspection({
        serviceType,
        assumeRoleArn,
        inspectionConfig: {
          selectedItems: selectedItems || []
        }
      });
      
      if (response.success) {
        const { batchId, subscriptionId, inspectionJobs } = response.data;
        
        console.log('✅ [InspectionManager] Backend response received:', {
          batchId,
          subscriptionId,
          jobCount: inspectionJobs?.length || 0
        });

        // subscriptionId가 없으면 batchId를 사용
        const actualSubscriptionId = subscriptionId || batchId;
        
        // InspectionContext에 검사 등록
        const inspectionData = {
          inspectionId: actualSubscriptionId,
          batchId: batchId,
          serviceType: serviceType,
          itemNames: inspectionJobs?.map(job => job.itemName) || [],
          totalItems: inspectionJobs?.length || 0,
          status: 'PENDING',
          progress: 0
        };

        // Context에 등록
        if (this.inspectionContextRef) {
          const inspection = this.inspectionContextRef.startInspection(inspectionData);
          console.log('📝 [InspectionManager] Registered in context:', inspection);
        }

        // 로컬 관리에도 추가
        this.activeInspections.set(batchId, inspectionData);

        // 새로운 WebSocketManager를 통한 추적 시작
        const token = webSocketService.getStoredToken();
        if (token) {
          console.log('🎯 [InspectionManager] Starting WebSocket tracking via WebSocketManager');
          await webSocketManager.startInspectionTracking(actualSubscriptionId, token);
        } else {
          console.warn('⚠️ [InspectionManager] No auth token available for WebSocket');
        }

        return {
          success: true,
          inspection: inspectionData,
          subscriptionId: actualSubscriptionId,
          batchId
        };
      } else {
        throw new Error(response.error?.message || '검사 시작에 실패했습니다');
      }
    } catch (error) {
      console.error('🚨 [InspectionManager] Failed to start inspection:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // WebSocket 구독 시작
  subscribeToInspection(subscriptionId, batchId) {
    if (!subscriptionId) {
      console.warn('⚠️ [InspectionManager] No subscriptionId provided, skipping WebSocket subscription');
      return () => {}; // 빈 unsubscribe 함수 반환
    }
    
    console.log('🔔 [InspectionManager] Starting WebSocket subscription:', {
      subscriptionId,
      batchId
    });

    const unsubscribe = webSocketService.subscribeToInspection(subscriptionId, (message) => {
      console.log('📨 [InspectionManager] WebSocket message received:', message);
      
      const { type, data } = message;
      
      switch (type) {
        case 'progress':
          this.handleProgressUpdate(data);
          break;
          
        case 'status_change':
          this.handleStatusChange(data);
          break;
          
        case 'complete':
          this.handleInspectionComplete(data);
          break;
          
        case 'subscription_moved':
          console.log('🔄 [InspectionManager] Subscription moved:', {
            from: data.fromInspectionId,
            to: data.toBatchId
          });
          // 새로운 배치 ID로 구독 업데이트
          if (data.toBatchId !== subscriptionId) {
            this.subscribeToInspection(data.toBatchId, batchId);
          }
          break;
          
        case 'disconnected':
          console.log('🔌 [InspectionManager] WebSocket disconnected');
          break;
          
        default:
          console.log('📨 [InspectionManager] Unknown message type:', type);
      }
    });

    return unsubscribe;
  }

  // 진행률 업데이트 처리 (최적화된 버전)
  handleProgressUpdate(data) {
    const { inspectionId } = data;
    
    // Context 업데이트 (주요 상태 관리)
    if (this.inspectionContextRef) {
      this.inspectionContextRef.updateInspectionProgress(inspectionId, data);
    }

    // 로컬 상태 업데이트 (성능 최적화)
    if (this.activeInspections.has(inspectionId)) {
      const inspection = this.activeInspections.get(inspectionId);
      const newProgress = data.progress?.percentage ?? data.percentage ?? inspection.progress;
      const newStatus = data.status || inspection.status;
      
      // 의미있는 변경사항만 업데이트 (1% 이상 변화 또는 상태 변경)
      const progressChanged = Math.abs(newProgress - inspection.progress) >= 1;
      const statusChanged = inspection.status !== newStatus;
      
      if (progressChanged || statusChanged) {
        this.activeInspections.set(inspectionId, {
          ...inspection,
          progress: newProgress,
          currentStep: data.progress?.currentStep || data.currentStep || inspection.currentStep,
          completedItems: data.progress?.completedItems || data.completedItems || inspection.completedItems,
          totalItems: data.progress?.totalItems || data.totalItems || inspection.totalItems,
          status: newStatus,
          lastUpdated: Date.now()
        });
      }
    }
  }

  // 상태 변경 처리
  handleStatusChange(data) {
    this.handleProgressUpdate(data); // 동일한 로직 사용
  }

  // 검사 완료 처리 (단순화됨)
  handleInspectionComplete(data) {
    const { inspectionId } = data;
    
    console.log('✅ [InspectionManager] Inspection completed:', inspectionId);
    
    // InspectionContext 업데이트
    if (this.inspectionContextRef) {
      this.inspectionContextRef.completeInspection(inspectionId, data);
    }

    // 로컬 상태에서 제거
    this.activeInspections.delete(inspectionId);
    
    // WebSocketManager에게 완료 알림 (자동으로 연결 해제 관리됨)
    webSocketManager.completeInspection(inspectionId);
  }

  // 모든 검사 완료 시 호출되는 메서드 (더 이상 필요 없음 - WebSocketManager가 처리)
  onAllInspectionsComplete() {
    console.log('ℹ️ [InspectionManager] All inspections completed callback (handled by WebSocketManager)');
    // WebSocketManager가 자동으로 처리하므로 별도 작업 불필요
  }

  // 활성 검사 목록 가져오기
  getActiveInspections() {
    return Array.from(this.activeInspections.values());
  }

  // 특정 검사 정보 가져오기
  getInspection(inspectionId) {
    return this.activeInspections.get(inspectionId);
  }
  // Service Worker 모드 전환
  setServiceWorkerMode(enabled) {
    this.useServiceWorker = enabled;
    console.log(`🔄 [InspectionManager] Service Worker mode: ${enabled ? 'enabled' : 'disabled'}`);
  }

  // Service Worker에서 검사 이어받기 (탭 전환 시)
  takeOverInspection(inspection) {
    console.log('👑 [InspectionManager] Taking over inspection from Service Worker:', inspection.inspectionId);
    
    // 직접 WebSocket 연결로 전환
    this.useServiceWorker = false;
    this.ensureWebSocketConnection().then(() => {
      this.subscribeToInspection(inspection.inspectionId, inspection.batchId);
    });
  }
}

// 싱글톤 인스턴스 생성
const inspectionManager = new InspectionManager();

// 전역 참조 설정 (Service Worker에서 접근 가능하도록)
window.inspectionManager = inspectionManager;

export default inspectionManager;