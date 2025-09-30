import React, { useEffect, useState } from 'react';
import './Toast.css';

const Toast = ({ 
  id,
  type = 'info', 
  title, 
  message, 
  duration = 5000,
  onClose,
  position = 'top-right',
  showCloseButton = true,
  icon = null
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // 컴포넌트 마운트 시 애니메이션 시작
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        handleClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      onClose(id);
    }, 300); // 애니메이션 시간과 맞춤
  };

  const getIcon = () => {
    if (icon) return icon;
    
    switch (type) {
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
      default:
        return 'ℹ️';
    }
  };

  const toastClasses = [
    'toast',
    `toast--${type}`,
    `toast--${position}`,
    isVisible && !isExiting ? 'toast--visible' : '',
    isExiting ? 'toast--exiting' : ''
  ].filter(Boolean).join(' ');

  return (
    <div 
      className={toastClasses} 
      role={type === 'error' ? 'alert' : 'status'} 
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      <div className="toast__icon" aria-hidden="true">
        {getIcon()}
      </div>
      <div className="toast__content">
        {title && <div className="toast__title" role="heading" aria-level="3">{title}</div>}
        {message && <div className="toast__message">{message}</div>}
      </div>
      {showCloseButton && (
        <button 
          className="toast__close"
          onClick={handleClose}
          aria-label="알림 닫기"
          type="button"
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
    </div>
  );
};

// Toast Container 컴포넌트
const ToastContainer = ({ toasts, position = 'top-right', onRemove }) => {
  if (!toasts || toasts.length === 0) return null;

  const containerClasses = [
    'toast-container',
    `toast-container--${position}`
  ].join(' ');

  return (
    <div 
      className={containerClasses}
      aria-label="알림 메시지"
      role="region"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          {...toast}
          onClose={onRemove}
        />
      ))}
    </div>
  );
};

export default Toast;
export { ToastContainer };