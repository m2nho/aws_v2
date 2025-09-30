import { useState, useCallback, useRef } from 'react';

// Toast 상태 관리를 위한 커스텀 훅
const useToast = () => {
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);

  // 새로운 토스트 추가
  const showToast = useCallback(({
    type = 'info',
    title,
    message,
    duration = 5000,
    position = 'top-right',
    showCloseButton = true,
    icon = null
  }) => {
    const id = ++toastIdRef.current;
    
    const newToast = {
      id,
      type,
      title,
      message,
      duration,
      position,
      showCloseButton,
      icon,
      createdAt: Date.now()
    };

    setToasts(prevToasts => [...prevToasts, newToast]);
    
    return id;
  }, []);

  // 특정 토스트 제거
  const removeToast = useCallback((id) => {
    setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
  }, []);

  // 모든 토스트 제거
  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  // 편의 메서드들
  const showSuccess = useCallback((title, message, options = {}) => {
    return showToast({
      type: 'success',
      title,
      message,
      ...options
    });
  }, [showToast]);

  const showError = useCallback((title, message, options = {}) => {
    return showToast({
      type: 'error',
      title,
      message,
      duration: 7000, // 에러는 조금 더 오래 표시
      ...options
    });
  }, [showToast]);

  const showWarning = useCallback((title, message, options = {}) => {
    return showToast({
      type: 'warning',
      title,
      message,
      ...options
    });
  }, [showToast]);

  const showInfo = useCallback((title, message, options = {}) => {
    return showToast({
      type: 'info',
      title,
      message,
      ...options
    });
  }, [showToast]);

  return {
    toasts,
    showToast,
    removeToast,
    clearToasts,
    showSuccess,
    showError,
    showWarning,
    showInfo
  };
};

export default useToast;