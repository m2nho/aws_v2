/**
 * Service Worker for WebSocket Management
 * 탭과 독립적으로 WebSocket 연결을 관리하는 서비스 워커
 */

let websocket = null;
let activeInspections = new Map();
let reconnectTimer = null;
let heartbeatTimer = null;

// 클라이언트(탭)들과의 통신 채널
const clients = new Set();

/**
 * Service Worker 설치
 */
self.addEventListener('install', (event) => {
  console.log('🔧 [SW] Installing WebSocket Service Worker');
  self.skipWaiting();
});

/**
 * Service Worker 활성화
 */
self.addEventListener('activate', (event) => {
  console.log('✅ [SW] WebSocket Service Worker activated');
  event.waitUntil(self.clients.claim());
});

/**
 * 클라이언트(탭)로부터 메시지 수신
 */
self.addEventListener('message', (event) => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'CONNECT_WEBSOCKET':
      connectWebSocket(data.token);
      break;
      
    case 'START_INSPECTION':
      startInspectionTracking(data);
      break;
      
    case 'STOP_INSPECTION':
      stopInspectionTracking(data.inspectionId);
      break;
      
    case 'DISCONNECT_WEBSOCKET':
      disconnectWebSocket();
      break;
      
    case 'REGISTER_CLIENT':
      clients.add(event.source);
      console.log('📱 [SW] Client registered, total:', clients.size);
      
      // 현재 진행 중인 검사 상태 전송
      if (activeInspections.size > 0) {
        sendToClient(event.source, {
          type: 'INSPECTION_STATE_SYNC',
          data: Array.from(activeInspections.values())
        });
      }
      break;
      
    case 'UNREGISTER_CLIENT':
      clients.delete(event.source);
      console.log('📱 [SW] Client unregistered, remaining:', clients.size);
      
      // 모든 클라이언트가 없어지면 연결 해제
      if (clients.size === 0) {
        setTimeout(() => {
          if (clients.size === 0) {
            console.log('🔌 [SW] No clients remaining, disconnecting WebSocket');
            disconnectWebSocket();
          }
        }, 30000); // 30초 후 해제
      }
      break;
  }
});

/**
 * WebSocket 연결
 */
function connectWebSocket(token) {
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    console.log('🔌 [SW] WebSocket already connected');
    return;
  }
  
  const wsUrl = `ws://localhost:5000/ws/inspections?token=${encodeURIComponent(token)}`;
  
  try {
    websocket = new WebSocket(wsUrl);
    
    websocket.onopen = () => {
      console.log('🔌 [SW] WebSocket connected');
      broadcastToClients({
        type: 'WEBSOCKET_CONNECTED',
        data: { connected: true }
      });
      
      startHeartbeat();
    };
    
    websocket.onmessage = (event) => {
      handleWebSocketMessage(JSON.parse(event.data));
    };
    
    websocket.onclose = (event) => {
      console.log('🔌 [SW] WebSocket disconnected:', event.code);
      stopHeartbeat();
      
      broadcastToClients({
        type: 'WEBSOCKET_DISCONNECTED',
        data: { connected: false, code: event.code }
      });
      
      // 자동 재연결 (클라이언트가 있는 경우에만)
      if (clients.size > 0 && !event.wasClean) {
        scheduleReconnect(token);
      }
    };
    
    websocket.onerror = (error) => {
      console.error('❌ [SW] WebSocket error:', error);
    };
    
  } catch (error) {
    console.error('❌ [SW] Failed to create WebSocket:', error);
  }
}

/**
 * WebSocket 메시지 처리
 */
function handleWebSocketMessage(message) {
  const { type, data } = message;
  
  console.log('📨 [SW] WebSocket message received:', {
    type,
    inspectionId: data.inspectionId,
    progress: data.progress?.percentage ?? data.percentage,
    status: data.status,
    timestamp: new Date().toISOString()
  });
  
  switch (type) {
    case 'progress_update':
      handleProgressUpdate(data);
      break;
      
    case 'status_change':
      handleStatusChange(data);
      break;
      
    case 'inspection_complete':
      handleInspectionComplete(data);
      break;
      
    default:
      console.log('📨 [SW] Unknown message type:', type);
  }
}

/**
 * 진행률 업데이트 처리
 */
