/**
 * WebSocket Manager - 완전히 새로운 WebSocket 관리 시스템
 * 검사 완료 시 확실한 연결 해제를 보장
 */

import webSocketService from './websocketService';

class WebSocketManager {
  constructor() {
    this.activeInspections = new Set(); // Set으로 간단하게 관리
    this.disconnectTimer = null;
    this.isDisconnecting = false;
    
    console.log('🔧 [WebSocketManager] Initialized');
  }

  /**
   * 검사 시작 시 WebSocket 연결 및 추적 시작
   */
  async startInspectionTracking(inspectionId, token) {
    console.log('🚀 [WebSocketManager] Starting inspection tracking:', inspectionId);
    
    // 활성 검사 목록에 추가
    this.activeInspections.add(inspectionId);
    
    // 연결 해제 타이머가 있다면 취소
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
      console.log('⏰ [WebSocketManager] Cancelled disconnect timer - new inspection started');
    }
    
    this.isDisconnecting = false;
    
    // WebSocket 연결 (이미 연결되어 있다면 스킵)
    if (!webSocketService.getConnectionStatus().isConnected) {
      try {
        await webSocketService.connect(token);
        console.log('🔗 [WebSocketManager] WebSocket connected');
      } catch (error) {
        console.error('❌ [WebSocketManager] WebSocket connection failed:', error);
        return false;
      }
    }
    
    // 검사 구독
    const unsubscribe = webSocketService.subscribeToInspection(inspectionId, (message) => {
      this.handleWebSocketMessage(inspectionId, message);
    });
    
    console.log('✅ [WebSocketManager] Inspection tracking started:', {
      inspectionId,
      totalActive: this.activeInspections.size
    });
    
    return unsubscribe;
  }

  /**
   * WebSocket 메시지 처리
   */
  handleWebSocketMessage(inspectionId, message) {
    const { type, data } = message;
    
    switch (type) {
      case 'complete':
        console.log('🏁 [WebSocketManager] Inspection completed:', inspectionId);
        this.completeInspection(inspectionId);
        break;
        
      case 'progress':
        // 100% 완료 시 자동 완료 처리
        const progress = data.progress?.percentage ?? data.percentage;
        if (progress >= 100) {
          console.log('💯 [WebSocketManager] Auto-completing at 100%:', inspectionId);
          this.completeInspection(inspectionId);
        }
        break;
        
      default:
        // 다른 메시지는 그대로 전달 (기존 시스템과 호환)
        break;
    }
  }

  /**
   * 검사 완료 처리
   */
  completeInspection(inspectionId) {
    if (!this.activeInspections.has(inspectionId)) {
      console.log('⚠️ [WebSocketManager] Inspection already completed:', inspectionId);
      return;
    }
    
    // 활성 목록에서 제거
    this.activeInspections.delete(inspectionId);
    
    console.log('✅ [WebSocketManager] Inspection completed and removed:', {
      inspectionId,
      remainingActive: this.activeInspections.size,
      activeList: Array.from(this.activeInspections)
    });
    
    // 모든 검사가 완료되었는지 확인
    if (this.activeInspections.size === 0) {
      console.log('🎉 [WebSocketManager] All inspections completed - scheduling disconnect');
      this.scheduleDisconnect();
    }
  }

  /**
   * WebSocket 연결 해제 스케줄링
   */
  scheduleDisconnect() {
    // 이미 연결 해제 중이면 스킵
    if (this.isDisconnecting) {
      console.log('⚠️ [WebSocketManager] Already disconnecting, skipping');
      return;
    }
    
    // 기존 타이머가 있다면 취소
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
    }
    
    this.isDisconnecting = true;
    
    // 2초 후 연결 해제
    this.disconnectTimer = setTimeout(() => {
      this.executeDisconnect();
    }, 2000);
    
    console.log('⏰ [WebSocketManager] Disconnect scheduled in 2 seconds');
  }

  /**
   * WebSocket 연결 해제 실행
   */
  executeDisconnect() {
    // 마지막 순간 확인
    if (this.activeInspections.size > 0) {
      console.log('🔄 [WebSocketManager] New inspections detected, cancelling disconnect:', {
        activeCount: this.activeInspections.size,
        activeList: Array.from(this.activeInspections)
      });
      this.isDisconnecting = false;
      this.disconnectTimer = null;
      return;
    }
    
    console.log('🔌 [WebSocketManager] Executing WebSocket disconnect');
    
    try {
      webSocketService.disconnect();
      console.log('✅ [WebSocketManager] WebSocket disconnected successfully');
    } catch (error) {
      console.error('❌ [WebSocketManager] WebSocket disconnect failed:', error);
    }
    
    // 상태 리셋
    this.isDisconnecting = false;
    this.disconnectTimer = null;
    
    console.log('🧹 [WebSocketManager] Disconnect completed');
  }

  /**
   * 강제 검사 제거 (수동 취소 등)
   */
  forceRemoveInspection(inspectionId) {
    console.log('🛑 [WebSocketManager] Force removing inspection:', inspectionId);
    this.completeInspection(inspectionId);
  }

  /**
   * 현재 활성 검사 수 반환
   */
  getActiveInspectionCount() {
    return this.activeInspections.size;
  }

  /**
   * 현재 활성 검사 목록 반환
   */
  getActiveInspections() {
    return Array.from(this.activeInspections);
  }

  /**
   * 연결 해제 취소 (새 검사 시작 시)
   */
  cancelDisconnect() {
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
      this.isDisconnecting = false;
      console.log('⏰ [WebSocketManager] Disconnect cancelled');
    }
  }

  /**
   * 상태 정보 반환
   */
  getStatus() {
    return {
      activeInspections: this.activeInspections.size,
      isDisconnecting: this.isDisconnecting,
      hasDisconnectTimer: !!this.disconnectTimer,
      webSocketConnected: webSocketService.getConnectionStatus().isConnected
    };
  }
}

// 싱글톤 인스턴스
const webSocketManager = new WebSocketManager();

export default webSocketManager;