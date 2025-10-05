/**
 * Frontend WebSocket Service 테스트
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.6, 7.7
 */

import webSocketService from '../services/websocketService';

// WebSocket Mock
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    
    // Simulate connection after a short delay
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) this.onopen();
    }, 10);
  }

  send(data) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    
    // Simulate server responses
    const message = JSON.parse(data);
    setTimeout(() => {
      if (message.type === 'ping') {
        this.simulateMessage({
          type: 'pong',
          timestamp: Date.now(),
          validation: message.validation
        });
      } else if (message.type === 'subscribe_inspection') {
        this.simulateMessage({
          type: 'subscription_confirmed',
          data: {
            inspectionId: message.payload.inspectionId,
            timestamp: Date.now()
          }
        });
      }
    }, 5);
  }

  close(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code, reason, wasClean: code === 1000 });
    }
  }

  terminate() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code: 1006, reason: 'Connection terminated', wasClean: false });
    }
  }

  simulateMessage(message) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(message) });
    }
  }

  addEventListener(event, handler) {
    if (event === 'message') {
      const originalHandler = this.onmessage;
      this.onmessage = (e) => {
        if (originalHandler) originalHandler(e);
        handler(e);
      };
    }
  }

  removeEventListener(event, handler) {
    if (event === 'message') {
      this.onmessage = null;
    }
  }
}

MockWebSocket.CONNECTING = 0;
MockWebSocket.OPEN = 1;
MockWebSocket.CLOSING = 2;
MockWebSocket.CLOSED = 3;

// Global WebSocket mock
global.WebSocket = MockWebSocket;

