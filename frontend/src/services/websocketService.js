/**
 * WebSocket Service for Frontend
 * 프론트엔드 WebSocket 연결 및 실시간 업데이트 관리
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */

class WebSocketService {
  constructor() {
    this.ws = null;
    this.connectionStatus = {
      isConnected: false,
      isConnecting: false,
      lastConnected: null,
      reconnectAttempts: 0,
      maxReconnectAttempts: 5
    };
    
    this.subscriptions = new Map(); // Map<inspectionId, Set<callback>>
    this.messageQueue = []; // Queue for messages sent before connection
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.token = null;
    this.inspectionContext = null; // InspectionContext 참조
    this.lastProgressData = null; // 중복 메시지 필터링용
    this.messageBuffer = []; // 메시지 배치 처리용
    this.bufferTimer = null;
    
    // Configuration
    this.config = {
      reconnectDelay: 1000, // Start with 1 second
      maxReconnectDelay: 30000, // Max 30 seconds
      heartbeatInterval: 30000, // 30 seconds
      connectionTimeout: 10000, // 10 seconds
      bufferDelay: 50 // 메시지 배치 처리 지연 시간 (ms)
    };
    
    this.logger = this.createLogger();
  }

  /**
   * Connect to WebSocket server
   * @param {string} token - JWT authentication token
   * @returns {Promise<void>}
   */
  async connect(token) {
    if (this.connectionStatus.isConnecting || this.connectionStatus.isConnected) {
      return;
    }

    this.token = token;
    this.connectionStatus.isConnecting = true;
    
    return new Promise((resolve, reject) => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = process.env.REACT_APP_WS_HOST || 'localhost:5000';
        const wsUrl = `${protocol}//${host}/ws/inspections?token=${encodeURIComponent(token)}`;
        
        this.logger.info('Connecting to WebSocket', { url: wsUrl.replace(/token=[^&]+/, 'token=***') });
        
        this.ws = new WebSocket(wsUrl);
        
        // Connection timeout
        const timeout = setTimeout(() => {
          if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
            this.ws.close();
            reject(new Error('WebSocket connection timeout'));
          }
        }, this.config.connectionTimeout);
        
        this.ws.onopen = () => {
          clearTimeout(timeout);
          this.connectionStatus.isConnected = true;
          this.connectionStatus.isConnecting = false;
          this.connectionStatus.lastConnected = Date.now();
          this.connectionStatus.reconnectAttempts = 0;
          
          this.logger.info('WebSocket connected successfully');
          
          // Process queued messages
          this.processMessageQueue();
          
          // Start heartbeat
          this.startHeartbeat();
          
          resolve();
        };
        
        this.ws.onmessage = (event) => {
          this.handleMessage(event);
        };
        
        this.ws.onclose = (event) => {
          clearTimeout(timeout);
          this.handleDisconnection(event);
          
          if (this.connectionStatus.isConnecting) {
            reject(new Error(`WebSocket connection failed: ${event.reason || 'Unknown reason'}`));
          }
        };
        
        this.ws.onerror = (error) => {
          clearTimeout(timeout);
          this.logger.error('WebSocket error', error);
          
          if (this.connectionStatus.isConnecting) {
            reject(error);
          }
        };
        
      } catch (error) {
        this.connectionStatus.isConnecting = false;
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   * Requirements: 7.4 - 클라이언트 연결 종료 시 리소스 정리
   */
  disconnect() {
    this.logger.info('Disconnecting WebSocket');
    
    // Clear timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    // Send unsubscribe messages for all active subscriptions
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.subscriptions.forEach((callbacks, inspectionId) => {
        this.sendMessage({
          type: 'unsubscribe_inspection',
          payload: { inspectionId }
        });
      });
      
      // Wait a bit for unsubscribe messages to be sent
      setTimeout(() => {
        this.finalizeDisconnection();
      }, 100);
    } else {
      this.finalizeDisconnection();
    }
  }

