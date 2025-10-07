/**
 * Enhanced Progress Monitor Component
 * 향상된 실시간 진행률 모니터링 컴포넌트
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */

import React, { useState, useEffect, useMemo } from 'react';
import ProgressIndicator from './ProgressIndicator';
import useInspectionProgress from '../hooks/useInspectionProgress';
import './EnhancedProgressMonitor.css';

const EnhancedProgressMonitor = ({
  inspectionId,
  serviceType = 'Unknown',
  onComplete,
  onError,
  onCancel,
  onMoveToBackground,
  showDetailedMetrics = true,
  showConnectionStatus = true,
  size = 'large',
  allowBackground = true
}) => {
  const [showAdvancedView, setShowAdvancedView] = useState(false);
  const [performanceAlerts, setPerformanceAlerts] = useState([]);

  // Use the enhanced progress hook
  const {
    progressData,
    connectionStatus,
    error: progressError,
    isMonitoring,
    stopMonitoring,
    restartMonitoring,
    getProgressStatistics
  } = useInspectionProgress(inspectionId, {
    stagnantThreshold: 8,
    onComplete: (completionData) => {
      if (onComplete) {
        onComplete(completionData);
      }
    },
    onError: (errorData) => {
      if (onError) {
        onError(errorData);
      }
    },
    onStagnant: (stagnantData) => {
      const alert = {
        id: Date.now(),
        type: 'stagnant',
        message: `진행률이 ${stagnantData.stagnantCount}번 연속 ${stagnantData.currentPercentage}%에서 정체되고 있습니다`,
        timestamp: Date.now(),
        severity: 'warning'
      };
      setPerformanceAlerts(prev => [...prev.slice(-4), alert]); // Keep last 5 alerts
    }
  });

  // Calculate additional metrics
  const metrics = useMemo(() => {
    const stats = getProgressStatistics();
    const currentTime = Date.now();
    
    return {
      ...stats,
      progressRate: progressData.velocity ? `${progressData.velocity.toFixed(1)}%/분` : '계산 중...',
      processingRate: progressData.processingSpeed ? 
        `${progressData.processingSpeed.toFixed(1)} 리소스/분` : '계산 중...',
      efficiency: progressData.velocity && progressData.elapsedTime > 0 ? 
        Math.min(100, (progressData.velocity / 10) * 100).toFixed(1) + '%' : '계산 중...',
      connectionQuality: getConnectionQuality(connectionStatus, stats),
      estimatedAccuracy: getEstimatedAccuracy(progressData, stats)
    };
  }, [progressData, connectionStatus, getProgressStatistics]);

  // Handle cancel
  const handleCancel = async () => {
    if (onCancel) {
      await onCancel();
    }
    stopMonitoring();
  };

  // Handle move to background
  const handleMoveToBackground = () => {
    if (onMoveToBackground) {
      onMoveToBackground();
    }
  };

  // Auto-dismiss alerts
  useEffect(() => {
    const timer = setTimeout(() => {
      setPerformanceAlerts(prev => 
        prev.filter(alert => Date.now() - alert.timestamp < 30000) // Remove alerts older than 30s
      );
    }, 5000);

    return () => clearTimeout(timer);
  }, [performanceAlerts]);



  return (
    <div className={`enhanced-progress-monitor ${size}`}>
      {/* Main Progress Indicator */}
      <ProgressIndicator
        progress={{
          ...progressData.progress,
          velocity: progressData.velocity,
          trend: progressData.trend,
          resourcesProcessed: progressData.progress.resourcesProcessed
        }}
        status={progressData.status}
        estimatedTimeRemaining={progressData.estimatedTimeRemaining}
        startTime={progressData.startTime}
        onCancel={handleCancel}
        onMoveToBackground={allowBackground ? handleMoveToBackground : undefined}
        showDetails={true}
        size={size}
      />

      {/* Connection Status */}
      {showConnectionStatus && (
        <div className="connection-status">
          <div className={`connection-indicator ${connectionStatus.connectionType} ${connectionStatus.isConnected ? 'connected' : 'disconnected'}`}>
            <span className="connection-dot"></span>
            <span className="connection-text">
              {getConnectionStatusText(connectionStatus)}
            </span>
            {connectionStatus.errorCount > 0 && (
              <span className="error-count">
                ({connectionStatus.errorCount} 오류)
              </span>
            )}
          </div>
          
          {!connectionStatus.isConnected && (
            <button 
              className="retry-websocket-button"
              onClick={restartMonitoring}
              title="WebSocket 연결 재시도"
            >
              🔄
            </button>
          )}
        </div>
      )}

      {/* Performance Alerts */}
      {performanceAlerts.length > 0 && (
        <div className="performance-alerts">
          {performanceAlerts.slice(-3).map(alert => (
            <div key={alert.id} className={`alert alert-${alert.severity}`}>
              <span className="alert-icon">
                {alert.severity === 'warning' ? '⚠️' : 'ℹ️'}
              </span>
              <span className="alert-message">{alert.message}</span>
              <button 
                className="alert-dismiss"
                onClick={() => setPerformanceAlerts(prev => prev.filter(a => a.id !== alert.id))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 간소화된 진행 정보 */}
      {showDetailedMetrics && progressData.progress && (
        <div className="progress-summary">
          {(progressData.progress.totalItems > 0) && (
            <div className="summary-item">
              <span className="summary-label">진행 상황</span>
              <span className="summary-value">
                {progressData.progress.completedItems || 0} / {progressData.progress.totalItems} 항목 완료
              </span>
            </div>
          )}
          
          {progressData.progress.currentStep && (
            <div className="summary-item">
              <span className="summary-label">현재 단계</span>
              <span className="summary-value">
                {progressData.progress.currentStep}
                {progressData.progress.completedSteps !== undefined && progressData.progress.totalSteps > 0 && (
                  <span className="step-counter">
                    {' '}({progressData.progress.completedSteps + 1}/{progressData.progress.totalSteps} 단계)
                  </span>
                )}
              </span>
            </div>
          )}
          
          <div className="summary-item">
            <span className="summary-label">연결 상태</span>
            <span className={`summary-value connection-${connectionStatus.isConnected ? 'connected' : 'disconnected'}`}>
              {connectionStatus.isConnected ? '정상' : '연결 끊김'}
            </span>
          </div>
        </div>
      )}



      {/* Error Display */}
      {progressError && (
        <div className="progress-error">
          <div className="error-header">
            <span className="error-icon">❌</span>
            <span className="error-title">모니터링 오류</span>
          </div>
          <div className="error-details">
            <p>{progressError.message || '알 수 없는 오류가 발생했습니다.'}</p>
            {progressError.code && (
              <p className="error-code">오류 코드: {progressError.code}</p>
            )}
          </div>
          <div className="error-actions">
            <button 
              className="retry-button"
              onClick={restartMonitoring}
            >
              다시 시도
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Get connection status display text
 */
const getConnectionStatusText = (status) => {
  if (!status.isConnected) {
    return '연결 끊김';
  }
  
  switch (status.connectionType) {
    case 'websocket':
      return 'WebSocket 연결됨';
    default:
      return '연결 상태 확인 중';
  }
};

/**
 * Get trend display text
 */
const getTrendDisplayText = (trend) => {
  switch (trend) {
    case 'accelerating':
      return '가속 중 ⬆️';
    case 'steady':
      return '안정적 ➡️';
    case 'decelerating':
      return '감속 중 ⬇️';
    case 'stagnant':
      return '정체 중 ⏸️';
    default:
      return '분석 중 🔄';
  }
};

/**
 * Calculate connection quality
 */
const getConnectionQuality = (connectionStatus, stats) => {
  if (!connectionStatus.isConnected) {
    return { level: 'poor', text: '연결 없음' };
  }
  
  const errorRate = stats.errorCount / Math.max(1, stats.totalDataPoints);
  const timeSinceUpdate = stats.timeSinceLastUpdate || 0;
  
  if (errorRate > 0.1 || timeSinceUpdate > 30000) {
    return { level: 'poor', text: '불안정' };
  } else if (errorRate > 0.05 || timeSinceUpdate > 10000) {
    return { level: 'fair', text: '보통' };
  } else if (connectionStatus.connectionType === 'websocket') {
    return { level: 'excellent', text: '우수' };
  } else {
    return { level: 'good', text: '양호' };
  }
};

/**
 * Calculate estimated accuracy
 */
const getEstimatedAccuracy = (progressData, stats) => {
  // Simple heuristic based on trend stability and data points
  if (stats.totalDataPoints < 3) {
    return '계산 중...';
  }
  
  const trendStability = progressData.trend === 'steady' ? 1.0 : 
                        progressData.trend === 'accelerating' || progressData.trend === 'decelerating' ? 0.8 : 0.6;
  const dataQuality = Math.min(1.0, stats.totalDataPoints / 10);
  const accuracy = (trendStability * dataQuality * 100).toFixed(0);
  
  return `${accuracy}%`;
};

export default EnhancedProgressMonitor;