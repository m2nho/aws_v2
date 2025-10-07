/**
 * Service Worker Progress Indicator
 * Service Worker를 통한 백그라운드 진행률 표시기
 */

import { useState, useEffect, useCallback } from 'react';
import swWebSocketClient from '../services/serviceWorkerWebSocket';
import './ServiceWorkerProgressIndicator.css';

const ServiceWorkerProgressIndicator = () => {
  const [activeInspections, setActiveInspections] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Service Worker 이벤트 리스너 설정
  useEffect(() => {
    const unsubscribeConnected = swWebSocketClient.addEventListener('connected', () => {
      setIsConnected(true);
      console.log('🔌 [SW-Progress] WebSocket connected');
    });

    const unsubscribeDisconnected = swWebSocketClient.addEventListener('disconnected', () => {
      setIsConnected(false);
      console.log('🔌 [SW-Progress] WebSocket disconnected');
    });

    const unsubscribeProgress = swWebSocketClient.addEventListener('progress', (inspection) => {
      console.log('📊 [SW-Progress] Progress event received:', {
        inspectionId: inspection.inspectionId,
        progress: inspection.progress,
        status: inspection.status,
        currentStep: inspection.currentStep,
        isCompleted: inspection.status === 'COMPLETED' || inspection.progress >= 100
      });
      
      // 완료된 검사는 무시
      if (inspection.status === 'COMPLETED' || inspection.progress >= 100) {
        console.log('⚠️ [SW-Progress] Ignoring completed inspection update:', inspection.inspectionId);
        return;
      }
      
      setActiveInspections(prev => {
        const updated = prev.filter(i => i.inspectionId !== inspection.inspectionId);
        const newList = [...updated, inspection].sort((a, b) => b.lastUpdated - a.lastUpdated);
        
        console.log('📋 [SW-Progress] Updated active inspections:', {
          previousCount: prev.length,
          newCount: newList.length,
          inspectionId: inspection.inspectionId,
          progress: inspection.progress
        });
        
        return newList;
      });
    });

    const unsubscribeComplete = swWebSocketClient.addEventListener('complete', (inspection) => {
      console.log('✅ [SW-Progress] Completion event received:', {
        inspectionId: inspection.inspectionId,
        status: inspection.status,
        completedAt: inspection.completedAt,
        serviceType: inspection.serviceType
      });
      
      // 완료된 검사 즉시 제거
      setActiveInspections(prev => {
        const beforeCount = prev.length;
        const filtered = prev.filter(i => i.inspectionId !== inspection.inspectionId);
        const afterCount = filtered.length;
        
        console.log('🗑️ [SW-Progress] Removed completed inspection:', {
          inspectionId: inspection.inspectionId,
          beforeCount,
          afterCount,
          removed: beforeCount - afterCount
        });
        
        return filtered;
      });
    });

    const unsubscribeStateSync = swWebSocketClient.addEventListener('state_sync', (inspections) => {
      console.log('🔄 [SW-Progress] State synced:', inspections.length);
      setActiveInspections(inspections.filter(i => 
        i.status !== 'COMPLETED' && i.status !== 'FAILED'
      ));
    });

    return () => {
      unsubscribeConnected();
      unsubscribeDisconnected();
      unsubscribeProgress();
      unsubscribeComplete();
      unsubscribeStateSync();
    };
  }, []);

  const getStatusIcon = useCallback((status) => {
    switch (status) {
      case 'RUNNING': return '🔄';
      case 'COMPLETED': return '✅';
      case 'FAILED': return '❌';
      case 'PENDING': return '⏳';
      default: return '📊';
    }
  }, []);

  const formatDuration = useCallback((startTime) => {
    const duration = Date.now() - startTime;
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  const handleToggleExpand = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  // 진행 중인 검사가 없으면 표시하지 않음
  if (activeInspections.length === 0) {
    return null;
  }

  const mainInspection = activeInspections[0]; // 가장 최근 검사

  return (
    <div className={`sw-progress-indicator ${isExpanded ? 'expanded' : 'collapsed'}`}>
      {/* 연결 상태 표시 */}
      <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
        <div className="connection-dot"></div>
        <span className="connection-text">
          {isConnected ? 'Service Worker 연결됨' : 'Service Worker 연결 끊김'}
        </span>
      </div>

      {/* 메인 진행률 표시 */}
      <div className="sw-progress-main" onClick={handleToggleExpand}>
        <div className={`progress-icon ${mainInspection?.status === 'RUNNING' ? 'spinning' : ''}`}>
          {getStatusIcon(mainInspection?.status)}
        </div>
        
        <div className="progress-info">
          <div className="progress-text">
            {mainInspection?.serviceType} 검사 중
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ width: `${mainInspection?.progress ?? 0}%` }}
            />
          </div>
        </div>

        <div className="progress-percentage">
          {Math.round(mainInspection?.progress ?? 0)}%
        </div>

        {activeInspections.length > 1 && (
          <div className="progress-count">
            +{activeInspections.length - 1}
          </div>
        )}

        <div className="expand-arrow">
          {isExpanded ? '▲' : '▼'}
        </div>
      </div>

      {/* 확장된 상세 정보 */}
      {isExpanded && (
        <div className="sw-progress-details">
          <div className="details-header">
            <h4>진행 중인 검사</h4>
            <span className="details-count">{activeInspections.length}개</span>
          </div>
          
          {activeInspections.map((inspection) => (
            <div key={inspection.inspectionId} className="inspection-detail-item">
              <div className="inspection-header">
                <span className={`inspection-icon ${inspection.status === 'RUNNING' ? 'spinning' : ''}`}>
                  {getStatusIcon(inspection.status)}
                </span>
                <span className="inspection-service">
                  {inspection.serviceType}
                </span>
                <span className="inspection-time">
                  {formatDuration(inspection.startTime)}
                </span>
              </div>
              
              <div className="inspection-progress">
                <div className="progress-bar-detail">
                  <div 
                    className="progress-fill-detail"
                    style={{ width: `${inspection.progress ?? 0}%` }}
                  />
                </div>
                <span className="progress-percentage-detail">
                  {Math.round(inspection.progress ?? 0)}%
                </span>
              </div>
              
              {inspection.currentStep && (
                <div className="inspection-step">
                  {inspection.currentStep}
                </div>
              )}
              
              {inspection.completedItems !== undefined && inspection.totalItems && (
                <div className="inspection-items">
                  {inspection.completedItems} / {inspection.totalItems} 항목
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ServiceWorkerProgressIndicator;