/**
 * Background Inspection Monitor Component
 * 백그라운드에서 검사 진행률을 모니터링하고 사용자에게 알림을 제공하는 컴포넌트
 */

import React, { useState, useEffect, useCallback } from 'react';
import useInspectionProgress from '../hooks/useInspectionProgress';
import './BackgroundInspectionMonitor.css';

const BackgroundInspectionMonitor = ({
  inspectionId,
  serviceType,
  onComplete,
  onError,
  minimized = false,
  onToggleMinimize
}) => {
  const [isMinimized, setIsMinimized] = useState(minimized);
  const [showNotification, setShowNotification] = useState(false);
  const [lastNotificationProgress, setLastNotificationProgress] = useState(0);

  const {
    progressData,
    connectionStatus,
    error: progressError,
    isMonitoring
  } = useInspectionProgress(inspectionId, {
    onComplete: (completionData) => {
      // 완료 알림 표시
      setShowNotification(true);
      if (onComplete) {
        onComplete(completionData);
      }
    },
    onError: (errorData) => {
      setShowNotification(true);
      if (onError) {
        onError(errorData);
      }
    }
  });

  // 진행률 변화에 따른 알림 (25%, 50%, 75% 단위)
  useEffect(() => {
    const currentProgress = progressData.progress?.percentage || 0;
    const milestones = [25, 50, 75];
    
    for (const milestone of milestones) {
      if (currentProgress >= milestone && lastNotificationProgress < milestone) {
        setShowNotification(true);
        setLastNotificationProgress(milestone);
        
        // 3초 후 알림 자동 숨김
        setTimeout(() => setShowNotification(false), 3000);
        break;
      }
    }
  }, [progressData.progress?.percentage, lastNotificationProgress]);

  const handleToggleMinimize = useCallback(() => {
    const newMinimized = !isMinimized;
    setIsMinimized(newMinimized);
    if (onToggleMinimize) {
      onToggleMinimize(newMinimized);
    }
  }, [isMinimized, onToggleMinimize]);

  const getStatusIcon = () => {
    if (progressError) return '❌';
    if (progressData.status === 'COMPLETED') return '✅';
    if (progressData.status === 'FAILED') return '❌';
    if (isMonitoring) return '🔄';
    return '⏸️';
  };

  const getStatusText = () => {
    if (progressError) return '검사 오류';
    if (progressData.status === 'COMPLETED') return '검사 완료';
    if (progressData.status === 'FAILED') return '검사 실패';
    if (isMonitoring) return '검사 진행 중';
    return '검사 대기 중';
  };

  const formatTimeRemaining = (milliseconds) => {
    if (!milliseconds) return '계산 중...';
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    return `${minutes}분 ${seconds}초`;
  };

  if (!inspectionId || !isMonitoring) {
    return null;
  }

  return (
    <>
      {/* 백그라운드 모니터 */}
      <div className={`background-monitor ${isMinimized ? 'minimized' : 'expanded'}`}>
        <div className="monitor-header" onClick={handleToggleMinimize}>
          <div className="monitor-info">
            <span className="status-icon">{getStatusIcon()}</span>
            <span className="service-type">{serviceType}</span>
            <span className="status-text">{getStatusText()}</span>
          </div>
          
          <div className="monitor-progress">
            <div className="progress-bar">
              <div 
                className="progress-fill"
                style={{ width: `${progressData.progress?.percentage || 0}%` }}
              />
            </div>
            <span className="progress-text">
              {progressData.progress?.percentage || 0}%
            </span>
          </div>
          
          <button className="minimize-button">
            {isMinimized ? '▲' : '▼'}
          </button>
        </div>

        {!isMinimized && (
          <div className="monitor-details">
            <div className="detail-row">
              <span className="detail-label">현재 단계:</span>
              <span className="detail-value">
                {progressData.progress?.currentStep || '준비 중...'}
              </span>
            </div>
            
            <div className="detail-row">
              <span className="detail-label">진행 상황:</span>
              <span className="detail-value">
                {progressData.progress?.completedItems || 0} / {progressData.progress?.totalItems || 0} 항목
              </span>
            </div>
            
            <div className="detail-row">
              <span className="detail-label">예상 완료:</span>
              <span className="detail-value">
                {formatTimeRemaining(progressData.estimatedTimeRemaining)}
              </span>
            </div>
            
            <div className="detail-row">
              <span className="detail-label">연결 상태:</span>
              <span className={`detail-value connection-${connectionStatus.isConnected ? 'connected' : 'disconnected'}`}>
                {connectionStatus.isConnected ? '연결됨' : '연결 끊김'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 알림 토스트 */}
      {showNotification && (
        <div className="inspection-notification">
          <div className="notification-content">
            <span className="notification-icon">{getStatusIcon()}</span>
            <div className="notification-text">
              <div className="notification-title">
                {progressData.status === 'COMPLETED' ? '검사 완료!' : 
                 progressError ? '검사 오류 발생' :
                 `검사 진행 중 (${progressData.progress?.percentage || 0}%)`}
              </div>
              <div className="notification-subtitle">
                {progressData.status === 'COMPLETED' ? '결과를 확인하세요' :
                 progressError ? progressError.message :
                 progressData.progress?.currentStep || '진행 중...'}
              </div>
            </div>
            <button 
              className="notification-close"
              onClick={() => setShowNotification(false)}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default BackgroundInspectionMonitor;