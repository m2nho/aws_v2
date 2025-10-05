import React, { useState, useEffect, useCallback } from 'react';
import { inspectionService } from '../services';
import ServiceInspectionSelector from './ServiceInspectionSelector';
import InspectionResultsView from './InspectionResultsView';
import EnhancedProgressMonitor from './EnhancedProgressMonitor';
import webSocketService from '../services/websocketService';
import webSocketDebugger from '../utils/websocketDebugger';
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

      console.log('Starting inspection with config:', inspectionRequest);

      // 검사 시작 시에만 WebSocket 연결
      console.log('🔌 검사 시작 - WebSocket 연결 중...');
      
      // WebSocket 디버깅 시작 (개발 환경에서만)
      if (process.env.NODE_ENV === 'development') {
        webSocketDebugger.startDebugging();
      }

      // 기존 연결이 있다면 정리
      if (webSocketService.getConnectionStatus().isConnected) {
        console.log('🔄 기존 WebSocket 연결 정리 중...');
        webSocketService.disconnect();
      }

      // 검사용 WebSocket 연결 시작
      const token = webSocketService.getStoredToken();
      if (token) {
        try {
          console.log('🔌 검사용 WebSocket 연결 시도...');
          await webSocketService.connect(token);
          console.log('✅ 검사용 WebSocket 연결 성공');
        } catch (wsError) {
          console.error('❌ WebSocket 연결 실패:', wsError);
          // 연결 실패해도 검사는 계속 진행 (폴링으로 대체 가능)
        }
      } else {
        console.warn('⚠️ 인증 토큰이 없어 WebSocket 연결 불가');
      }

      // inspectionService.startInspection은 하나의 객체를 받음
      const result = await inspectionService.startInspection({
        serviceType: inspectionRequest.serviceType,
        assumeRoleArn: inspectionRequest.assumeRoleArn,
        inspectionConfig: inspectionRequest.inspectionConfig || {}
      });

      if (result.success) {
        // 배치 검사의 경우 첫 번째 검사 ID 사용
        const inspectionId = result.data.inspectionJobs?.[0]?.inspectionId || result.data.inspectionId;
        
        console.log('🎯 Inspection started successfully:', result.data);
        console.log('🔍 Using inspection ID for monitoring:', inspectionId);
        
        // WebSocket 연결 상태 확인
        const finalWsStatus = webSocketService.getConnectionStatus();
        console.log('🔌 검사 시작 후 WebSocket 상태:', finalWsStatus);
        
        // WebSocket 구독 테스트 (개발 환경에서만)
        if (process.env.NODE_ENV === 'development') {
          webSocketDebugger.testSubscription(inspectionId);
        }
        
        setCurrentInspection({
          inspectionId: inspectionId,
          serviceType: inspectionRequest.serviceType,
          status: 'STARTED',
          onInspectionComplete: inspectionRequest.onInspectionComplete,
          batchData: result.data // 배치 정보 저장
        });
        
      } else {
        throw new Error(result.error?.message || '검사 시작에 실패했습니다.');
      }
    } catch (error) {
      console.error('❌ 검사 시작 실패:', error);
      setError(error.message);
      setCurrentView(VIEW_STATES.SELECTION);
      
      // 오류 발생 시 WebSocket 연결 해제
      console.log('🔌 오류 발생 - WebSocket 연결 해제 중...');
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
    console.log('✅ 검사 완료:', inspectionData);
    
    // 검사 완료 시 WebSocket 연결 해제
    console.log('🔌 검사 완료 - WebSocket 연결 해제 중...');
    webSocketService.disconnect();
    console.log('✅ WebSocket 연결 해제 완료');
    
    // WebSocket 디버깅 중지 (개발 환경에서만)
    if (process.env.NODE_ENV === 'development') {
      webSocketDebugger.stopDebugging();
      console.log('🛑 WebSocket 디버깅 중지');
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
    console.log('🔙 선택 화면으로 돌아가기');
    
    // WebSocket 연결이 있다면 해제
    if (webSocketService.getConnectionStatus().isConnected) {
      console.log('🔌 WebSocket 연결 해제 중...');
      webSocketService.disconnect();
      console.log('✅ WebSocket 연결 해제 완료');
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
      console.log('🧹 ResourceInspectionTab 언마운트 - WebSocket 정리');
      
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
              console.error('Inspection monitoring error:', errorData);
              setError(errorData.message || '검사 중 오류가 발생했습니다.');
              setCurrentView(VIEW_STATES.SELECTION);
            }}
            showDetailedMetrics={true}
            showConnectionStatus={true}
            size="large"
          />
          
          <div className="progress-actions">
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