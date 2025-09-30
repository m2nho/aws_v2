import React, { createContext, useContext } from 'react';
import { ToastContainer } from './Toast';
import useToast from '../../hooks/useToast';

// Toast Context 생성
const ToastContext = createContext();

// Toast Provider 컴포넌트
export const ToastProvider = ({ children, position = 'top-right', maxToasts = 5 }) => {
  const toastMethods = useToast();
  
  // 최대 토스트 수 제한
  const limitedToasts = toastMethods.toasts.slice(-maxToasts);

  return (
    <ToastContext.Provider value={toastMethods}>
      {children}
      <ToastContainer 
        toasts={limitedToasts}
        position={position}
        onRemove={toastMethods.removeToast}
      />
    </ToastContext.Provider>
  );
};

// Toast Context를 사용하는 훅
export const useToastContext = () => {
  const context = useContext(ToastContext);
  
  if (!context) {
    throw new Error('useToastContext must be used within a ToastProvider');
  }
  
  return context;
};

export default ToastProvider;