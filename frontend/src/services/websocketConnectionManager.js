/**
 * WebSocket Connection Manager
 * 웹소켓 연결의 생명주기를 관리하는 유틸리티
 * 하이브리드 접근법: 스마트 연결 관리
 */

class WebSocketConnectionManager {
  constructor(webSocketService) {
    this.webSocketService = webSocketService;
    this.disconnectTimer = null;
    this.lastInspectionTime = null;
    this.config = {
      idleTimeout: 30000, // 30초 후 자동 해제
      immediateDisconnect: false, // 즉시 해제 여부
      smartMode: true, // 스마트 모드 (사용 패턴 기반)
      maxIdleTime: 300000 // 5분 최대 유휴 시간
    };
    this.inspectionHistory = [];
  }

  /**
   * 모든 검사 완료 시 연결 관리 (스마트 모드)
   */
  onAllInspectionsComplete() {
    this.lastInspectionTime = Date.now();
    
    if (this.config.immediateDisconnect) {
      this.disconnectImmediately();
    } else if (this.config.smartMode) {
      this.smartDisconnectDecision();
    } else {
      this.scheduleDisconnect();
    }
  }

  /**
   * 새 검사 시작 시 연결 관리
   */
  onNewInspectionStart() {
    this.cancelScheduledDisconnect();
    this.recordInspectionStart();
  }

  /**
   * 스마트 연결 해제 결정
   * 사용자의 검사 패턴을 분석하여 최적 결정
   */
  smartDisconnectDecision() {
    const recentInspections = this.getRecentInspectionPattern();
    
    if (recentInspections.isFrequentUser) {
      // 자주 사용하는 사용자: 긴 유휴 시간 허용
      console.log('🧠 [ConnectionManager] Frequent user detected, extending idle time');
      this.scheduleDisconnect(this.config.maxIdleTime);
    } else if (recentInspections.hasRecentActivity) {
      // 최근 활동: 짧은 유휴 시간
      console.log('🧠 [ConnectionManager] Recent activity, short idle timeout');
      this.scheduleDisconnect(this.config.idleTimeout);
    } else {
      // 가끔 사용자: 즉시 해제
      console.log('🧠 [ConnectionManager] Infrequent user, disconnecting soon');
      this.scheduleDisconnect(5000); // 5초 후 해제
    }
  }

  /**
   * 검사 시작 기록
   */
  recordInspectionStart() {
    const now = Date.now();
    this.inspectionHistory.push(now);
    
    // 최근 1시간 기록만 유지
    const oneHourAgo = now - 3600000;
    this.inspectionHistory = this.inspectionHistory.filter(time => time > oneHourAgo);
  }

  /**
   * 최근 검사 패턴 분석
   */
  getRecentInspectionPattern() {
    const now = Date.now();
    const recentInspections = this.inspectionHistory.filter(time => now - time < 1800000); // 30분
    const veryRecentInspections = this.inspectionHistory.filter(time => now - time < 300000); // 5분
    
    return {
      isFrequentUser: recentInspections.length >= 3, // 30분 내 3회 이상
      hasRecentActivity: veryRecentInspections.length >= 1, // 5분 내 1회 이상
      totalInspections: this.inspectionHistory.length
    };
  }

  /**
   * 즉시 연결 해제
   */
  disconnectImmediately() {
    console.log('🔌 [ConnectionManager] Disconnecting immediately');
    this.webSocketService.disconnect();
  }

  /**
   * 지연 연결 해제 예약
   */
  scheduleDisconnect(timeout = this.config.idleTimeout) {
    this.cancelScheduledDisconnect();
    
    console.log(`🕐 [ConnectionManager] Scheduling disconnect in ${timeout}ms`);
    this.disconnectTimer = setTimeout(() => {
      if (this.webSocketService.getSubscriptionCount() === 0) {
        console.log('🔌 [ConnectionManager] Auto-disconnecting due to inactivity');
        this.webSocketService.disconnect();
      }
    }, timeout);
  }

  /**
   * 예약된 연결 해제 취소
   */
  cancelScheduledDisconnect() {
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
      console.log('⏰ [ConnectionManager] Cancelled scheduled disconnect');
    }
  }

  /**
   * 설정 업데이트
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }
}

export default WebSocketConnectionManager;