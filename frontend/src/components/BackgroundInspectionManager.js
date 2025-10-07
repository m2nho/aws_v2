/**
 * Background Inspection Manager
 * 모든 백그라운드 검사를 관리하는 컴포넌트
 */

import React from 'react';
import { useInspection } from '../context/InspectionContext';
import BackgroundInspectionMonitor from './BackgroundInspectionMonitor';

const BackgroundInspectionManager = () => {
  const { 
    getBackgroundInspections, 
    moveToForeground, 
    completeInspection, 
    updateInspectionProgress,
    removeInspection 
  } = useInspection();

  const backgroundInspections = getBackgroundInspections();

  const handleInspectionComplete = (inspectionId) => (completionData) => {
    completeInspection(inspectionId, completionData);
  };

  const handleInspectionError = (inspectionId) => (errorData) => {
    // 오류 발생 시 검사를 완료 상태로 처리
    completeInspection(inspectionId, {
      status: 'FAILED',
      error: errorData
    });
  };

  const handleToggleMinimize = (inspectionId) => (isMinimized) => {
    // 최소화 상태는 로컬 상태로 관리되므로 여기서는 특별한 처리 불필요
    // 필요시 사용자 설정으로 저장 가능
  };

  if (backgroundInspections.length === 0) {
    return null;
  }

  return (
    <div className="background-inspection-manager">
      {backgroundInspections.map((inspection, index) => (
        <div
          key={inspection.batchId}
          style={{
            position: 'fixed',
            bottom: 20 + (index * 80), // 여러 검사가 있을 때 세로로 배치
            right: 20,
            zIndex: 1000 - index // 최신 검사가 위에 오도록
          }}
        >
          <BackgroundInspectionMonitor
            inspectionId={inspection.batchId}
            serviceType={inspection.serviceType}
            onComplete={handleInspectionComplete(inspection.batchId)}
            onError={handleInspectionError(inspection.batchId)}
            onToggleMinimize={handleToggleMinimize(inspection.batchId)}
            minimized={true} // 백그라운드는 기본적으로 최소화
          />
        </div>
      ))}
    </div>
  );
};

export default BackgroundInspectionManager;