/**
 * Inspection Starter Hook
 * 검사 시작을 위한 통합 훅
 */

import { useCallback } from 'react';
import { inspectionManager } from '../services';

export const useInspectionStarter = () => {
  // 검사 시작 (자동 추적 포함)
  const startInspection = useCallback(async (serviceType, selectedItems, assumeRoleArn) => {
    console.log('🚀 [useInspectionStarter] Starting inspection:', {
      serviceType,
      selectedItemsCount: selectedItems?.length || 0
    });

    try {
      const result = await inspectionManager.startInspectionWithAutoTracking(
        serviceType,
        selectedItems,
        assumeRoleArn
      );

      if (result.success) {
        console.log('✅ [useInspectionStarter] Inspection started successfully:', {
          batchId: result.batchId,
          subscriptionId: result.subscriptionId
        });
        
        return {
          success: true,
          inspection: result.inspection,
          batchId: result.batchId,
          subscriptionId: result.subscriptionId
        };
      } else {
        console.error('❌ [useInspectionStarter] Failed to start inspection:', result.error);
        return {
          success: false,
          error: result.error
        };
      }
    } catch (error) {
      console.error('🚨 [useInspectionStarter] Unexpected error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }, []);

  return {
    startInspection
  };
};

export default useInspectionStarter;