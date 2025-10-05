/**
 * WebSocket 디버깅 유틸리티
 * 웹소켓 연결 상태를 확인하고 문제를 진단하는 도구
 */

import webSocketService from '../services/websocketService';

class WebSocketDebugger {
  constructor() {
    this.debugLog = [];
    this.isDebugging = false;
  }

  /**
   * 디버깅 시작
   */
  startDebugging() {
    this.isDebugging = true;
    this.debugLog = [];
    this.log('🔍 WebSocket 디버깅 시작');
    
    // 현재 상태 로깅
    this.logCurrentState();
    
    // 주기적 상태 체크
    this.statusCheckInterval = setInterval(() => {
      this.checkConnectionHealth();
    }, 5000);
  }

  /**
   * 디버깅 중지
   */
  stopDebugging() {
    this.isDebugging = false;
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
    }
    this.log('🛑 WebSocket 디버깅 중지');
  }

  /**
   * 로그 기록
   */
  log(message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      message,
      data
    };
    
    this.debugLog.push(logEntry);
    
    // 최대 100개 로그만 유지
    if (this.debugLog.length > 100) {
      this.debugLog.shift();
    }
  }

  /**
   * 현재 상태 로깅
   */
  logCurrentState() {
    const connectionStatus = webSocketService.getConnectionStatus();
    const readyState = webSocketService.getReadyState();
    const subscriptionCount = webSocketService.getSubscriptionCount();
    const queuedMessages = webSocketService.getQueuedMessageCount();
    const token = webSocketService.getStoredToken();

    this.log('📊 현재 WebSocket 상태', {
      connectionStatus,
      readyState: this.getReadyStateText(readyState),
      subscriptionCount,
      queuedMessages,
      hasToken: !!token,
      tokenPreview: token ? token.substring(0, 20) + '...' : null
    });
  }

  /**
   * 연결 상태 텍스트 변환
   */
  getReadyStateText(readyState) {
    const states = {
      0: 'CONNECTING',
      1: 'OPEN',
      2: 'CLOSING',
      3: 'CLOSED'
    };
    return states[readyState] || 'UNKNOWN';
  }

  /**
   * 연결 건강성 체크
   */
  async checkConnectionHealth() {
    if (!this.isDebugging) return;

    const health = webSocketService.checkConnectionHealth();
    
    if (!health.isHealthy) {
      this.log('⚠️ 연결 상태 이상 감지', health);
      
      // 자동 복구 시도
      if (health.issues.includes('Max reconnection attempts reached')) {
        this.log('🔄 최대 재연결 시도 도달, 강제 재연결 시도');
        await this.forceReconnect();
      }
    } else {
      this.log('✅ 연결 상태 정상', {
        readyState: this.getReadyStateText(health.readyState),
        subscriptions: health.subscriptionCount,
        queuedMessages: health.queuedMessages
      });
    }
  }

  /**
   * 강제 재연결
   */
  async forceReconnect() {
    try {
      this.log('🔄 강제 재연결 시작');
      
      // 기존 연결 정리
      webSocketService.forceCleanup();
      
      // 토큰 재확인
      const token = webSocketService.getStoredToken();
      if (!token) {
        this.log('❌ 토큰이 없어 재연결 불가');
        return false;
      }

      // 재연결 시도
      await webSocketService.connect(token);
      this.log('✅ 강제 재연결 성공');
      return true;
      
    } catch (error) {
      this.log('❌ 강제 재연결 실패', error.message);
      return false;
    }
  }

  /**
   * 연결 테스트
   */
  async testConnection() {
    this.log('🧪 연결 테스트 시작');
    
    try {
      const isValid = await webSocketService.validateConnection();
      if (isValid) {
        this.log('✅ 연결 테스트 성공');
      } else {
        this.log('❌ 연결 테스트 실패');
        
        // 재연결 시도
        const reconnected = await this.forceReconnect();
        if (reconnected) {
          const retestResult = await webSocketService.validateConnection();
          this.log(retestResult ? '✅ 재연결 후 테스트 성공' : '❌ 재연결 후에도 테스트 실패');
        }
      }
    } catch (error) {
      this.log('❌ 연결 테스트 중 오류', error.message);
    }
  }

  /**
   * 구독 테스트
   */
  testSubscription(inspectionId) {
    this.log('📋 구독 테스트 시작', { inspectionId });
    
    let messageReceived = false;
    
    const unsubscribe = webSocketService.subscribeToInspection(inspectionId, (message) => {
      messageReceived = true;
      this.log('📨 테스트 메시지 수신', message);
    });

    // 5초 후 결과 확인
    setTimeout(() => {
      if (messageReceived) {
        this.log('✅ 구독 테스트 성공');
      } else {
        this.log('⚠️ 구독 테스트 - 메시지 미수신');
      }
      unsubscribe();
    }, 5000);
  }

  /**
   * 디버그 리포트 생성
   */
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      connectionStatus: webSocketService.getConnectionStatus(),
      readyState: webSocketService.getReadyState(),
      subscriptionCount: webSocketService.getSubscriptionCount(),
      queuedMessages: webSocketService.getQueuedMessageCount(),
      health: webSocketService.checkConnectionHealth(),
      logs: [...this.debugLog]
    };

    return report;
  }

  /**
   * 로그 다운로드
   */
  downloadLogs() {
    const report = this.generateReport();
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `websocket-debug-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    this.log('💾 디버그 로그 다운로드 완료');
  }

  /**
   * 전체 진단 실행
   */
  async runFullDiagnosis() {
    this.log('🔍 전체 진단 시작');
    
    // 1. 현재 상태 확인
    this.logCurrentState();
    
    // 2. 연결 테스트
    await this.testConnection();
    
    // 3. 건강성 체크
    const health = webSocketService.checkConnectionHealth();
    this.log('🏥 건강성 체크 결과', health);
    
    // 4. 브라우저 지원 확인
    const isSupported = webSocketService.isWebSocketSupported();
    this.log('🌐 브라우저 WebSocket 지원', { supported: isSupported });
    
    // 5. 리포트 생성
    const report = this.generateReport();
    
    this.log('✅ 전체 진단 완료');
    return report;
  }
}

// 싱글톤 인스턴스 생성
const webSocketDebugger = new WebSocketDebugger();

// 개발 환경에서 전역 접근 가능하도록 설정
if (process.env.NODE_ENV === 'development') {
  window.wsDebugger = webSocketDebugger;
}

export default webSocketDebugger;