function handleProgressUpdate(data) {
  const { inspectionId } = data;
  
  if (activeInspections.has(inspectionId)) {
    const inspection = activeInspections.get(inspectionId);
    
    // 이미 완료된 검사는 업데이트하지 않음
    if (inspection.status === 'COMPLETED') {
      console.log('⚠️ [SW] Ignoring update for completed inspection:', inspectionId);
      return;
    }
    
    const newProgress = data.progress?.percentage ?? data.percentage ?? inspection.progress;
    
    // 진행률이 100%에 도달하면 완료 처리
    if (newProgress >= 100 && inspection.status !== 'COMPLETED') {
      console.log('🎯 [SW] Progress reached 100%, marking as completed:', inspectionId);
      handleInspectionComplete({
        ...data,
        inspectionId,
        status: 'COMPLETED'
      });
      return;
    }
    
    const updatedInspection = {
      ...inspection,
      ...data,
      progress: newProgress,
      lastUpdated: Date.now()
    };
    
    activeInspections.set(inspectionId, updatedInspection);
    
    // 모든 클라이언트에게 업데이트 전송
    broadcastToClients({
      type: 'INSPECTION_PROGRESS',
      data: updatedInspection
    });
    
    // 우측 하단 알림 표시 (20% 단위로만)
    showProgressNotification(updatedInspection);
  }
}

/**
 * 상태 변경 처리
 */
function handleStatusChange(data) {
  handleProgressUpdate(data); // 동일한 로직 사용
}

/**
 * 검사 완료 처리
 */
function handleInspectionComplete(data) {
  const { inspectionId } = data;
  
  console.log('🏁 [SW] Handling inspection completion:', inspectionId);
  
  if (activeInspections.has(inspectionId)) {
    const inspection = activeInspections.get(inspectionId);
    
    // 이미 완료 처리된 검사인지 확인 (중복 방지)
    if (inspection.status === 'COMPLETED') {
      console.log('⚠️ [SW] Inspection already completed, skipping:', inspectionId);
      return;
    }
    
    const completedInspection = {
      ...inspection,
      ...data,
      status: 'COMPLETED',
      completedAt: Date.now()
    };
    
    // 활성 목록에서 즉시 제거 (중복 처리 방지)
    activeInspections.delete(inspectionId);
    
    // WebSocket 구독 해제
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify({
        type: 'unsubscribe_inspection',
        payload: { inspectionId }
      }));
      console.log('🔌 [SW] Unsubscribed from inspection:', inspectionId);
    }
    
    // 완료 알림 표시 (한 번만)
    showCompletionNotification(completedInspection);
    
    // 클라이언트들에게 완료 알림
    broadcastToClients({
      type: 'INSPECTION_COMPLETE',
      data: completedInspection
    });
    
    console.log('✅ [SW] Inspection completion processed:', inspectionId);
    
    // 모든 검사가 완료되었는지 확인
    if (activeInspections.size === 0) {
      console.log('🎉 [SW] All inspections completed');
      
      // 5초 후 WebSocket 연결 해제 (새 검사가 없다면)
      setTimeout(() => {
        if (activeInspections.size === 0) {
          console.log('🔌 [SW] Auto-disconnecting WebSocket (no active inspections)');
          disconnectWebSocket();
        }
      }, 5000); // 30초에서 5초로 단축
    }
  } else {
    console.warn('⚠️ [SW] Inspection not found for completion:', inspectionId);
  }
}

/**
 * 검사 추적 시작
 */
function startInspectionTracking(inspectionData) {
  const { inspectionId } = inspectionData;
  
  activeInspections.set(inspectionId, {
    ...inspectionData,
    startTime: Date.now(),
    lastUpdated: Date.now()
  });
  
  // WebSocket 구독
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(JSON.stringify({
      type: 'subscribe_inspection',
      payload: { inspectionId }
    }));
  }
  
  console.log('🎯 [SW] Started tracking inspection:', inspectionId);
}

/**
 * 검사 추적 중단
 */
function stopInspectionTracking(inspectionId) {
  activeInspections.delete(inspectionId);
  
  // 알림 기록 정리
  const keysToRemove = Array.from(notificationHistory).filter(key => key.includes(inspectionId));
  keysToRemove.forEach(key => notificationHistory.delete(key));
  
  // WebSocket 구독 해제
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(JSON.stringify({
      type: 'unsubscribe_inspection',
      payload: { inspectionId }
    }));
  }
  
  console.log('🛑 [SW] Stopped tracking inspection:', inspectionId);
}

// 알림 표시 기록 (중복 방지용)
const notificationHistory = new Set();

/**
 * 진행률 알림 표시
 */
function showProgressNotification(inspection) {
  const progress = Math.round(inspection.progress || 0);
  const notificationKey = `${inspection.inspectionId}-${progress}`;
  
  console.log('🔔 [SW] Progress notification check:', {
    inspectionId: inspection.inspectionId,
    progress,
    notificationKey,
    is20PercentMark: progress % 20 === 0,
    isGreaterThanZero: progress > 0,
    alreadyShown: notificationHistory.has(notificationKey),
    notificationHistorySize: notificationHistory.size,
    allHistoryKeys: Array.from(notificationHistory)
  });
  
  // 20% 단위로만 알림 표시하고 중복 방지
  if (progress % 20 === 0 && progress > 0 && !notificationHistory.has(notificationKey)) {
    notificationHistory.add(notificationKey);
    
    console.log('✅ [SW] Showing progress notification:', {
      notificationKey,
      serviceType: inspection.serviceType,
      progress,
      currentStep: inspection.currentStep
    });
    
    self.registration.showNotification(`${inspection.serviceType} 검사 진행 중`, {
      body: `진행률: ${progress}% - ${inspection.currentStep || '검사 중'}`,
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      tag: `progress-${inspection.inspectionId}`,
      silent: true,
      data: {
        type: 'progress',
        inspectionId: inspection.inspectionId
      }
    });
    
    console.log('🔔 [SW] Progress notification displayed successfully:', notificationKey);
  } else {
    console.log('⏭️ [SW] Progress notification skipped:', {
      reason: progress % 20 !== 0 ? 'Not 20% mark' : 
              progress <= 0 ? 'Progress <= 0' : 
              'Already shown',
      notificationKey
    });
  }
}

