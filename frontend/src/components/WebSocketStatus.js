/**
 * WebSocket 연결 상태 표시 컴포넌트
 * 개발 환경에서 WebSocket 연결 상태를 실시간으로 확인할 수 있는 컴포넌트
 */

import React, { useState, useEffect } from 'react';
import webSocketService from '../services/websocketService';

const WebSocketStatus = () => {
  const [status, setStatus] = useState({
    isConnected: false,
    readyState: null,
    subscriptionCount: 0,
    queuedMessages: 0,
    lastUpdate: null
  });

  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // 개발 환경에서만 표시
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    const updateStatus = () => {
      const connectionStatus = webSocketService.getConnectionStatus();
      const readyState = webSocketService.getReadyState();
      const subscriptionCount = webSocketService.getSubscriptionCount();
      const queuedMessages = webSocketService.getQueuedMessageCount();

      setStatus({
        isConnected: connectionStatus.isConnected,
        readyState,
        subscriptionCount,
        queuedMessages,
        lastUpdate: Date.now()
      });
    };

    // 초기 상태 업데이트
    updateStatus();

    // 1초마다 상태 업데이트
    const interval = setInterval(updateStatus, 1000);

    return () => clearInterval(interval);
  }, []);

  // 개발 환경이 아니면 렌더링하지 않음
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const getReadyStateText = (readyState) => {
    const states = {
      0: 'CONNECTING',
      1: 'OPEN',
      2: 'CLOSING',
      3: 'CLOSED'
    };
    return states[readyState] || 'UNKNOWN';
  };

  const getStatusColor = () => {
    if (status.isConnected) return '#28a745'; // 녹색
    if (status.readyState === 0) return '#ffc107'; // 노란색 (연결 중)
    return '#dc3545'; // 빨간색 (연결 안됨)
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: '10px',
        right: '10px',
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        padding: isVisible ? '10px' : '5px',
        borderRadius: '8px',
        fontSize: '12px',
        fontFamily: 'monospace',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        minWidth: isVisible ? '200px' : '20px',
        minHeight: isVisible ? 'auto' : '20px'
      }}
      onClick={() => setIsVisible(!isVisible)}
      title="WebSocket 상태 (클릭하여 상세 정보 토글)"
    >
      {!isVisible ? (
        <div
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: getStatusColor(),
            margin: '5px'
          }}
        />
      ) : (
        <div>
          <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
            🔌 WebSocket Status
          </div>
          
          <div style={{ marginBottom: '3px' }}>
            <span style={{ color: getStatusColor() }}>●</span>
            {' '}
            {status.isConnected ? 'Connected' : 'Disconnected'}
          </div>
          
          <div style={{ marginBottom: '3px' }}>
            State: {getReadyStateText(status.readyState)}
          </div>
          
          <div style={{ marginBottom: '3px' }}>
            Subscriptions: {status.subscriptionCount}
          </div>
          
          <div style={{ marginBottom: '3px' }}>
            Queued: {status.queuedMessages}
          </div>
          
          {status.lastUpdate && (
            <div style={{ fontSize: '10px', color: '#ccc' }}>
              Updated: {new Date(status.lastUpdate).toLocaleTimeString()}
            </div>
          )}
          
          <div style={{ marginTop: '8px', fontSize: '10px' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                const token = webSocketService.getStoredToken();
                if (token && !status.isConnected) {
                  webSocketService.connect(token);
                } else if (status.isConnected) {
                  webSocketService.disconnect();
                }
              }}
              style={{
                backgroundColor: status.isConnected ? '#dc3545' : '#28a745',
                color: 'white',
                border: 'none',
                padding: '2px 6px',
                borderRadius: '3px',
                fontSize: '10px',
                cursor: 'pointer',
                marginRight: '5px'
              }}
            >
              {status.isConnected ? 'Disconnect' : 'Connect'}
            </button>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                console.log('WebSocket Status:', webSocketService.getConnectionStatus());
                console.log('WebSocket Health:', webSocketService.checkConnectionHealth());
              }}
              style={{
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                padding: '2px 6px',
                borderRadius: '3px',
                fontSize: '10px',
                cursor: 'pointer'
              }}
            >
              Debug
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebSocketStatus;