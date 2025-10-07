/**
 * Inspection with Background Support
 * 백그라운드 지원이 포함된 검사 컴포넌트 사용 예시
 */

import React, { useState } from 'react';
import { useInspection } from '../context/InspectionContext';
import EnhancedProgressMonitor from './EnhancedProgressMonitor';
import BackgroundInspectionManager from './BackgroundInspectionManager';
import InspectionStatusBar from './InspectionStatusBar';
import InspectionDetailModal from './InspectionDetailModal';

const InspectionWithBackground = ({ 
  inspectionData, 
  onInspectionComplete,
  onInspectionError 
}) => {
  const { 
    startInspection, 
    moveToBackground, 
    getForegroundInspection,
    updateInspectionProgress 
  } = useInspection();

  const [currentInspection, setCurrentInspection] = useState(null);
  const [selectedInspection, setSelectedInspection] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const foregroundInspection = getForegroundInspection();

  // 검사 시작
  const handleStartInspection = (inspectionConfig) => {
    const inspection = startInspection({
      inspectionId: inspectionConfig.subscriptionId, // 백엔드에서 받은 구독 ID
      batchId: inspectionConfig.batchId,
      serviceType: inspectionConfig.serviceType,
      itemNames: inspectionConfig.inspectionJobs?.map(job => job.itemName) || [],
      totalItems: inspectionConfig.inspectionJobs?.length || 0
    });
    
    setCurrentInspection(inspection);
  };

  // 백그라운드로 이동
  const handleMoveToBackground = () => {
    if (currentInspection) {
      moveToBackground(currentInspection.batchId);
      setCurrentInspection(null);
    }
  };

  // 검사 완료 처리
  const handleInspectionComplete = (completionData) => {
    if (onInspectionComplete) {
      onInspectionComplete(completionData);
    }
    setCurrentInspection(null);
  };

  // 검사 오류 처리
  const handleInspectionError = (errorData) => {
    if (onInspectionError) {
      onInspectionError(errorData);
    }
    setCurrentInspection(null);
  };

  // 검사 상세 보기
  const handleViewInspection = (inspection) => {
    setSelectedInspection(inspection);
    setIsModalOpen(true);
  };

  // 모달 닫기
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedInspection(null);
  };

  return (
    <div className="inspection-with-background">
      {/* 상단 검사 상태 바 */}
      <InspectionStatusBar onViewInspection={handleViewInspection} />

      {/* 포그라운드 검사 모니터 */}
      {(currentInspection || foregroundInspection) && (
        <EnhancedProgressMonitor
          inspectionId={(currentInspection || foregroundInspection).batchId}
          serviceType={(currentInspection || foregroundInspection).serviceType}
          onComplete={handleInspectionComplete}
          onError={handleInspectionError}
          onMoveToBackground={handleMoveToBackground}
          allowBackground={true}
          showDetailedMetrics={true}
          showConnectionStatus={true}
        />
      )}

      {/* 백그라운드 검사 관리자 */}
      <BackgroundInspectionManager />

      {/* 검사 상세 보기 모달 */}
      <InspectionDetailModal
        inspection={selectedInspection}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onMoveToBackground={handleMoveToBackground}
      />

      {/* 검사 시작 버튼 (예시) */}
      {!currentInspection && !foregroundInspection && (
        <div className="inspection-controls">
          <button 
            className="start-inspection-button"
            onClick={() => handleStartInspection(inspectionData)}
          >
            검사 시작
          </button>
        </div>
      )}
    </div>
  );
};

export default InspectionWithBackground;