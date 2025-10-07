/**
 * Smart Inspection UI
 * 미니멀하고 스마트한 검사 UI 시스템
 */

import React, { useState, useEffect } from 'react';
import { useInspection } from '../context/InspectionContext';
import webSocketService from '../services/websocketService';
import MinimalProgressIndicator from './MinimalProgressIndicator';
import InspectionDetailModal from './InspectionDetailModal';
import InspectionStateRestorer from './InspectionStateRestorer';

const SmartInspectionUI = () => {
  const { 
    moveToForeground, 
    updateInspectionProgress, 
    completeInspection,
    activeInspections 
  } = useInspection();
  const [selectedInspection, setSelectedInspection] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeSubscriptions, setActiveSubscriptions] = useState(new Set());

  const handleViewInspection = (inspection) => {
    setSelectedInspection(inspection);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedInspection(null);
  };

  const handleMoveToForeground = (inspection) => {
    moveToForeground(inspection.batchId);
    handleCloseModal();
  };

  // WebSocket 구독 관리
  useEffect(() => {
    const currentInspectionIds = new Set(activeInspections.map(inspection => inspection.batchId));
    
    // 새로운 검사에 대한 구독 추가
    currentInspectionIds.forEach(inspectionId => {
      if (!activeSubscriptions.has(inspectionId)) {
        const unsubscribe = webSocketService.subscribeToInspection(inspectionId, (message) => {
          const { type, data } = message;
          
          switch (type) {
            case 'progress':
              updateInspectionProgress(data.inspectionId, data);
              break;
              
            case 'status_change':
              updateInspectionProgress(data.inspectionId, data);
              break;
              
            case 'complete':
              completeInspection(data.inspectionId, data);
              break;
              
            case 'subscription_moved':
              // 구독이 이동된 경우 새로운 ID로 업데이트
              break;
              
            default:
              break;
          }
        });
        
        setActiveSubscriptions(prev => new Set(prev).add(inspectionId));
      }
    });
    
    // 완료된 검사에 대한 구독 제거
    activeSubscriptions.forEach(inspectionId => {
      if (!currentInspectionIds.has(inspectionId)) {
        setActiveSubscriptions(prev => {
          const newSet = new Set(prev);
          newSet.delete(inspectionId);
          return newSet;
        });
      }
    });
    
  }, [activeInspections, activeSubscriptions, updateInspectionProgress, completeInspection]);

  return (
    <>
      {/* 검사 상태 복원 */}
      <InspectionStateRestorer />
      
      {/* 미니멀 진행률 표시기 */}
      <MinimalProgressIndicator onViewDetails={handleViewInspection} />
      
      {/* 토스트 알림 관리자 제거됨 - GlobalProgressIndicator만 사용 */}
      
      {/* 상세 보기 모달 */}
      <InspectionDetailModal
        inspection={selectedInspection}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onMoveToBackground={handleCloseModal}
      />
    </>
  );
};

export default SmartInspectionUI;