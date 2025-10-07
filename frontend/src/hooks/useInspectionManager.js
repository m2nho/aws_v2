/**
 * Inspection Manager Hook
 * 검사 시작과 관리를 위한 통합 훅
 */

import { useCallback } from 'react';
import { useInspection } from '../context/InspectionContext';
import { inspectionService } from '../services';

export const useInspectionManager = () => {
  const { startInspection, moveToBackground } = useInspection();

  // 검사 시작 및 자동 등록
  const startInspectionWithTracking = useCallback(async (serviceType, selectedItems, assumeRoleArn) => {
    try {
      // 백엔드에 검사 시작 요청
      const response = await inspectionService.startInspection(serviceType, selectedItems, assumeRoleArn);
      
      if (response.success) {
        const { batchId, subscriptionId, inspectionJobs } = response.data;
        
        // InspectionContext에 검사 등록
        const inspection = startInspection({
          inspectionId: subscriptionId,
          batchId: batchId,
          serviceType: serviceType,
          itemNames: inspectionJobs?.map(job => job.itemName) || [],
          totalItems: inspectionJobs?.length || 0
        });
        
        console.log(`🚀 [InspectionManager] Started inspection:`, {
          batchId,
          subscriptionId,
          serviceType,
          totalItems: inspectionJobs?.length || 0
        });
        
        return {
          success: true,
          inspection,
          subscriptionId,
          batchId
        };
      } else {
        throw new Error(response.error?.message || '검사 시작에 실패했습니다');
      }
    } catch (error) {
      console.error('🚨 [InspectionManager] Failed to start inspection:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }, [startInspection]);

  // 검사를 백그라운드로 이동
  const moveInspectionToBackground = useCallback((inspectionId) => {
    moveToBackground(inspectionId);
    console.log(`⬇️ [InspectionManager] Moved inspection to background: ${inspectionId}`);
  }, [moveToBackground]);

  return {
    startInspectionWithTracking,
    moveInspectionToBackground
  };
};

export default useInspectionManager;