/**
 * Inspection Toast Component
 * 검사 완료/오류 시 나타나는 토스트 알림
 */

import React, { useState, useEffect } from 'react';
import './InspectionToast.css';

const InspectionToast = ({ 
  message, 
  type = 'info', 
  duration = 4000, 
  onClose,
  onAction,
  actionText = '보기'
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration]);

  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(() => {
      setIsVisible(false);
      if (onClose) {
        onClose();
      }
    }, 300);
  };

  const handleAction = () => {
    if (onAction) {
      onAction();
    }
    handleClose();
  };

  const getIcon = () => {
    switch (type) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'progress': return '🔄';
      default: return 'ℹ️';
    }
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className={`inspection-toast ${type} ${isLeaving ? 'leaving' : ''}`}>
      <div className="toast-content">
        <span className="toast-icon">{getIcon()}</span>
        <span className="toast-message">{message}</span>
      </div>
      
      <div className="toast-actions">
        {onAction && (
          <button 
            className="toast-action-button"
            onClick={handleAction}
          >
            {actionText}
          </button>
        )}
        <button 
          className="toast-close-button"
          onClick={handleClose}
          aria-label="알림 닫기"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default InspectionToast;