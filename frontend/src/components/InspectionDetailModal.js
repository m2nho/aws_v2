/**
 * Inspection Detail Modal Component
 * 검사 상세 정보를 보여주는 모달
 */

import React from 'react';
import EnhancedProgressMonitor from './EnhancedProgressMonitor';
import { useInspection } from '../context/InspectionContext';
import './InspectionDetailModal.css';

const InspectionDetailModal = ({ 
  inspection, 
  isOpen, 
  onClose, 
  onMoveToBackground 
}) => {
  const { moveToForeground } = useInspection();

  if (!isOpen || !inspection) {
    return null;
  }

  const handleMoveToForeground = () => {
    moveToForeground(inspection.batchId);
    onClose();
  };

  const handleMoveToBackground = () => {
    if (onMoveToBackground) {
      onMoveToBackground();
    }
    onClose();
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="inspection-modal-backdrop" onClick={handleBackdropClick}>
      <div className="inspection-modal">
        <div className="modal-header">
          <h2 className="modal-title">
            {inspection.serviceType} 검사 진행 상황
          </h2>
          <button 
            className="modal-close-button"
            onClick={onClose}
            aria-label="모달 닫기"
          >
            ✕
          </button>
        </div>

        <div className="modal-content">
          <EnhancedProgressMonitor
            inspectionId={inspection.batchId}
            serviceType={inspection.serviceType}
            onMoveToBackground={handleMoveToBackground}
            showDetailedMetrics={true}
            showConnectionStatus={true}
            allowBackground={true}
            size="large"
          />
        </div>

        <div className="modal-actions">
          <button 
            className="action-button secondary"
            onClick={handleMoveToBackground}
          >
            백그라운드로 이동
          </button>
          
          <button 
            className="action-button primary"
            onClick={handleMoveToForeground}
          >
            메인 화면에서 보기
          </button>
          
          <button 
            className="action-button secondary"
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};

export default InspectionDetailModal;