/**
 * 완료 알림 표시
 */
function showCompletionNotification(inspection) {
  const completionKey = `complete-${inspection.inspectionId}`;
  
  console.log('🎉 [SW] Completion notification check:', {
    inspectionId: inspection.inspectionId,
    completionKey,
    alreadyShown: notificationHistory.has(completionKey),
    serviceType: inspection.serviceType,
    startTime: inspection.startTime,
    completedAt: inspection.completedAt,
    notificationHistorySize: notificationHistory.size
  });
  
  // 중복 완료 알림 방지
  if (notificationHistory.has(completionKey)) {
    console.log('⚠️ [SW] Completion notification already shown, skipping:', completionKey);
    return;
  }
  
  notificationHistory.add(completionKey);
  
  const duration = inspection.completedAt - inspection.startTime;
  const minutes = Math.floor(duration / 60000);
  const seconds = Math.floor((duration % 60000) / 1000);
  
  console.log('✅ [SW] Showing completion notification:', {
    completionKey,
    serviceType: inspection.serviceType,
    duration: `${minutes}:${seconds.toString().padStart(2, '0')}`,
    durationMs: duration
  });
  
  self.registration.showNotification(`${inspection.serviceType} 검사 완료!`, {
    body: `소요시간: ${minutes}:${seconds.toString().padStart(2, '0')}`,
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    tag: completionKey,
    requireInteraction: true,
    data: {
      type: 'complete',
      inspectionId: inspection.inspectionId
    }
  });
  
  console.log('🔔 [SW] Completion notification displayed successfully:', completionKey);
}

/**
 * 모든 클라이언트에게 메시지 브로드캐스트
 */
function broadcastToClients(message) {
  console.log('📡 [SW] Broadcasting to clients:', {
    messageType: message.type,
    clientCount: clients.size,
    inspectionId: message.data?.inspectionId,
    progress: message.data?.progress,
    status: message.data?.status
  });
  
  clients.forEach(client => {
    sendToClient(client, message);
  });
}

/**
 * 특정 클라이언트에게 메시지 전송
 */
function sendToClient(client, message) {
  try {
    client.postMessage(message);
  } catch (error) {
    console.error('❌ [SW] Failed to send message to client:', error);
    clients.delete(client);
  }
}

/**
 * WebSocket 연결 해제
 */
function disconnectWebSocket() {
  console.log('🔌 [SW] Starting WebSocket disconnection process');
  
  // 모든 활성 검사에 대해 구독 해제
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    activeInspections.forEach((inspection, inspectionId) => {
      websocket.send(JSON.stringify({
        type: 'unsubscribe_inspection',
        payload: { inspectionId }
      }));
      console.log('🔌 [SW] Unsubscribed from inspection:', inspectionId);
    });
    
    // 잠시 대기 후 연결 종료
    setTimeout(() => {
      if (websocket) {
        websocket.close(1000, 'Service Worker disconnect');
        websocket = null;
        console.log('🔌 [SW] WebSocket connection closed');
      }
    }, 200);
  } else {
    websocket = null;
  }
  
  // 타이머 정리
  stopHeartbeat();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  
  // 상태 정리
  activeInspections.clear();
  notificationHistory.clear();
  
  // 클라이언트들에게 연결 해제 알림
  broadcastToClients({
    type: 'WEBSOCKET_DISCONNECTED',
    data: { connected: false, reason: 'Manual disconnect' }
  });
  
  console.log('🔌 [SW] WebSocket disconnection completed');
}

/**
 * 하트비트 시작
 */
function startHeartbeat() {
  stopHeartbeat();
  
  heartbeatTimer = setInterval(() => {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify({
        type: 'ping',
        timestamp: Date.now()
      }));
    }
  }, 30000); // 30초마다
}

/**
 * 하트비트 중단
 */
function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

/**
 * 재연결 스케줄링
 */
function scheduleReconnect(token) {
  if (reconnectTimer) return;
  
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (clients.size > 0) {
      console.log('🔄 [SW] Attempting to reconnect WebSocket');
      connectWebSocket(token);
    }
  }, 5000); // 5초 후 재연결
}