  /**
   * Finalize disconnection process
   * @private
   */
  finalizeDisconnection() {
    // Close connection
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    
    // Reset status
    this.connectionStatus.isConnected = false;
    this.connectionStatus.isConnecting = false;
    this.connectionStatus.reconnectAttempts = 0;
    
    // Clear subscriptions and notify callbacks about disconnection
    if (this.subscriptions.size > 0) {
      
      this.subscriptions.forEach((callbacks, inspectionId) => {
        callbacks.forEach(callback => {
          try {
            callback({
              type: 'disconnected',
              data: {
                inspectionId,
                reason: 'Client disconnect',
                timestamp: Date.now()
              }
            });
          } catch (error) {
            this.logger.error('Error in disconnection callback', { error, inspectionId });
          }
        });
      });
    }
    
    // Clear all data
    this.subscriptions.clear();
    this.messageQueue = [];
    this.token = null;
    
    this.logger.info('WebSocket disconnection completed');
  }

  /**
   * Subscribe to inspection updates
   * @param {string} inspectionId - Inspection ID to subscribe to
   * @param {Function} callback - Callback function for updates
   * @returns {Function} Unsubscribe function
   */
  subscribeToInspection(inspectionId, callback) {
    // 이미 구독된 검사인지 확인
    if (this.subscriptions.has(inspectionId) && this.subscriptions.get(inspectionId).has(callback)) {
      return () => {
        this.unsubscribeFromInspection(inspectionId, callback);
      };
    }
    
    if (!this.subscriptions.has(inspectionId)) {
      this.subscriptions.set(inspectionId, new Set());
    }
    
    this.subscriptions.get(inspectionId).add(callback);
    
    // Send subscription message only for new subscriptions
    const subscriptionMessage = {
      type: 'subscribe_inspection',
      payload: { inspectionId }
    };
    
    this.sendMessage(subscriptionMessage);
    
    this.logger.info('Subscribed to inspection', { inspectionId });
    
    // Return unsubscribe function
    return () => {
      this.unsubscribeFromInspection(inspectionId, callback);
    };
  }

  /**
   * Unsubscribe from inspection updates
   * @param {string} inspectionId - Inspection ID
   * @param {Function} callback - Callback function to remove
   */
  unsubscribeFromInspection(inspectionId, callback) {
    if (!this.subscriptions.has(inspectionId)) {
      return;
    }
    
    const callbacks = this.subscriptions.get(inspectionId);
    callbacks.delete(callback);
    
    if (callbacks.size === 0) {
      this.subscriptions.delete(inspectionId);
      
      // Send unsubscription message
      this.sendMessage({
        type: 'unsubscribe_inspection',
        payload: { inspectionId }
      });
      
      this.logger.info('Unsubscribed from inspection', { inspectionId });
    }
  }

  /**
   * Send message to WebSocket server
   * @param {Object} message - Message to send
   */
  sendMessage(message) {
    if (!this.connectionStatus.isConnected || !this.ws) {
      // Queue message for later sending
      this.messageQueue.push(message);
      this.logger.debug('Message queued (not connected)', { message });
      return;
    }
    
    try {
      this.ws.send(JSON.stringify(message));
      this.logger.debug('Message sent', { message });
    } catch (error) {
      this.logger.error('Failed to send message', { message, error });
      // Queue message for retry
      this.messageQueue.push(message);
    }
  }

  /**
   * Handle incoming WebSocket messages
   * @param {MessageEvent} event - WebSocket message event
   */
  handleMessage(event) {
    try {
      const message = JSON.parse(event.data);
      this.logger.debug('Message received', { message });
      
      const { type, data } = message;
      
      switch (type) {
        case 'connection_established':
          this.logger.info('Connection established', { connectionId: data.connectionId });
          break;
          
        case 'subscription_confirmed':
          this.logger.info('Subscription confirmed', { inspectionId: data.inspectionId });
          break;
          
        case 'subscription_moved':
          this.handleSubscriptionMoved(data);
          break;
          
        case 'unsubscription_confirmed':
          this.logger.info('Unsubscription confirmed', { inspectionId: data.inspectionId });
          break;
          
        case 'global_notification':
          this.handleGlobalNotification(data);
          break;
          
        case 'progress_update':
          this.handleProgressUpdate(data);
          break;
          
        case 'status_change':
          this.handleStatusChange(data);
          break;
          
        case 'inspection_complete':
          this.handleInspectionComplete(data);
          break;
          
        case 'pong':
          this.logger.debug('Heartbeat pong received');
          break;
          
        case 'error':
          this.logger.error('Server error', { error: data });
          break;
          
        default:
          this.logger.warn('Unknown message type', { type, data });
      }
      
    } catch (error) {
      this.logger.error('Failed to parse WebSocket message', { 
        error: error.message, 
        data: event.data 
      });
    }
  }