describe('WebSocket Service 테스트', () => {
  beforeEach(() => {
    // Reset service state
    webSocketService.disconnect();
    webSocketService.forceCleanup();
  });

  afterEach(() => {
    webSocketService.disconnect();
  });

  describe('Requirement 7.1: 연결 상태 검증 및 인증', () => {
    test('유효한 토큰으로 연결 성공', async () => {
      const token = 'valid.jwt.token';
      
      await webSocketService.connect(token);
      
      const status = webSocketService.getConnectionStatus();
      expect(status.isConnected).toBe(true);
      expect(status.isConnecting).toBe(false);
      expect(status.reconnectAttempts).toBe(0);
    });

    test('연결 상태 검증', async () => {
      const token = 'valid.jwt.token';
      await webSocketService.connect(token);
      
      const isValid = await webSocketService.validateConnection();
      expect(isValid).toBe(true);
    });

    test('WebSocket 지원 확인', () => {
      const isSupported = webSocketService.isWebSocketSupported();
      expect(isSupported).toBe(true);
    });
  });

  describe('Requirement 7.2: 실시간 업데이트 안정성', () => {
    test('검사 구독 및 업데이트 수신', async () => {
      const token = 'valid.jwt.token';
      await webSocketService.connect(token);
      
      const inspectionId = 'test-inspection-123';
      const updates = [];
      
      const unsubscribe = webSocketService.subscribeToInspection(inspectionId, (update) => {
        updates.push(update);
      });
      
      // Wait for subscription confirmation
      await new Promise(resolve => setTimeout(resolve, 20));
      
      expect(updates.length).toBeGreaterThan(0);
      expect(updates[0].type).toBe('subscription_confirmed');
      
      unsubscribe();
    });

    test('중복 구독 방지', async () => {
      const token = 'valid.jwt.token';
      await webSocketService.connect(token);
      
      const inspectionId = 'test-inspection-456';
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      
      webSocketService.subscribeToInspection(inspectionId, callback1);
      webSocketService.subscribeToInspection(inspectionId, callback2);
      
      await new Promise(resolve => setTimeout(resolve, 20));
      
      const subscriptionCount = webSocketService.getSubscriptionCount();
      expect(subscriptionCount).toBe(1); // Only one inspection subscribed
    });
  });

  describe('Requirement 7.3: 검사 완료 시 구독 정리', () => {
    test('검사 완료 후 자동 구독 해제', async () => {
      const token = 'valid.jwt.token';
      await webSocketService.connect(token);
      
      const inspectionId = 'test-completion-789';
      const updates = [];
      
      webSocketService.subscribeToInspection(inspectionId, (update) => {
        updates.push(update);
      });
      
      // Simulate inspection completion
      const mockWs = webSocketService.ws;
      mockWs.simulateMessage({
        type: 'inspection_complete',
        data: {
          inspectionId,
          status: 'COMPLETED',
          timestamp: Date.now()
        }
      });
      
      await new Promise(resolve => setTimeout(resolve, 20));
      
      // Check if completion message was received
      const completionUpdate = updates.find(u => u.type === 'complete');
      expect(completionUpdate).toBeDefined();
      expect(completionUpdate.data.status).toBe('COMPLETED');
      
      // Check if unsubscribe message was sent (auto-cleanup after 5 seconds)
      await new Promise(resolve => setTimeout(resolve, 5100));
      
      const subscriptionCount = webSocketService.getSubscriptionCount();
      expect(subscriptionCount).toBe(0);
    });
  });

  describe('Requirement 7.4: 클라이언트 연결 종료 시 리소스 정리', () => {
    test('정상적인 연결 종료', async () => {
      const token = 'valid.jwt.token';
      await webSocketService.connect(token);
      
      const inspectionId = 'test-disconnect-123';
      const updates = [];
      
      webSocketService.subscribeToInspection(inspectionId, (update) => {
        updates.push(update);
      });
      
      await new Promise(resolve => setTimeout(resolve, 20));
      
      // Disconnect
      webSocketService.disconnect();
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const status = webSocketService.getConnectionStatus();
      expect(status.isConnected).toBe(false);
      expect(webSocketService.getSubscriptionCount()).toBe(0);
      expect(webSocketService.getQueuedMessageCount()).toBe(0);
      
      // Check if disconnection callback was called
      const disconnectionUpdate = updates.find(u => u.type === 'disconnected');
      expect(disconnectionUpdate).toBeDefined();
    });

    test('강제 정리', () => {
      webSocketService.forceCleanup();
      
      const status = webSocketService.getConnectionStatus();
      expect(status.isConnected).toBe(false);
      expect(status.isConnecting).toBe(false);
      expect(status.reconnectAttempts).toBe(0);
      expect(webSocketService.getSubscriptionCount()).toBe(0);
    });
  });

  describe('Requirement 7.6: 자동 재연결 및 오류 처리', () => {
    test('연결 끊김 시 재연결 시도', async () => {
      const token = 'valid.jwt.token';
      await webSocketService.connect(token);
      
      const originalWs = webSocketService.ws;
      
      // Simulate connection loss
      originalWs.readyState = MockWebSocket.CLOSED;
      originalWs.onclose({ code: 1006, reason: 'Connection lost', wasClean: false });
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const status = webSocketService.getConnectionStatus();
      expect(status.reconnectAttempts).toBeGreaterThan(0);
    });

    test('메시지 큐잉', async () => {
      const token = 'valid.jwt.token';
      
      // Send message before connection
      webSocketService.sendMessage({
        type: 'test_message',
        payload: { test: 'data' }
      });
      
      expect(webSocketService.getQueuedMessageCount()).toBe(1);
      
      // Connect and check if queued message is processed
      await webSocketService.connect(token);
      
      await new Promise(resolve => setTimeout(resolve, 20));
      
      expect(webSocketService.getQueuedMessageCount()).toBe(0);
    });
  });

  describe('Requirement 7.7: 비정상적인 연결 상태 감지', () => {
    test('연결 상태 건강성 검사', async () => {
      const token = 'valid.jwt.token';
      await webSocketService.connect(token);
      
      const health = webSocketService.checkConnectionHealth();
      
      expect(health.isHealthy).toBe(true);
      expect(health.issues).toHaveLength(0);
      expect(health.readyState).toBe(MockWebSocket.OPEN);
      expect(health.subscriptionCount).toBe(0);
      expect(health.queuedMessages).toBe(0);
    });

    test('비정상 상태 감지', () => {
      // Simulate problematic state
      webSocketService.messageQueue = new Array(15).fill({ type: 'test' });
      webSocketService.connectionStatus.reconnectAttempts = 3;
      
      const health = webSocketService.checkConnectionHealth();
      
      expect(health.isHealthy).toBe(false);
      expect(health.issues.length).toBeGreaterThan(0);
      expect(health.issues).toContain('Message queue is growing (possible connection issue)');
    });

    test('연결 통계 정보', async () => {
      const token = 'valid.jwt.token';
      await webSocketService.connect(token);
      
      const inspectionId = 'test-stats-123';
      webSocketService.subscribeToInspection(inspectionId, () => {});
      
      await new Promise(resolve => setTimeout(resolve, 20));
      
      expect(webSocketService.getSubscriptionCount()).toBe(1);
      expect(webSocketService.getReadyState()).toBe(MockWebSocket.OPEN);
    });
  });

  describe('토큰 관리', () => {
    test('저장된 토큰 가져오기', () => {
      // Mock localStorage
      const mockToken = 'stored.jwt.token';
      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: jest.fn(() => mockToken),
          setItem: jest.fn(),
          removeItem: jest.fn(),
        },
        writable: true,
      });
      
      const storedToken = webSocketService.getStoredToken();
      expect(storedToken).toBe(mockToken);
    });
  });

  describe('에러 처리', () => {
    test('잘못된 메시지 형식 처리', async () => {
      const token = 'valid.jwt.token';
      await webSocketService.connect(token);
      
      const mockWs = webSocketService.ws;
      
      // Simulate invalid JSON message
      expect(() => {
        mockWs.onmessage({ data: 'invalid json' });
      }).not.toThrow();
    });

    test('콜백 에러 처리', async () => {
      const token = 'valid.jwt.token';
      await webSocketService.connect(token);
      
      const inspectionId = 'test-error-callback';
      const errorCallback = () => {
        throw new Error('Callback error');
      };
      
      webSocketService.subscribeToInspection(inspectionId, errorCallback);
      
      const mockWs = webSocketService.ws;
      
      // Should not throw even if callback throws
      expect(() => {
        mockWs.simulateMessage({
          type: 'progress_update',
          data: {
            inspectionId,
            progress: { percentage: 50 }
          }
        });
      }).not.toThrow();
    });
  });
});