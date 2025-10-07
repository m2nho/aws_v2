/**
 * Global Completion Notification Component
 * 우측 상단에 표시되는 검사 완료 알림
 * 검사가 완료되었을 때만 표시됨
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useInspection } from '../context/InspectionContext';
import './GlobalProgressIndicator.css';

const GlobalProgressIndicator = () => {
  const { completedInspections } = useInspection();
  const [visibleNotifications, setVisibleNotifications] = useState([]);
  const processedInspectionsRef = useRef(new Set());
  const notificationTimeoutRef = useRef(new Map());
  const renderLogRef = useRef(new Set()); // 모든 useRef를 최상단에 배치

  // 모든 Hook을 최상단에 배치 (조건부 렌더링 이전)
  const handleDismiss = useCallback((notificationId) => {
    setVisibleNotifications(prev => {
      const notification = prev.find(n => n.id === notificationId);
      if (notification) {
        const inspectionId = notification.inspectionId;
        
        // 자동 제거 타이머가 없으므로 정리할 것이 없음
        
        console.log('❌ [GlobalProgressIndicator] 사용자가 완료 알림을 수동으로 닫음', {
          message: `"${notification.serviceType} 검사 완료" 알림 닫기`,
          inspectionId,
          serviceType: notification.serviceType,
          notificationId,
          dismissTime: new Date().toLocaleTimeString(),
          remainingNotifications: prev.length - 1
        });
        
        return prev.filter(n => n.id !== notificationId);
      }
      return prev;
    });
  }, []);

  const getStatusIcon = useCallback((status) => {
    switch (status) {
      case 'COMPLETED': return '✅';
      case 'FAILED': return '❌';
      default: return '✅';
    }
  }, []);

  const formatDuration = useCallback((duration) => {
    if (!duration) return '0:00';
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  // 완료 알림 처리 (중복 방지 강화)
  useEffect(() => {
    if (completedInspections.length === 0) return;
    
    // 새로 추가된 완료 검사만 처리 (더 엄격한 중복 체크)
    const newCompletions = completedInspections.filter(inspection => {
      const inspectionId = inspection.inspectionId;
      const isAlreadyProcessed = processedInspectionsRef.current.has(inspectionId);
      
      // 이미 처리된 검사는 완전히 무시
      if (isAlreadyProcessed) {
        return false;
      }
      
      // 현재 표시 중인 알림에도 없는지 확인
      const isCurrentlyVisible = visibleNotifications.some(n => n.inspectionId === inspectionId);
      if (isCurrentlyVisible) {
        console.log('⚠️ [GlobalProgressIndicator] Already visible, skipping:', inspectionId);
        return false;
      }
      
      console.log('✅ [GlobalProgressIndicator] New completion found:', {
        inspectionId,
        serviceType: inspection.serviceType,
        completedAt: inspection.completedAt
      });
      
      return true;
    });
    
    if (newCompletions.length === 0) {
      return; // 조용히 종료
    }
    
    console.log('🔔 [GlobalProgressIndicator] Processing new completions:', newCompletions.length);
    
    // 새로운 완료 검사들을 한 번에 처리
    newCompletions.forEach(latestCompleted => {
      const inspectionId = latestCompleted.inspectionId;
      
      // 처리 중 중복 체크 (race condition 방지)
      if (processedInspectionsRef.current.has(inspectionId)) {
        console.log('⚠️ [GlobalProgressIndicator] Race condition detected, skipping:', inspectionId);
        return;
      }
      
      // 즉시 처리됨으로 표시 (중복 방지)
      processedInspectionsRef.current.add(inspectionId);
      
      const notification = {
        ...latestCompleted,
        id: `notification-${inspectionId}-${Date.now()}`,
        showTime: Date.now()
      };
      
      // 알림 표시
      setVisibleNotifications(prev => {
        // 혹시 모를 중복 제거
        const filtered = prev.filter(n => n.inspectionId !== inspectionId);
        const newNotifications = [notification, ...filtered.slice(0, 2)];
        
        console.log('🎉 [GlobalProgressIndicator] 🔔 완료 알림 표시:', {
          serviceType: latestCompleted.serviceType,
          inspectionId,
          totalVisible: newNotifications.length
        });
        
        return newNotifications;
      });
      
      // 자동 제거 타이머 제거 - 사용자가 수동으로 닫을 때까지 유지
      console.log('🔒 [GlobalProgressIndicator] 알림이 수동 닫기까지 유지됩니다:', {
        inspectionId,
        serviceType: latestCompleted.serviceType,
        message: '사용자가 X 버튼을 클릭할 때까지 표시됨'
      });
    });
  }, [completedInspections, visibleNotifications]); // visibleNotifications 의존성 추가

  // 컴포넌트 마운트/언마운트 로그
  useEffect(() => {
    console.log('🎬 [GlobalProgressIndicator] 우측 상단 완료 알림 컴포넌트 마운트됨 (수동 닫기 모드)');
    
    return () => {
      console.log('🧹 [GlobalProgressIndicator] 우측 상단 완료 알림 컴포넌트 언마운트');
      // 자동 제거 타이머가 없으므로 정리할 것이 없음
    };
  }, []);

  // 표시할 알림이 없으면 렌더링하지 않음
  if (visibleNotifications.length === 0) {
    return null;
  }

  // 렌더링 시 로그 (첫 번째 렌더링만)
  const currentNotificationIds = visibleNotifications.map(n => n.id).join(',');
  
  if (!renderLogRef.current.has(currentNotificationIds)) {
    renderLogRef.current.add(currentNotificationIds);
    console.log('🖼️ [GlobalProgressIndicator] 🔔 우측 상단 알림 렌더링', {
      totalNotifications: visibleNotifications.length,
      notifications: visibleNotifications.map(n => ({
        service: n.serviceType,
        message: `${n.serviceType} 검사 완료!`,
        id: n.id,
        showTime: new Date(n.showTime).toLocaleTimeString()
      }))
    });
  }

  return (
    <div className="completion-notifications">
      {visibleNotifications.map((notification) => (
        <div key={notification.id} className="completion-notification">
          <div className="notification-header">
            <span className="notification-icon">
              {getStatusIcon(notification.status)}
            </span>
            <span className="notification-title">
              검사 완료!
            </span>
            <button 
              className="notification-close"
              onClick={() => handleDismiss(notification.id)}
            >
              ✕
            </button>
          </div>
          
          <div className="notification-content">
            <div className="notification-service">
              {notification.serviceType} 검사
            </div>
            <div className="notification-duration">
              소요시간: {formatDuration(notification.duration)}
            </div>
            {notification.results && (
              <div className="notification-summary">
                {notification.results.totalChecks ? 
                  `${notification.results.totalChecks}개 항목 검사 완료` :
                  '검사 완료'
                }
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default GlobalProgressIndicator;