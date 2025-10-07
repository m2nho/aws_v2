/**
 * Inspection Status Bar Component
 * 상단에 표시되는 진행 중인 검사 상태 바
 */

import React, { useState } from 'react';
import { useInspection } from '../context/InspectionContext';
import './InspectionStatusBar.css';

const InspectionStatusBar = ({ onViewInspection }) => {
  const { getBackgroundInspections, getForegroundInspection } = useInspection();
  const [isExpanded, setIsExpanded] = useState(false);

  const backgroundInspections = getBackgroundInspections();
  const foregroundInspection = getForegroundInspection();
  const allActiveInspections = [...(foregroundInspection ? [foregroundInspection] : []), ...backgroundInspections];

  if (allActiveInspections.length === 0) {
    return null;
  }

  const handleViewInspection = (inspection) => {
    if (onViewInspection) {
      onViewInspection(inspection);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'COMPLETED': return '✅';
      case 'FAILED': return '❌';
      case 'IN_PROGRESS': return '🔄';
      default: return '⏳';
    }
  };

  const formatProgress = (progress) => {
    return `${progress || 0}%`;
  };

  const formatTimeRemaining = (milliseconds) => {
    if (!milliseconds) return '';
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    return minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;
  };

  return (
    <div className="inspection-status-bar">
      <div className="status-bar-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="status-summary">
          <span className="status-icon">🔄</span>
          <span className="status-text">
            {allActiveInspections.length}개 검사 진행 중
          </span>
          {allActiveInspections.length === 1 && (
            <span className="single-progress">
              ({formatProgress(allActiveInspections[0].progress)})
            </span>
          )}
        </div>
        
        <button className="expand-button">
          {isExpanded ? '▲' : '▼'}
        </button>
      </div>

      {isExpanded && (
        <div className="status-bar-content">
          {allActiveInspections.map((inspection) => (
            <div key={inspection.batchId} className="inspection-item">
              <div className="inspection-info">
                <span className="inspection-icon">
                  {getStatusIcon(inspection.status)}
                </span>
                <div className="inspection-details">
                  <div className="inspection-title">
                    {inspection.serviceType} 검사
                  </div>
                  <div className="inspection-subtitle">
                    {inspection.currentStep || '진행 중...'}
                  </div>
                </div>
              </div>
              
              <div className="inspection-progress">
                <div className="progress-info">
                  <span className="progress-percentage">
                    {formatProgress(inspection.progress)}
                  </span>
                  {inspection.estimatedTimeRemaining && (
                    <span className="time-remaining">
                      {formatTimeRemaining(inspection.estimatedTimeRemaining)} 남음
                    </span>
                  )}
                </div>
                <div className="mini-progress-bar">
                  <div 
                    className="mini-progress-fill"
                    style={{ width: `${inspection.progress || 0}%` }}
                  />
                </div>
              </div>
              
              <button 
                className="view-button"
                onClick={() => handleViewInspection(inspection)}
                title="검사 상세 보기"
              >
                👁️
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default InspectionStatusBar;