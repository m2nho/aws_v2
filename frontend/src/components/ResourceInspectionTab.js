import React, { useState, useEffect, useCallback } from 'react';
import { inspectionService } from '../services';
import ServiceInspectionSelector from './ServiceInspectionSelector';
import InspectionResultsView from './InspectionResultsView';
import EnhancedProgressMonitor from './EnhancedProgressMonitor';
import webSocketService from '../services/websocketService';
import webSocketDebugger from '../utils/websocketDebugger';
import { useInspectionStarter } from '../hooks/useInspectionStarter';
import { useInspection } from '../context/InspectionContext';
import './ResourceInspectionTab.css';

// 뷰 상태 정의
const VIEW_STATES = {
  SELECTION: 'selection',
  INSPECTION: 'inspection', 
  RESULTS: 'results'
};

/**
 * ResourceInspectionTab Component
 * AWS 리소스 검사 탭 컴포넌트 - Trusted Advisor 스타일
 * Requirements: 1.1, 1.2, 6.1, 6.2
 */
const ResourceInspectionTab = () => {
  // 훅 사용
  const { startInspection } = useInspectionStarter();
  const { moveToBackground } = useInspection();
  
  // 주요 상태 관리
  const [currentView, setCurrentView] = useState(VIEW_STATES.SELECTION);
  const [currentInspection, setCurrentInspection] = useState(null);
  const [inspectionStatus, setInspectionStatus] = useState(null);
  const [completedInspectionData, setCompletedInspectionData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);



  /**
   * 검사 시작 핸들러
   */
  const handleStartInspection = async (inspectionRequest) => {
    try {
      setIsLoading(true);
      setError(null);
      setCurrentView(VIEW_STATES.INSPECTION);

      // WebSocket 디버깅 시작 (개발 환경에서만)
      if (process.env.NODE_ENV === 'development') {
        webSocketDebugger.startDebugging();
      }

      // useInspectionStarter 훅을 사용하여 검사 시작 (InspectionContext와 자동 연동)
      const result = await startInspection(
        inspectionRequest.serviceType,
        inspectionRequest.inspectionConfig?.selectedItems || [], // 실제 선택된 항목들
        inspectionRequest.assumeRoleArn
      );

      if (result.success) {
        // WebSocket 구독 테스트 (개발 환경에서만)
        if (process.env.NODE_ENV === 'development') {
          webSocketDebugger.testSubscription(result.subscriptionId);
        }
        
        // 검사를 바로 백그라운드로 이동
        if (result.batchId) {
          moveToBackground(result.batchId);
        }
        
        // 바로 선택 화면으로 돌아가기 (우측 하단에서 진행률 확인 가능)
        setCurrentView(VIEW_STATES.SELECTION);
        setCurrentInspection(null);
        
      } else {
        throw new Error(result.error || '검사 시작에 실패했습니다.');
      }
    } catch (error) {
      setError(error.message);
      setCurrentView(VIEW_STATES.SELECTION);
      
      // 오류 발생 시 WebSocket 연결 해제
      webSocketService.disconnect();
      
      // 디버깅 중지 (개발 환경에서만)
      if (process.env.NODE_ENV === 'development') {
        webSocketDebugger.stopDebugging();
      }
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 검사 완료 핸들러
   */
  const handleInspectionComplete = useCallback((inspectionData) => {
    // 검사 완료 시 WebSocket 연결 해제
    webSocketService.disconnect();
    
    // WebSocket 디버깅 중지 (개발 환경에서만)
    if (process.env.NODE_ENV === 'development') {
      webSocketDebugger.stopDebugging();
    }
    
    // 검사 완료 후 선택 화면으로 돌아가기 (Trusted Advisor 스타일)
    setCurrentView(VIEW_STATES.SELECTION);
    setCurrentInspection(null);
    
    // 검사 완료 콜백 실행 (상태 새로고침)
    if (currentInspection?.onInspectionComplete) {
      currentInspection.onInspectionComplete();
    }
  }, [currentInspection]);

  /**
   * 새 검사 시작으로 돌아가기
   */
  const handleBackToSelection = () => {
    // WebSocket 연결이 있다면 해제
    if (webSocketService.getConnectionStatus().isConnected) {
      webSocketService.disconnect();
    }
    
    // 디버깅 중지 (개발 환경에서만)
    if (process.env.NODE_ENV === 'development') {
      webSocketDebugger.stopDebugging();
    }
    
    setCurrentView(VIEW_STATES.SELECTION);
    setCurrentInspection(null);
    setCompletedInspectionData(null);
    setInspectionStatus(null);
    setError(null);
  };

  // 컴포넌트 언마운트 시 WebSocket 정리
  useEffect(() => {
    return () => {
      
      // WebSocket 연결 해제
      if (webSocketService.getConnectionStatus().isConnected) {
        webSocketService.disconnect();
      }
      
      // 디버깅 중지 (개발 환경에서만)
      if (process.env.NODE_ENV === 'development') {
        webSocketDebugger.stopDebugging();
      }
    };
  }, []);

  // 렌더링
  return (
    <div className="resource-inspection-tab">
      {/* 에러 표시 */}
      {error && (
        <div className="error-alert" role="alert">
          <span className="error-icon">⚠️</span>
          <span className="error-message">{error}</span>
          <button 
            className="error-dismiss"
            onClick={() => setError(null)}
            aria-label="오류 메시지 닫기"
          >
            ✕
          </button>
        </div>
      )}

      {/* 뷰 상태에 따른 렌더링 */}
      {currentView === VIEW_STATES.SELECTION && (
        <ServiceInspectionSelector
          onStartInspection={handleStartInspection}
          isLoading={isLoading}
        />
      )}

      {currentView === VIEW_STATES.INSPECTION && currentInspection && (
        <div className="inspection-progress-container">
          <div className="progress-header">
            <h2>검사 진행 중</h2>
            <p>{currentInspection.serviceType} 서비스 검사를 수행하고 있습니다...</p>
          </div>
          
          <EnhancedProgressMonitor
            inspectionId={currentInspection.inspectionId}
            serviceType={currentInspection.serviceType}
            onComplete={handleInspectionComplete}
            onError={(errorData) => {
              setError(errorData.message || '검사 중 오류가 발생했습니다.');
              setCurrentView(VIEW_STATES.SELECTION);
            }}
            showDetailedMetrics={true}
            showConnectionStatus={true}
            size="large"
          />
          
          <div className="progress-actions">
            <button 
              className="background-button"
              onClick={() => {
                // 검사를 백그라운드로 이동
                if (currentInspection?.batchId) {
                  moveToBackground(currentInspection.batchId);
                }
                // 선택 화면으로 돌아가기
                setCurrentView(VIEW_STATES.SELECTION);
                setCurrentInspection(null);
              }}
            >
              백그라운드에서 계속
            </button>
            <button 
              className="cancel-button"
              onClick={handleBackToSelection}
            >
              검사 취소
            </button>
          </div>
        </div>
      )}

      {currentView === VIEW_STATES.RESULTS && completedInspectionData && (
        <InspectionResultsView
          inspectionData={completedInspectionData}
          onBackToSelection={handleBackToSelection}
        />
      )}
    </div>
  );
};

export default ResourceInspectionTab;