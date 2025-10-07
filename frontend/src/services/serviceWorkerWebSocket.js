/**
 * Service Worker WebSocket Client
 * Service Worker와 통신하여 WebSocket 연결을 관리하는 클라이언트
 */

class ServiceWorkerWebSocketClient {
  constructor() {
    this.serviceWorker = null;
    this.isRegistered = false;
    this.listeners = new Map();
    this.messageId = 0;
    
    this.initialize();
  }

  /**
   * Service Worker 초기화
   */
  async initialize() {
    if (!('serviceWorker' in navigator)) {
      console.warn('⚠️ [SW-Client] Service Worker not supported');
      return;
    }

    try {
      // 개발 환경에서는 Service Worker 비활성화 (선택적)
      if (process.env.NODE_ENV === 'development') {
        console.log('🔧 [SW-Client] Development mode - Service Worker registration skipped');
        return;
      }

      // Service Worker 등록
      const swUrl = `${process.env.PUBLIC_URL}/sw-websocket.js`;
      console.log('🔄 [SW-Client] Attempting to register Service Worker:', swUrl);
      
      const registration = await navigator.serviceWorker.register(swUrl, {
        scope: '/'
      });

      console.log('✅ [SW-Client] Service Worker registered successfully');

      // 활성 Service Worker 가져오기
      this.serviceWorker = registration.active || registration.waiting || registration.installing;

      if (this.serviceWorker) {
        this.setupMessageListener();
        this.registerWithServiceWorker();
        this.isRegistered = true;
        console.log('🎯 [SW-Client] Service Worker is ready');
      } else {
        console.log('⏳ [SW-Client] Waiting for Service Worker to activate...');
        
        // Service Worker가 활성화될 때까지 대기
        await new Promise((resolve) => {
          const checkWorker = () => {
            if (registration.active) {
              this.serviceWorker = registration.active;
              this.setupMessageListener();
              this.registerWithServiceWorker();
              this.isRegistered = true;
              console.log('🎯 [SW-Client] Service Worker activated and ready');
              resolve();
            } else {
              setTimeout(checkWorker, 100);
            }
          };
          checkWorker();
        });
      }

      // Service Worker 상태 변경 감지
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated') {
              this.serviceWorker = newWorker;
              this.setupMessageListener();
              this.registerWithServiceWorker();
              console.log('🔄 [SW-Client] Service Worker updated and activated');
            }
          });
        }
      });

    } catch (error) {
      console.error('❌ [SW-Client] Service Worker registration failed:', error);
      // Service Worker 실패 시 fallback 모드로 전환
      this.isRegistered = false;
    }
  }

  /**
   * Service Worker 메시지 리스너 설정
   */
  setupMessageListener() {
    navigator.serviceWorker.addEventListener('message', (event) => {
      this.handleServiceWorkerMessage(event.data);
    });
  }

  /**
   * Service Worker에 클라이언트 등록
   */
  registerWithServiceWorker() {
    this.sendToServiceWorker({
      type: 'REGISTER_CLIENT'
    });
  }

  /**
   * Service Worker 메시지 처리
   */
  handleServiceWorkerMessage(message) {
    const { type, data } = message;

    console.log('📨 [SW-Client] Message from Service Worker:', {
      type,
      inspectionId: data?.inspectionId,
      progress: data?.progress,
      status: data?.status,
      timestamp: new Date().toISOString()
    });

    switch (type) {
      case 'WEBSOCKET_CONNECTED':
        console.log('🔌 [SW-Client] WebSocket connected via Service Worker');
        this.notifyListeners('connected', data);
        break;

      case 'WEBSOCKET_DISCONNECTED':
        console.log('🔌 [SW-Client] WebSocket disconnected via Service Worker');
        this.notifyListeners('disconnected', data);
        break;

      case 'INSPECTION_PROGRESS':
        console.log('📊 [SW-Client] Progress update received:', {
          inspectionId: data.inspectionId,
          progress: data.progress,
          status: data.status,
          currentStep: data.currentStep
        });
        this.notifyListeners('progress', data);
        break;

      case 'INSPECTION_COMPLETE':
        console.log('✅ [SW-Client] Completion message received:', {
          inspectionId: data.inspectionId,
          status: data.status,
          completedAt: data.completedAt
        });
        this.notifyListeners('complete', data);
        break;

      case 'INSPECTION_STATE_SYNC':
        console.log('🔄 [SW-Client] Syncing inspection state from Service Worker:', {
          count: Array.isArray(data) ? data.length : 0,
          inspections: Array.isArray(data) ? data.map(i => ({
            id: i.inspectionId,
            progress: i.progress,
            status: i.status
          })) : []
        });
        this.notifyListeners('state_sync', data);
        break;

      default:
        console.log('📨 [SW-Client] Unknown message from Service Worker:', type);
    }
  }

  /**
   * WebSocket 연결 시작
   */
  async connectWebSocket(token) {
    if (!this.isRegistered) {
      console.warn('⚠️ [SW-Client] Service Worker not registered yet');
      return false;
    }

    this.sendToServiceWorker({
      type: 'CONNECT_WEBSOCKET',
      data: { token }
    });

    return true;
  }

  /**
   * 검사 추적 시작
   */
  startInspectionTracking(inspectionData) {
    this.sendToServiceWorker({
      type: 'START_INSPECTION',
      data: inspectionData
    });
  }

  /**
   * 검사 추적 중단
   */
  stopInspectionTracking(inspectionId) {
    this.sendToServiceWorker({
      type: 'STOP_INSPECTION',
      data: { inspectionId }
    });
  }

  /**
   * WebSocket 연결 해제
   */
  disconnectWebSocket() {
    console.log('🔌 [SW-Client] Requesting WebSocket disconnection');
    
    this.sendToServiceWorker({
      type: 'DISCONNECT_WEBSOCKET'
    });
    
    // 로컬 상태 정리
    this.listeners.clear();
    console.log('🧹 [SW-Client] Cleared all listeners');
  }

  /**
   * 이벤트 리스너 등록
   */
  addEventListener(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);

    // 제거 함수 반환
    return () => {
      const eventListeners = this.listeners.get(event);
      if (eventListeners) {
        eventListeners.delete(callback);
      }
    };
  }

  /**
   * 리스너들에게 알림
   */
  notifyListeners(event, data) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('❌ [SW-Client] Error in event listener:', error);
        }
      });
    }
  }

  /**
   * Service Worker에 메시지 전송
   */
  sendToServiceWorker(message) {
    if (!this.serviceWorker) {
      console.warn('⚠️ [SW-Client] Service Worker not available');
      return;
    }

    try {
      this.serviceWorker.postMessage({
        ...message,
        id: ++this.messageId,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('❌ [SW-Client] Failed to send message to Service Worker:', error);
    }
  }

  /**
   * 연결 상태 확인
   */
  isConnected() {
    return this.isRegistered;
  }

  /**
   * 정리 작업
   */
  cleanup() {
    this.sendToServiceWorker({
      type: 'UNREGISTER_CLIENT'
    });
    
    this.listeners.clear();
  }
}

// 싱글톤 인스턴스 생성
const swWebSocketClient = new ServiceWorkerWebSocketClient();

// 페이지 언로드 시 정리
window.addEventListener('beforeunload', () => {
  swWebSocketClient.cleanup();
});

export default swWebSocketClient;