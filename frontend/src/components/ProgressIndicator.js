import React, { useState, useEffect } from 'react';
import './ProgressIndicator.css';

/**
 * ProgressIndicator Component
 * 진행률 표시기 컴포넌트
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */
const ProgressIndicator = ({
  progress = {},
  status = 'PENDING',
  estimatedTimeRemaining = null,
  startTime = null,
  onCancel = null,
  onMoveToBackground = null,
  showDetails = true,
  size = 'medium' // 'small', 'medium', 'large'
}) => {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [animatedPercentage, setAnimatedPercentage] = useState(0);

  // Calculate elapsed time
  useEffect(() => {
    if (!startTime) return;

    const updateElapsedTime = () => {
      const elapsed = Date.now() - new Date(startTime).getTime();
      setElapsedTime(elapsed);
    };

    updateElapsedTime();
    const interval = setInterval(updateElapsedTime, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  // Animate progress bar
  useEffect(() => {
    const targetPercentage = progress.percentage || 0;
    const duration = 500; // Animation duration in ms
    const steps = 30;
    const stepValue = (targetPercentage - animatedPercentage) / steps;
    
    if (Math.abs(stepValue) < 0.1) {
      setAnimatedPercentage(targetPercentage);
      return;
    }

    let currentStep = 0;
    const animationInterval = setInterval(() => {
      currentStep++;
      setAnimatedPercentage(prev => {
        const newValue = prev + stepValue;
        if (currentStep >= steps) {
          clearInterval(animationInterval);
          return targetPercentage;
        }
        return newValue;
      });
    }, duration / steps);

    return () => clearInterval(animationInterval);
  }, [progress.percentage, animatedPercentage]);

  /**
   * Format time duration
   * @param {number} milliseconds - Time in milliseconds
   * @returns {string} Formatted time string
   */
  const formatTime = (milliseconds) => {
    if (!milliseconds || milliseconds < 0) return '계산 중...';
    
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}시간 ${minutes % 60}분`;
    } else if (minutes > 0) {
      return `${minutes}분 ${seconds % 60}초`;
    } else {
      return `${seconds}초`;
    }
  };

  /**
   * Get trend display text
   * @param {string} trend - Progress trend
   * @returns {string} Display text for trend
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
   * Get status display info
   */
  const getStatusInfo = () => {
    switch (status) {
      case 'PENDING':
        return { text: '대기 중', color: '#ffa500', icon: '⏳' };
      case 'IN_PROGRESS':
        return { text: '진행 중', color: '#007bff', icon: '🔄' };
      case 'COMPLETED':
        return { text: '완료', color: '#28a745', icon: '✅' };
      case 'FAILED':
        return { text: '실패', color: '#dc3545', icon: '❌' };
      case 'CANCELLED':
        return { text: '취소됨', color: '#6c757d', icon: '⏹️' };
      default:
        return { text: '알 수 없음', color: '#6c757d', icon: '❓' };
    }
  };

  const statusInfo = getStatusInfo();
  const percentage = Math.min(Math.max(animatedPercentage, 0), 100);
  const isActive = status === 'IN_PROGRESS' || status === 'PENDING';

  return (
    <div className={`progress-indicator ${size} ${status.toLowerCase()}`}>
      {/* Progress Header */}
      <div className="progress-header">
        <div className="status-info">
          <span className="status-icon" role="img" aria-label={statusInfo.text}>
            {statusInfo.icon}
          </span>
          <span className="status-text" style={{ color: statusInfo.color }}>
            {statusInfo.text}
          </span>
        </div>
        
        <div className="progress-actions">
          {onMoveToBackground && isActive && (
            <button 
              className="background-button"
              onClick={onMoveToBackground}
              aria-label="백그라운드로 이동"
              title="백그라운드에서 계속 진행"
            >
              ⬇️
            </button>
          )}
          
          {onCancel && isActive && (
            <button 
              className="cancel-button"
              onClick={onCancel}
              aria-label="검사 취소"
              title="검사 취소"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="progress-bar-container">
        <div 
          className={`progress-bar ${isActive ? 'active' : ''}`}
          style={{ 
            width: `${percentage}%`,
            backgroundColor: statusInfo.color
          }}
          role="progressbar"
          aria-valuenow={percentage}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-label={`진행률 ${Math.round(percentage)}%`}
        >
          {isActive && (
            <div className="progress-bar-animation"></div>
          )}
        </div>
        
        <div className="progress-percentage">
          {Math.round(percentage)}%
        </div>
      </div>

      {/* Progress Details */}
      {showDetails && (
        <div className="progress-details">
          {/* Current Step */}
          {progress.currentStep && (
            <div className="current-step">
              <span className="step-label">현재 단계:</span>
              <span className="step-text">{progress.currentStep}</span>
            </div>
          )}

          {/* Step Counter */}
          {progress.completedSteps !== undefined && progress.totalSteps && (
            <div className="step-counter">
              <span className="counter-label">진행 단계:</span>
              <span className="counter-text">
                {progress.completedSteps} / {progress.totalSteps}
              </span>
            </div>
          )}

          {/* Time Information */}
          <div className="time-info">
            {elapsedTime > 0 && (
              <div className="elapsed-time">
                <span className="time-label">경과 시간:</span>
                <span className="time-value">{formatTime(elapsedTime)}</span>
              </div>
            )}
            
            {estimatedTimeRemaining && isActive && (
              <div className="estimated-time">
                <span className="time-label">예상 완료:</span>
                <span className="time-value">{formatTime(estimatedTimeRemaining)}</span>
              </div>
            )}
          </div>

          {/* Enhanced Speed and Performance Information */}
          {isActive && percentage > 0 && elapsedTime > 0 && (
            <div className="speed-info">
              <div className="processing-speed">
                <span className="speed-label">처리 속도:</span>
                <span className="speed-value">
                  {((percentage / 100) / (elapsedTime / 60000)).toFixed(2)} 단계/분
                </span>
              </div>
              
              {/* Progress Velocity */}
              {progress.velocity && (
                <div className="progress-velocity">
                  <span className="velocity-label">진행률 속도:</span>
                  <span className="velocity-value">
                    {progress.velocity.toFixed(1)}%/분
                  </span>
                </div>
              )}
              
              {/* Progress Trend */}
              {progress.trend && (
                <div className="progress-trend">
                  <span className="trend-label">진행 추세:</span>
                  <span className={`trend-value trend-${progress.trend}`}>
                    {getTrendDisplayText(progress.trend)}
                  </span>
                </div>
              )}
              
              {/* Resources Processed */}
              {progress.resourcesProcessed && (
                <div className="resources-processed">
                  <span className="resources-label">처리된 리소스:</span>
                  <span className="resources-value">
                    {progress.resourcesProcessed}개
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Completion Message */}
      {status === 'COMPLETED' && (
        <div className="completion-message">
          <span className="completion-icon">🎉</span>
          <span className="completion-text">
            검사가 성공적으로 완료되었습니다!
          </span>
        </div>
      )}

      {/* Error Message */}
      {status === 'FAILED' && (
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          <span className="error-text">
            검사 중 오류가 발생했습니다.
          </span>
        </div>
      )}
    </div>
  );
};

export default ProgressIndicator;