  /**
   * Handle progress update messages
   * @param {Object} data - Progress update data
   */
  handleProgressUpdate(data) {
    const { inspectionId } = data;
    
    // 중복 메시지 필터링 (같은 진행률의 연속 메시지 무시)
    if (this.lastProgressData && 
        this.lastProgressData.inspectionId === inspectionId &&
        this.lastProgressData.percentage === (data.progress?.percentage ?? data.percentage)) {
      return; // 중복 메시지 무시
    }
    
    this.lastProgressData = {
      inspectionId,
      percentage: data.progress?.percentage ?? data.percentage,
      timestamp: Date.now()
    };
    
    // InspectionContext 업데이트 (배치 처리)
    if (this.inspectionContext) {
      this.inspectionContext.updateInspectionProgress(inspectionId, data);
    }
    
    // 콜백은 필요한 경우에만 호출
    const callbacks = this.subscriptions.get(inspectionId);
    if (callbacks && callbacks.size > 0) {
      callbacks.forEach(callback => {
        try {
          callback({
            type: 'progress',
            data: {
              ...data,
              messageType: 'progress_update'
            }
          });
        } catch (error) {
          this.logger.error('Error in progress callback', { error, inspectionId });
        }
      });
    }
  }

  /**
   * Handle status change messages
   * @param {Object} data - Status change data
   */
  handleStatusChange(data) {
    const { inspectionId } = data;
    
    // 상태 변경은 항상 처리 (진행률과 달리 중요한 변경사항)
    if (this.inspectionContext) {
      this.inspectionContext.updateInspectionProgress(inspectionId, data);
    }
    
    // 콜백 호출
    const callbacks = this.subscriptions.get(inspectionId);
    if (callbacks && callbacks.size > 0) {
      callbacks.forEach(callback => {
        try {
          callback({
            type: 'status_change',
            data: {
              ...data,
              messageType: 'status_change'
            }
          });
        } catch (error) {
          this.logger.error('Error in status change callback', { error, inspectionId });
        }
      });
    }
  }

  /**
   * Handle subscription moved messages
   * @param {Object} data - Subscription moved data
   */
  handleSubscriptionMoved(data) {
    const { fromInspectionId, toBatchId } = data;
    
    // 기존 구독을 새로운 배치 ID로 이동
    if (this.subscriptions.has(fromInspectionId)) {
      const callbacks = this.subscriptions.get(fromInspectionId);
      this.subscriptions.set(toBatchId, callbacks);
      this.subscriptions.delete(fromInspectionId);
      
      // 콜백들에게 구독 이동 알림
      callbacks.forEach(callback => {
        try {
          callback({
            type: 'subscription_moved',
            data: {
              ...data,
              messageType: 'subscription_moved'
            }
          });
        } catch (error) {
          this.logger.error('Error in subscription moved callback', { error, fromInspectionId, toBatchId });
        }
      });
    }
  }

  /**
   * Handle global notification messages
   * @param {Object} data - Global notification data
   */
  handleGlobalNotification(data) {
    // 모든 활성 구독자에게 글로벌 알림 전달
    this.subscriptions.forEach((callbacks, inspectionId) => {
      callbacks.forEach(callback => {
        try {
          callback({
            type: 'global_notification',
            data: {
              ...data,
              messageType: 'global_notification'
            }
          });
        } catch (error) {
          this.logger.error('Error in global notification callback', { error, inspectionId });
        }
      });
    });
  }

