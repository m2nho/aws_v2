/**
 * Inspection State Restorer
 * 페이지 이동 시 검사 상태를 복원하는 컴포넌트
 */

import { useEffect } from 'react';
import { useInspection } from '../context/InspectionContext';
import inspectionManager from '../services/inspectionManager';

const InspectionStateRestorer = () => {
  const { activeInspections, startInspection } = useInspection();

  useEffect(() => {
    // 페이지 로드 시 InspectionManager에서 활성 검사 복원
    const managerInspections = inspectionManager.getActiveInspections();
    
    console.log('🔄 [InspectionStateRestorer] Checking for inspections to restore:', {
      contextInspections: activeInspections.length,
      managerInspections: managerInspections.length
    });

    // InspectionManager에는 있지만 Context에는 없는 검사들을 복원
    managerInspections.forEach(inspection => {
      const existsInContext = activeInspections.some(
        contextInspection => contextInspection.batchId === inspection.batchId
      );

      if (!existsInContext) {
        console.log('🔄 [InspectionStateRestorer] Restoring inspection:', inspection.batchId);
        startInspection(inspection);
      }
    });
  }, []); // 컴포넌트 마운트 시에만 실행

  return null; // UI를 렌더링하지 않음
};

export default InspectionStateRestorer;