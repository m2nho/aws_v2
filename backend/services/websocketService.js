/**
 * WebSocket Service for Real-time Progress Updates
 * WebSocket을 통한 실시간 상태 업데이트
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const config = require('../config');

class WebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // Map<inspectionId, Set<WebSocket>>
    this.userConnections = new Map(); // Map<userId, Set<WebSocket>>
    this.logger = this.createLogger();
  }

  /**
   * Initialize WebSocket server
   * @param {Object} server - HTTP server instance
   */
  initialize(server) {
    this.wss = new WebSocket.Server({
      server,
      path: '/ws/inspections',
      verifyClient: this.verifyClient.bind(this)
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    this.wss.on('error', this.handleError.bind(this));

    this.logger.info('WebSocket server initialized', {
      path: '/ws/inspections'
    });

    // Cleanup disconnected clients periodically
    setInterval(() => {
      this.cleanupDisconnectedClients();
    }, 30000); // Every 30 seconds
  }

  /**
   * Verify client connection (authentication)
   * @param {Object} info - Connection info
   * @returns {boolean} Whether to accept the connection
   */
  verifyClient(info) {
    try {
      const url = new URL(info.req.url, 'ws://localhost');
      const token = url.searchParams.get('token');

      if (!token) {
        this.logger.warn('WebSocket connection rejected: No token provided');
        return false;
      }

      // Verify JWT token
      const decoded = jwt.verify(token, config.jwt.secret);
      if (!decoded.userId) {
        this.logger.warn('WebSocket connection rejected: Invalid token');
        return false;
      }

      // Store user info for later use
      info.req.user = decoded;
      return true;

    } catch (error) {
      this.logger.warn('WebSocket connection rejected: Token verification failed', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Handle new WebSocket connection
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} req - HTTP request
   */
  handleConnection(ws, req) {
    const userId = req.user.userId;
    const connectionId = this.generateConnectionId();

    // Store connection metadata
    ws.userId = userId;
    ws.connectionId = connectionId;
    ws.subscribedInspections = new Set();
    ws.isAlive = true;

    // Add to user connections
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId).add(ws);

    this.logger.info('WebSocket client connected', {
      userId,
      connectionId,
      totalConnections: this.wss.clients.size
    });

    // Set up ping/pong for connection health
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Handle incoming messages
    ws.on('message', (data) => {
      this.handleMessage(ws, data);
    });

    // Handle connection close
    ws.on('close', (code, reason) => {
      this.handleDisconnection(ws, code, reason);
    });

    // Handle connection errors
    ws.on('error', (error) => {
      this.logger.error('WebSocket client error', {
        userId,
        connectionId,
        error: error.message
      });
    });

    // Send welcome message
    this.sendMessage(ws, {
      type: 'connection_established',
      data: {
        connectionId,
        timestamp: Date.now()
      }
    });
  }

  /**
   * Handle incoming WebSocket messages
   * @param {WebSocket} ws - WebSocket connection
   * @param {Buffer} data - Message data
   */
  handleMessage(ws, data) {
    try {
      const message = JSON.parse(data.toString());
      const { type, payload } = message;

      switch (type) {
        case 'subscribe_inspection':
          this.handleSubscribeInspection(ws, payload);
          break;

        case 'unsubscribe_inspection':
          this.handleUnsubscribeInspection(ws, payload);
          break;

        case 'ping':
          this.sendMessage(ws, { type: 'pong', timestamp: Date.now() });
          break;

        default:
          this.logger.warn('Unknown WebSocket message type', {
            type,
            userId: ws.userId,
            connectionId: ws.connectionId
          });
      }

    } catch (error) {
      this.logger.error('Error handling WebSocket message', {
        userId: ws.userId,
        connectionId: ws.connectionId,
        error: error.message
      });

      this.sendMessage(ws, {
        type: 'error',
        data: {
          code: 'MESSAGE_PARSE_ERROR',
          message: 'Failed to parse message'
        }
      });
    }
  }

  /**
   * Handle inspection subscription
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} payload - Subscription payload
   */
  handleSubscribeInspection(ws, payload) {
    const { inspectionId } = payload;

    console.log('🔔 Handling subscription request:', {
      userId: ws.userId,
      connectionId: ws.connectionId,
      inspectionId,
      payload
    });

    if (!inspectionId) {
      console.log('❌ Missing inspection ID in subscription request');
      this.sendMessage(ws, {
        type: 'error',
        data: {
          code: 'MISSING_INSPECTION_ID',
          message: 'Inspection ID is required for subscription'
        }
      });
      return;
    }

    // 이미 구독된 검사인지 확인
    if (ws.subscribedInspections && ws.subscribedInspections.has(inspectionId)) {
      console.log('⚠️ Client already subscribed to inspection:', {
        userId: ws.userId,
        connectionId: ws.connectionId,
        inspectionId
      });
      
      // 이미 구독된 경우에도 확인 메시지 전송
      this.sendMessage(ws, {
        type: 'subscription_confirmed',
        data: {
          inspectionId,
          timestamp: Date.now(),
          alreadySubscribed: true
        }
      });
      return;
    }

    // Add to inspection subscribers
    if (!this.clients.has(inspectionId)) {
      this.clients.set(inspectionId, new Set());
      console.log('📋 Created new subscription set for inspection:', inspectionId);
    }
    
    this.clients.get(inspectionId).add(ws);
    ws.subscribedInspections.add(inspectionId);

    const subscriberCount = this.clients.get(inspectionId).size;
    
    console.log('✅ Client subscribed to inspection successfully:', {
      userId: ws.userId,
      connectionId: ws.connectionId,
      inspectionId,
      subscriberCount,
      totalInspections: this.clients.size
    });

    this.logger.info('Client subscribed to inspection', {
      userId: ws.userId,
      connectionId: ws.connectionId,
      inspectionId,
      subscriberCount
    });

    const confirmationMessage = {
      type: 'subscription_confirmed',
      data: {
        inspectionId,
        timestamp: Date.now(),
        subscriberCount
      }
    };
    
    console.log('📤 Sending subscription confirmation:', confirmationMessage);
    this.sendMessage(ws, confirmationMessage);
  }

  /**
   * Handle inspection unsubscription
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} payload - Unsubscription payload
   */
  handleUnsubscribeInspection(ws, payload) {
    const { inspectionId } = payload;

    if (!inspectionId) {
      return;
    }

    // Remove from inspection subscribers
    if (this.clients.has(inspectionId)) {
      this.clients.get(inspectionId).delete(ws);
      if (this.clients.get(inspectionId).size === 0) {
        this.clients.delete(inspectionId);
      }
    }
    ws.subscribedInspections.delete(inspectionId);

    this.logger.info('Client unsubscribed from inspection', {
      userId: ws.userId,
      connectionId: ws.connectionId,
      inspectionId
    });

    this.sendMessage(ws, {
      type: 'unsubscription_confirmed',
      data: {
        inspectionId,
        timestamp: Date.now()
      }
    });
  }

  /**
   * Handle client disconnection
   * @param {WebSocket} ws - WebSocket connection
   * @param {number} code - Close code
   * @param {string} reason - Close reason
   */
  handleDisconnection(ws, code, reason) {
    const userId = ws.userId;
    const connectionId = ws.connectionId;

    // Remove from user connections
    if (this.userConnections.has(userId)) {
      this.userConnections.get(userId).delete(ws);
      if (this.userConnections.get(userId).size === 0) {
        this.userConnections.delete(userId);
      }
    }

    // Remove from inspection subscriptions
    ws.subscribedInspections.forEach(inspectionId => {
      if (this.clients.has(inspectionId)) {
        this.clients.get(inspectionId).delete(ws);
        if (this.clients.get(inspectionId).size === 0) {
          this.clients.delete(inspectionId);
        }
      }
    });

    this.logger.info('WebSocket client disconnected', {
      userId,
      connectionId,
      code,
      reason: reason?.toString(),
      totalConnections: this.wss.clients.size
    });
  }

  /**
   * Handle WebSocket server errors
   * @param {Error} error - Error object
   */
  handleError(error) {
    this.logger.error('WebSocket server error', {
      error: error.message,
      stack: error.stack
    });
  }

  /**
   * Broadcast inspection progress update
   * Requirements: 6.1, 6.2, 6.3 - 실시간 진행률 업데이트
   * @param {string} inspectionId - Inspection ID
   * @param {Object} progressData - Progress data
   */
  broadcastProgressUpdate(inspectionId, progressData) {
    const subscribers = this.clients.get(inspectionId);
    
    console.log('📊 Broadcasting progress update:', {
      inspectionId,
      subscriberCount: subscribers?.size || 0,
      progressData: progressData.progress?.percentage
    });
    
    if (!subscribers || subscribers.size === 0) {
      console.log('⚠️ No subscribers found for inspection:', inspectionId);
      console.log('📋 Available inspections:', Array.from(this.clients.keys()));
      return;
    }

    const message = {
      type: 'progress_update',
      data: {
        inspectionId,
        ...progressData,
        timestamp: Date.now()
      }
    };

    console.log('📤 Broadcasting message to', subscribers.size, 'subscribers:', message);

    let successCount = 0;
    let errorCount = 0;

    subscribers.forEach(ws => {
      if (this.sendMessage(ws, message)) {
        successCount++;
      } else {
        errorCount++;
      }
    });

    console.log('📊 Broadcast result:', {
      inspectionId,
      subscriberCount: subscribers.size,
      successCount,
      errorCount
    });

    this.logger.debug('Progress update broadcasted', {
      inspectionId,
      subscriberCount: subscribers.size,
      successCount,
      errorCount,
      progress: progressData.progress?.percentage
    });
  }

  /**
   * Broadcast inspection status change
   * Requirements: 6.1, 6.3 - 실시간 상태 업데이트
   * @param {string} inspectionId - Inspection ID
   * @param {Object} statusData - Status data
   */
  broadcastStatusChange(inspectionId, statusData) {
    const subscribers = this.clients.get(inspectionId);
    
    console.log('🔄 Broadcasting status change:', {
      inspectionId,
      subscriberCount: subscribers?.size || 0,
      status: statusData.status
    });
    
    if (!subscribers || subscribers.size === 0) {
      console.log('⚠️ No subscribers found for status change:', inspectionId);
      console.log('📋 Available inspections:', Array.from(this.clients.keys()));
      return;
    }

    const message = {
      type: 'status_change',
      data: {
        inspectionId,
        ...statusData,
        timestamp: Date.now()
      }
    };

    console.log('📤 Broadcasting status message to', subscribers.size, 'subscribers:', message);

    subscribers.forEach(ws => {
      this.sendMessage(ws, message);
    });

    console.log('✅ Status change broadcast completed for:', inspectionId);

    this.logger.info('Status change broadcasted', {
      inspectionId,
      subscriberCount: subscribers.size,
      status: statusData.status
    });
  }

  /**
   * Broadcast inspection completion
   * Requirements: 6.1, 6.4 - 검사 완료 알림
   * @param {string} inspectionId - Inspection ID
   * @param {Object} completionData - Completion data
   */
  broadcastInspectionComplete(inspectionId, completionData) {
    const subscribers = this.clients.get(inspectionId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const message = {
      type: 'inspection_complete',
      data: {
        inspectionId,
        ...completionData,
        timestamp: Date.now()
      }
    };

    subscribers.forEach(ws => {
      this.sendMessage(ws, message);
    });

    this.logger.info('Inspection completion broadcasted', {
      inspectionId,
      subscriberCount: subscribers.size,
      status: completionData.status,
      duration: completionData.duration
    });

    // Clean up subscribers for completed inspection after a delay
    setTimeout(() => {
      this.clients.delete(inspectionId);
    }, 60000); // 1 minute delay
  }

  /**
   * Send message to WebSocket client
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} message - Message to send
   * @returns {boolean} Success status
   */
  sendMessage(ws, message) {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error('Error sending WebSocket message', {
        userId: ws.userId,
        connectionId: ws.connectionId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Clean up disconnected clients
   */
  cleanupDisconnectedClients() {
    let cleanedCount = 0;

    // Check all clients and remove disconnected ones
    this.wss.clients.forEach(ws => {
      if (!ws.isAlive) {
        ws.terminate();
        cleanedCount++;
        return;
      }

      ws.isAlive = false;
      ws.ping();
    });

    if (cleanedCount > 0) {
      this.logger.info('Cleaned up disconnected clients', {
        cleanedCount,
        activeConnections: this.wss.clients.size
      });
    }
  }

  /**
   * Get connection statistics
   * @returns {Object} Connection statistics
   */
  getConnectionStats() {
    const totalConnections = this.wss ? this.wss.clients.size : 0;
    const totalUsers = this.userConnections.size;
    const totalInspections = this.clients.size;

    const inspectionStats = {};
    this.clients.forEach((subscribers, inspectionId) => {
      inspectionStats[inspectionId] = subscribers.size;
    });

    return {
      totalConnections,
      totalUsers,
      totalInspections,
      inspectionStats,
      timestamp: Date.now()
    };
  }

  /**
   * Generate unique connection ID
   * @returns {string} Connection ID
   */
  generateConnectionId() {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create logger instance
   * @returns {Object} Logger object
   */
  createLogger() {
    return {
      debug: (message, meta = {}) => {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[DEBUG] [WebSocketService] ${message}`, meta);
        }
      },
      info: (message, meta = {}) => {
        console.log(`[INFO] [WebSocketService] ${message}`, meta);
      },
      warn: (message, meta = {}) => {
        console.warn(`[WARN] [WebSocketService] ${message}`, meta);
      },
      error: (message, meta = {}) => {
        console.error(`[ERROR] [WebSocketService] ${message}`, meta);
      }
    };
  }

  /**
   * Shutdown WebSocket server
   */
  shutdown() {
    if (this.wss) {
      this.wss.clients.forEach(ws => {
        ws.close(1001, 'Server shutting down');
      });
      this.wss.close();
      this.logger.info('WebSocket server shut down');
    }
  }
}

// Create singleton instance
const webSocketService = new WebSocketService();

module.exports = webSocketService;