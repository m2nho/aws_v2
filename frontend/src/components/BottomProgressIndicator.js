/**
 * Bottom Progress Indicator Component
 * 우측 하단에 표시되는 진행률 표시기
 * 진행 중인 검사들의 실시간 상태를 표시
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useInspection } from '../context/InspectionContext';
import './BottomProgressIndicator.css';

const BottomProgressIndicator = () => {
  const { activeInspections } = useInspection();
  const [forceUpdate, setForceUpdate] = useState(0);

  // 완료되지 않은 검사만 필터링 (useMemo로 최적화)
  const runningInspections = useMemo(() => {
    return activeInspections.filter(inspection => 
      inspection.status !== 'COMPLETED' && 
      inspection.status !== 'FAILED' &&
      inspection.progress < 100
    );
  }, [activeInspections]);

  // 1초마다 강제 업데이트 (실시간 시간 표시를 위해) - 의존성 최적화
  useEffect(() => {
    if (runningInspections.length === 0) return;
    
    const interval = setInterval(() => {
      setForceUpdate(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [runningInspections.length]);

  // 디버깅용 로그 - 실제 변화가 있을 때만
  useEffect(() => {
    const runningCount = runningInspections.length;
    if (runningCount > 0) {
      console.log('📊 [BottomProgressIndicator] State Update:', {
        totalActive: activeInspections.length,
        totalRunning: runningCount,
        inspections: runningInspections.map(i => ({
          id: i.inspectionId,
          service: i.serviceType,
          progress: i.progress,
          status: i.status
        }))
      });
    }
  }, [runningInspections.length]);

  // 표시/숨김 상태 변화 로그
  useEffect(() => {
    const hasRunning = runningInspections.length > 0;
    if (hasRunning) {
      console.log('🎬 [BottomProgressIndicator] Appearing with animation');
    } else {
      console.log('👻 [BottomProgressIndicator] Hidden - No running inspections');
    }
  }, [runningInspections.length > 0]);

  // 진행 중인 검사가 없으면 표시하지 않음
  if (runningInspections.length === 0) {
    return null;
  }

  // 가장 최근 검사 또는 진행률이 가장 높은 검사를 메인으로 표시
  const mainInspection = runningInspections.reduce((main, current) => {
    if (!main) return current;
    // lastUpdated가 있으면 최신 것을, 없으면 진행률이 높은 것을 선택
    if (current.lastUpdated && main.lastUpdated) {
      return current.lastUpdated > main.lastUpdated ? current : main;
    }
    return current.progress > main.progress ? current : main;
  }, null);

  const getStatusIcon = (status) => {
    switch (status) {
      case 'RUNNING': return '🔄';
      case 'COMPLETED': return '✅';
      case 'FAILED': return '❌';
      case 'PENDING': return '⏳';
      default: return '📊';
    }
  };

  const formatDuration = (startTime) => {
    const duration = Date.now() - startTime;
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bottom-progress-indicator collapsed">
      {/* 간단한 진행률 표시기 (클릭 불가) */}
      <div className="progress-main">
        <div className={`progress-icon ${mainInspection?.status === 'RUNNING' ? 'spinning' : ''}`}>
          {getStatusIcon(mainInspection?.status)}
        </div>
        
        <div className="progress-info">
          <div className="progress-text-main">
            {mainInspection?.serviceType} 검사 중
          </div>
          <div className="progress-bar-mini">
            <div 
              className="progress-fill-mini"
              style={{ width: `${mainInspection?.progress ?? 0}%` }}
            />
          </div>
        </div>

        <div className="progress-percentage">
          {Math.round(mainInspection?.progress ?? 0)}%
        </div>

        {runningInspections.length > 1 && (
          <div className="progress-count">
            +{runningInspections.length - 1}
          </div>
        )}
      </div>
    </div>
  );
};

export default BottomProgressIndicator;