  /**
   * Handle inspection completion messages
   * Requirements: 7.3 - 검사 완료 시 구독 정리
   * @param {Object} data - Completion data
   */
  handleInspectionComplete(data) {
    const { inspectionId } = data;
    
    // InspectionContext에서 검사 완료 처리
    if (this.inspectionContext) {
      this.inspectionContext.completeInspection(inspectionId, data);
    }
    
    const callbacks = this.subscriptions.get(inspectionId);
    
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback({
            type: 'complete',
            data: {
              ...data,
              messageType: 'inspection_complete'
            }
          });
        } catch (error) {
          this.logger.error('Error in completion callback', { error, inspectionId });
        }
      });
    }
    
    // Send explicit unsubscribe message to server
    this.sendMessage({
      type: 'unsubscribe_inspection',
      payload: { inspectionId }
    });
    
    // Auto-unsubscribe after completion with proper cleanup
    setTimeout(() => {
      if (this.subscriptions.has(inspectionId)) {
        this.logger.info('Auto-unsubscribing from completed inspection', { inspectionId });
        this.subscriptions.delete(inspectionId);
      }
    }, 5000); // 5 seconds delay
  }

  /**
   * Handle WebSocket disconnection
   * @param {CloseEvent} event - Close event
   */
  handleDisconnection(event) {
    this.logger.warn('WebSocket disconnected', { 
      code: event.code, 
      reason: event.reason,
      wasClean: event.wasClean 
    });
    
    this.connectionStatus.isConnected = false;
    this.connectionStatus.isConnecting = false;
    
    // Stop heartbeat
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    // Attempt reconnection if not a clean close
    if (!event.wasClean && event.code !== 1000) {
      this.attemptReconnection();
    }
  }

  /**
   * Attempt to reconnect to WebSocket server
   */
  attemptReconnection() {
    if (this.connectionStatus.reconnectAttempts >= this.connectionStatus.maxReconnectAttempts) {
      this.logger.error('Max reconnection attempts reached');
      return;
    }
    
    if (this.reconnectTimer) {
      return; // Already attempting reconnection
    }
    
    this.connectionStatus.reconnectAttempts++;
    
    const delay = Math.min(
      this.config.reconnectDelay * Math.pow(2, this.connectionStatus.reconnectAttempts - 1),
      this.config.maxReconnectDelay
    );
    
    this.logger.info('Attempting reconnection', { 
      attempt: this.connectionStatus.reconnectAttempts,
      delay 
    });
    
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      
      if (this.token) {
        try {
          await this.connect(this.token);
          this.logger.info('Reconnection successful');
        } catch (error) {
          this.logger.error('Reconnection failed', { error: error.message });
          this.attemptReconnection(); // Try again
        }
      }
    }, delay);
  }

  /**
   * Process queued messages
   */
  processMessageQueue() {
    if (this.messageQueue.length === 0) {
      return;
    }
    
    this.logger.info('Processing message queue', { count: this.messageQueue.length });
    
    const messages = [...this.messageQueue];
    this.messageQueue = [];
    
    messages.forEach(message => {
      this.sendMessage(message);
    });
  }

  /**
   * Start heartbeat to keep connection alive
   */
  startHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    
    this.heartbeatTimer = setInterval(() => {
      if (this.connectionStatus.isConnected) {
        this.sendMessage({ type: 'ping', timestamp: Date.now() });
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Get connection status
   * @returns {Object} Connection status
   */
  getConnectionStatus() {
    return { ...this.connectionStatus };
  }

  /**
   * Get stored authentication token
   * @returns {string|null} JWT token
   */
  getStoredToken() {
    // Try to get token from localStorage or sessionStorage
    return localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
  }

  /**
   * Check if WebSocket is supported
   * @returns {boolean} WebSocket support status
   */
  isWebSocketSupported() {
    return typeof WebSocket !== 'undefined';
  }

  /**
   * Get WebSocket ready state
   * @returns {number|null} WebSocket ready state
   */
  getReadyState() {
    return this.ws ? this.ws.readyState : null;
  }

  /**
   * Get subscription count
   * @returns {number} Number of active subscriptions
   */
  getSubscriptionCount() {
    return this.subscriptions.size;
  }

  /**
   * Get queued message count
   * @returns {number} Number of queued messages
   */
  getQueuedMessageCount() {
    return this.messageQueue.length;
  }

  /**
   * Force cleanup of all resources
   * Requirements: 7.4, 7.7 - 리소스 정리 및 비정상 상태 감지
   */
  forceCleanup() {
    this.logger.warn('Force cleanup initiated');
    
    // Clear all timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    // Terminate connection immediately
    if (this.ws) {
      this.ws.terminate ? this.ws.terminate() : this.ws.close();
      this.ws = null;
    }
    
    // Reset all state
    this.connectionStatus = {
      isConnected: false,
      isConnecting: false,
      lastConnected: null,
      reconnectAttempts: 0,
      maxReconnectAttempts: 5
    };
    
    this.subscriptions.clear();
    this.messageQueue = [];
    this.token = null;
    
    this.logger.info('Force cleanup completed');
  }

  /**
   * Check connection health
   * Requirements: 7.7 - 비정상적인 연결 상태 감지
   * @returns {Object} Health status
   */
  checkConnectionHealth() {
    const now = Date.now();
    const health = {
      isHealthy: true,
      issues: [],
      readyState: this.getReadyState(),
      lastConnected: this.connectionStatus.lastConnected,
      timeSinceLastConnection: this.connectionStatus.lastConnected ? now - this.connectionStatus.lastConnected : null,
      reconnectAttempts: this.connectionStatus.reconnectAttempts,
      subscriptionCount: this.getSubscriptionCount(),
      queuedMessages: this.getQueuedMessageCount()
    };

    // Check for issues
    if (!this.connectionStatus.isConnected && this.connectionStatus.reconnectAttempts > 0) {
      health.isHealthy = false;
      health.issues.push('Connection lost, attempting reconnection');
    }

    if (this.connectionStatus.reconnectAttempts >= this.connectionStatus.maxReconnectAttempts) {
      health.isHealthy = false;
      health.issues.push('Max reconnection attempts reached');
    }

    if (this.messageQueue.length > 10) {
      health.isHealthy = false;
      health.issues.push('Message queue is growing (possible connection issue)');
    }

    if (this.ws && this.ws.readyState === WebSocket.CONNECTING && 
        this.connectionStatus.lastConnected && 
        (now - this.connectionStatus.lastConnected) > this.config.connectionTimeout) {
      health.isHealthy = false;
      health.issues.push('Connection attempt taking too long');
    }

    return health;
  }

  /**
   * Validate WebSocket connection
   * Requirements: 7.1 - 연결 상태 검증
   * @returns {Promise<boolean>} Validation result
   */
  async validateConnection() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, 5000); // 5 second timeout

      const pingMessage = {
        type: 'ping',
        timestamp: Date.now(),
        validation: true
      };

      const messageHandler = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'pong' && message.validation) {
            clearTimeout(timeout);
            this.ws.removeEventListener('message', messageHandler);
            resolve(true);
          }
        } catch (error) {
          // Ignore parsing errors for other messages
        }
      };

      this.ws.addEventListener('message', messageHandler);
      this.sendMessage(pingMessage);
    });
  }

  /**
   * Set InspectionContext reference
   * @param {Object} context - InspectionContext instance
   */
  setInspectionContext(context) {
    this.inspectionContext = context;
  }

  /**
   * Create logger instance
   * @returns {Object} Logger object
   */
  createLogger() {
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    return {
      debug: (message, meta = {}) => {
        // DEBUG 로그는 완전히 비활성화
      },
      info: (message, meta = {}) => {
        // 중요한 연결 상태 변화만 로그
        const importantMessages = [
          'Connecting to WebSocket',
          'WebSocket connected successfully',
          'disconnection completed',
          'Reconnection successful'
        ];
        
        if (isDevelopment && importantMessages.some(msg => message.includes(msg))) {
          console.log(`[INFO] [WebSocketService] ${message}`, meta);
        }
      },
      warn: (message, meta = {}) => {
        if (isDevelopment) {
          console.warn(`[WARN] [WebSocketService] ${message}`, meta);
        }
      },
      error: (message, meta = {}) => {
        console.error(`[ERROR] [WebSocketService] ${message}`, meta);
      }
    };
  }
}

// Create singleton instance
const webSocketService = new WebSocketService();

export default webSocketService;