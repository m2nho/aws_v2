/**
 * Minimal Progress Indicator Component
 * 최소한의 공간을 차지하는 진행률 표시기
 */

import React, { useState } from 'react';
import { useInspection } from '../context/InspectionContext';
import './MinimalProgressIndicator.css';

const MinimalProgressIndicator = () => {
  const { getBackgroundInspections, getForegroundInspection, activeInspections } = useInspection();

  const backgroundInspections = getBackgroundInspections();
  const foregroundInspection = getForegroundInspection();
  const allActiveInspections = [...(foregroundInspection ? [foregroundInspection] : []), ...backgroundInspections];

  if (allActiveInspections.length === 0) {
    return null;
  }

  const primaryInspection = allActiveInspections[0];
  const hasMultiple = allActiveInspections.length > 1;

  const getStatusIcon = (status) => {
    switch (status) {
      case 'COMPLETED': return '✅';
      case 'FAILED': return '❌';
      case 'IN_PROGRESS': return '🔄';
      default: return '⏳';
    }
  };

  return (
    <div className="minimal-progress-container">
      {/* 간단한 진행률 표시 (클릭 불가) */}
      <div className="minimal-progress-main">
        <div className="progress-icon">
          {getStatusIcon(primaryInspection.status)}
        </div>
        
        <div className="progress-info">
          <div className="progress-text">
            {primaryInspection.serviceType} 검사
            {hasMultiple && ` (+${allActiveInspections.length - 1})`}
          </div>
          <div className="progress-subtitle">
            {primaryInspection.currentStep && (
              <>
                {primaryInspection.currentStep}
                {primaryInspection.completedItems !== undefined && primaryInspection.totalItems > 0 && (
                  <span className="step-info">
                    {' '}({primaryInspection.completedItems}/{primaryInspection.totalItems})
                  </span>
                )}
              </>
            )}
          </div>
          <div className="progress-bar-mini">
            <div 
              className="progress-fill-mini"
              style={{ width: `${primaryInspection.progress || 0}%` }}
            />
          </div>
        </div>
        
        <div className="progress-percentage">
          {primaryInspection.progress || 0}%
        </div>
      </div>
    </div>
  );
};

export default MinimalProgressIndicator;