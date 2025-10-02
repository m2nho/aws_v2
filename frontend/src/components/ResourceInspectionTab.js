import React, { useState, useEffect, useCallback } from 'react';
import { inspectionService } from '../services';
import ServiceInspectionSelector from './ServiceInspectionSelector';
import InspectionResultsView from './InspectionResultsView';
import EnhancedProgressMonitor from './EnhancedProgressMonitor';
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

      // inspectionService.startInspection은 하나의 객체를 받음
      const result = await inspectionService.startInspection({
        serviceType: inspectionRequest.serviceType,
        assumeRoleArn: inspectionRequest.assumeRoleArn,
        inspectionConfig: inspectionRequest.inspectionConfig || {}
      });

      if (result.success) {
        setCurrentInspection({
          inspectionId: result.data.inspectionId,
          serviceType: inspectionRequest.serviceType,
          status: 'STARTED',
          onInspectionComplete: inspectionRequest.onInspectionComplete
        });
        
        console.log('Inspection started successfully:', result.data);
      } else {
        throw new Error(result.error?.message || '검사 시작에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to start inspection:', error);
      setError(error.message);
      setCurrentView(VIEW_STATES.SELECTION);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 검사 완료 핸들러
   */
  const handleInspectionComplete = useCallback((inspectionData) => {
    console.log('Inspection completed:', inspectionData);
    
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
    setCurrentView(VIEW_STATES.SELECTION);
    setCurrentInspection(null);
    setCompletedInspectionData(null);
    setInspectionStatus(null);
    setError(null);
  };



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