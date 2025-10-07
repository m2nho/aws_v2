/**
 * Inspection Context
 * 진행 중인 검사들을 전역적으로 관리하는 컨텍스트
 */

import React, { createContext, useContext, useState, useCallback } from 'react';

const InspectionContext = createContext();

export const useInspection = () => {
  const context = useContext(InspectionContext);
  if (!context) {
    throw new Error('useInspection must be used within an InspectionProvider');
  }
  return context;
};

export const InspectionProvider = ({ children }) => {
  const [activeInspections, setActiveInspections] = useState(new Map());
  const [completedInspections, setCompletedInspections] = useState([]);

  // 외부에서 참조할 수 있도록 context 메서드들을 노출
  const contextRef = React.useRef();

  // 새 검사 시작
  const startInspection = useCallback((inspectionData) => {
    const { inspectionId, serviceType, itemNames = [], batchId, totalItems = 0 } = inspectionData;
    
    const inspection = {
      inspectionId,
      batchId: batchId || inspectionId,
      serviceType,
      itemNames,
      totalItems,
      startTime: Date.now(),
      status: 'PENDING',
      progress: 0,
      isBackground: false // 기본적으로 포그라운드에서 시작
    };

    setActiveInspections(prev => new Map(prev.set(inspection.batchId, inspection)));
    
    return inspection;
  }, []);

  // 검사를 백그라운드로 이동
  const moveToBackground = useCallback((inspectionId) => {
    setActiveInspections(prev => {
      const newMap = new Map(prev);
      const inspection = newMap.get(inspectionId);
      if (inspection) {
        newMap.set(inspectionId, { ...inspection, isBackground: true });
      }
      return newMap;
    });
  }, []);

  // 검사를 포그라운드로 이동
  const moveToForeground = useCallback((inspectionId) => {
    setActiveInspections(prev => {
      const newMap = new Map(prev);
      const inspection = newMap.get(inspectionId);
      if (inspection) {
        newMap.set(inspectionId, { ...inspection, isBackground: false });
      }
      return newMap;
    });
  }, []);

  // 검사 진행률 업데이트 (최적화된 버전)
  const updateInspectionProgress = useCallback((inspectionId, progressData) => {
    const percentage = progressData.progress?.percentage ?? progressData.percentage;
    
    // percentage가 undefined이거나 null이면 업데이트하지 않음
    if (percentage === undefined || percentage === null) {
      return;
    }
    
    setActiveInspections(prev => {
      const newMap = new Map(prev);
      
      // 검사 찾기 (최적화된 검색)
      let inspection = newMap.get(inspectionId);
      let keyToUpdate = inspectionId;
      
      if (!inspection) {
        // batchId로 검색 (캐시된 검색 결과 사용 가능)
        for (const [key, value] of newMap.entries()) {
          if (value.inspectionId === inspectionId || value.batchId === inspectionId) {
            inspection = value;
            keyToUpdate = key;
            break;
          }
        }
      }
      
      if (!inspection) {
        return newMap; // 검사를 찾을 수 없음
      }
      
      const newProgress = Math.min(100, Math.max(0, percentage)); // 0-100 범위로 제한
      const newStatus = progressData.status || inspection.status;
      const newCurrentStep = progressData.progress?.currentStep || progressData.currentStep || inspection.currentStep;
      
      // 중복 업데이트 방지 (더 엄격한 조건)
      if (inspection.progress === newProgress && 
          inspection.status === newStatus && 
          inspection.currentStep === newCurrentStep &&
          Math.abs(Date.now() - (inspection.lastUpdated || 0)) < 100) { // 100ms 내 중복 방지
        return newMap;
      }
      
      // 진행률 역행 방지 (완료 상태가 아닌 경우에만)
      if (newProgress < inspection.progress && 
          inspection.status !== 'COMPLETED' && 
          inspection.status !== 'FAILED' &&
          newProgress === 0) {
        return newMap;
      }
      
      // 100% 완료 처리 (한 번만, 더 엄격한 조건)
      if (newProgress >= 100 && 
          inspection.status !== 'COMPLETED' && 
          inspection.status !== 'FAILED' && 
          !inspection.autoCompleted &&
          inspection.progress < 100) { // 이전 진행률이 100% 미만인 경우만
        
        const completedInspection = {
          ...inspection,
          status: 'COMPLETED', // 상태를 COMPLETED로 확실히 설정
          progress: 100,
          currentStep: 'Completed',
          completedAt: Date.now(),
          lastUpdated: Date.now(),
          autoCompleted: true,
          duration: Date.now() - inspection.startTime
        };
        
        console.log('✅ [InspectionContext] Auto-completing:', inspectionId);
        
        // 완료 목록에 즉시 추가 (중복 방지)
        setCompletedInspections(prev => {
          const exists = prev.find(c => 
            c.inspectionId === inspectionId || 
            c.batchId === inspectionId ||
            c.inspectionId === completedInspection.inspectionId
          );
          if (!exists) {
            console.log('📋 [InspectionContext] Adding to completed list (auto):', {
              inspectionId,
              serviceType: completedInspection.serviceType,
              completedAt: completedInspection.completedAt
            });
            return [completedInspection, ...prev.slice(0, 9)];
          }
          console.log('⚠️ [InspectionContext] Already in completed list (auto):', inspectionId);
          return prev;
        });
        
        // 완료된 검사를 활성 목록에서 즉시 제거
        console.log('🗑️ [InspectionContext] Removing completed inspection immediately:', inspectionId);
        
        // 활성 목록에서 즉시 제거
        newMap.delete(keyToUpdate);
        
        console.log('🔍 [InspectionContext] Active count after auto-completion:', {
          inspectionId,
          remainingInMap: newMap.size,
          mapKeys: Array.from(newMap.keys())
        });
        
        if (newMap.size === 0) {
          console.log('🎉 [InspectionContext] All inspections completed - WebSocketManager will handle cleanup');
          // WebSocketManager가 자동으로 처리하므로 별도 작업 불필요
        }
        
        return newMap;
      }
      
      // 일반 업데이트
      const updatedInspection = {
        ...inspection,
        status: newStatus,
        progress: newProgress,
        currentStep: newCurrentStep,
        completedItems: progressData.progress?.completedItems ?? progressData.completedItems ?? inspection.completedItems,
        totalItems: progressData.progress?.totalItems ?? progressData.totalItems ?? inspection.totalItems,
        completedSteps: progressData.progress?.completedSteps ?? progressData.completedSteps ?? inspection.completedSteps,
        totalSteps: progressData.progress?.totalSteps ?? progressData.totalSteps ?? inspection.totalSteps,
        estimatedTimeRemaining: progressData.estimatedTimeRemaining ?? inspection.estimatedTimeRemaining,
        lastUpdated: Date.now()
      };
      
      // 로그 출력 최적화 (20% 단위로 변경)
      const oldProgressTier = Math.floor(inspection.progress / 20);
      const newProgressTier = Math.floor(newProgress / 20);
      if (oldProgressTier !== newProgressTier || newProgress === 100) {
        console.log('🔄 [InspectionContext] Progress:', inspectionId, newProgress + '%');
      }
      
      newMap.set(keyToUpdate, updatedInspection);
      return newMap;
    });
  }, []);

  // 검사 완료 처리 (WebSocket에서 명시적 완료 메시지를 받았을 때)
  const completeInspection = useCallback((inspectionId, completionData) => {
    console.log('🏁 [InspectionContext] WebSocket completion received:', inspectionId);
    
    setActiveInspections(prev => {
      const newMap = new Map(prev);
      
      // 이미 제거된 검사인지 먼저 확인
      if (newMap.size === 0) {
        console.log('⚠️ [InspectionContext] No active inspections, WebSocket completion ignored:', inspectionId);
        return newMap;
      }
      
      // inspectionId로 검사를 찾거나, batchId로 검사를 찾음
      let inspection = newMap.get(inspectionId);
      let keyToRemove = inspectionId;
      
      if (!inspection) {
        // inspectionId로 찾지 못했다면 batchId로 검색
        for (const [key, value] of newMap.entries()) {
          if (value.inspectionId === inspectionId || value.batchId === inspectionId) {
            inspection = value;
            keyToRemove = key;
            break;
          }
        }
      }
      
      if (inspection) {
        console.log('🔍 [InspectionContext] Found inspection for WebSocket completion:', {
          inspectionId,
          currentStatus: inspection.status,
          autoCompleted: inspection.autoCompleted,
          progress: inspection.progress
        });
        
        // 이미 완료된 검사는 조용히 제거만 하고 완료 목록에는 추가하지 않음
        if (inspection.status === 'COMPLETED' || inspection.autoCompleted || inspection.progress >= 100) {
          console.log('⚠️ [InspectionContext] Already completed, just removing from active list:', {
            status: inspection.status,
            autoCompleted: inspection.autoCompleted,
            progress: inspection.progress
          });
          newMap.delete(keyToRemove);
          
          // 모든 검사 완료 확인
          if (newMap.size === 0) {
            console.log('🎉 [InspectionContext] All inspections completed (cleanup) - WebSocketManager will handle');
            // WebSocketManager가 자동으로 처리
          }
          
          return newMap;
        }
        
        // 아직 완료되지 않은 검사만 완료 처리
        const completedInspection = {
          ...inspection,
          status: completionData.status || 'COMPLETED',
          progress: 100,
          completedAt: Date.now(),
          duration: Date.now() - inspection.startTime,
          results: completionData.results,
          currentStep: 'Completed',
          autoCompleted: true
        };

        // 완료 목록에 추가
        setCompletedInspections(prev => {
          const exists = prev.find(c => 
            c.inspectionId === inspectionId || 
            c.batchId === inspectionId ||
            c.inspectionId === completedInspection.inspectionId
          );
          if (!exists) {
            console.log('📋 [InspectionContext] Adding to completed list (websocket):', inspectionId);
            return [completedInspection, ...prev.slice(0, 9)];
          }
          return prev;
        });
        
        // 활성 검사에서 즉시 제거
        newMap.delete(keyToRemove);
        console.log('🗑️ [InspectionContext] Removed from active list via WebSocket:', inspectionId);
        
        // 모든 검사가 완료되었는지 확인
        if (newMap.size === 0) {
          console.log('🎉 [InspectionContext] All inspections completed via WebSocket - WebSocketManager will handle');
          // WebSocketManager가 자동으로 처리
        }
      } else {
        // 검사를 찾을 수 없는 경우 (이미 제거됨)
        console.log('ℹ️ [InspectionContext] Inspection already removed, WebSocket completion ignored:', inspectionId);
      }
      
      return newMap;
    });
  }, []);

  // 검사 취소/제거
  const removeInspection = useCallback((inspectionId) => {
    setActiveInspections(prev => {
      const newMap = new Map(prev);
      newMap.delete(inspectionId);
      return newMap;
    });
  }, []);

  // 백그라운드 검사 목록 가져오기
  const getBackgroundInspections = useCallback(() => {
    return Array.from(activeInspections.values()).filter(inspection => inspection.isBackground);
  }, [activeInspections]);

  // 포그라운드 검사 가져오기
  const getForegroundInspection = useCallback(() => {
    return Array.from(activeInspections.values()).find(inspection => !inspection.isBackground);
  }, [activeInspections]);

  // 특정 검사 정보 가져오기
  const getInspection = useCallback((inspectionId) => {
    return activeInspections.get(inspectionId);
  }, [activeInspections]);

  // 활성 검사 수 가져오기 (완료된 검사 제외)
  const getActiveInspectionCount = useCallback(() => {
    let count = 0;
    for (const inspection of activeInspections.values()) {
      // 완료되지 않은 검사만 카운트
      if (inspection.status !== 'COMPLETED' && !inspection.autoCompleted) {
        count++;
      }
    }
    console.log('🔢 [InspectionContext] Active inspection count:', {
      totalInMap: activeInspections.size,
      actuallyActive: count,
      inspections: Array.from(activeInspections.values()).map(i => ({
        id: i.inspectionId,
        status: i.status,
        autoCompleted: i.autoCompleted,
        progress: i.progress
      }))
    });
    return count;
  }, [activeInspections]);

  const value = {
    // 상태
    activeInspections: Array.from(activeInspections.values()),
    completedInspections,
    
    // 액션
    startInspection,
    moveToBackground,
    moveToForeground,
    updateInspectionProgress,
    completeInspection,
    removeInspection,
    
    // 헬퍼
    getBackgroundInspections,
    getForegroundInspection,
    getInspection,
    getActiveInspectionCount
  };

  // 외부 참조용 객체 업데이트
  contextRef.current = value;

  // InspectionManager와 WebSocketService에 context 참조 설정
  React.useEffect(() => {
    import('../services/inspectionManager').then(({ default: inspectionManager }) => {
      inspectionManager.setInspectionContext(contextRef.current);
    });
    
    import('../services/websocketService').then(({ default: websocketService }) => {
      websocketService.setInspectionContext(contextRef.current);
    });
  }, []);

  return (
    <InspectionContext.Provider value={value}>
      {children}
    </InspectionContext.Provider>
  );
};

export default InspectionContext;