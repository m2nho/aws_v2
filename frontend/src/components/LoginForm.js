import React, { useState } from 'react';
import { useAuth } from '../context';
import './LoginForm.css';

const LoginForm = ({ onSuccess, onCancel }) => {
  const { login, loading, error, clearError } = useAuth();
  
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 유효성 검사 규칙
  const validateForm = () => {
    const errors = {};
    
    // 이메일 유효성 검사
    if (!formData.username.trim()) {
      errors.username = '이메일을 입력해주세요';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.username)) {
      errors.username = '올바른 이메일 주소를 입력해주세요';
    }
    
    // 비밀번호 유효성 검사
    if (!formData.password) {
      errors.password = '비밀번호를 입력해주세요';
    }
    
    return errors;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear field-specific error when user starts typing
    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
    
    // Clear global error when user makes changes
    if (error) {
      clearError();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Clear previous errors
    setFormErrors({});
    clearError();
    
    // Validate form
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      console.log('Attempting login with:', { username: formData.username, password: '***' });
      const result = await login(formData);
      console.log('Login result:', result);
      
      if (result.success) {
        console.log('Login successful, calling onSuccess callback');
        // 성공 콜백 호출 - 상태별 리디렉션은 부모 컴포넌트에서 처리
        if (onSuccess) {
          onSuccess(result);
        }
      } else {
        // 로그인 실패, 에러는 AuthContext에서 처리
        console.error('Login failed:', result.message);
      }
    } catch (err) {
      console.error('Login error details:', err);
      console.error('Error response:', err.response?.data);
      console.error('Error status:', err.response?.status);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      username: '',
      password: ''
    });
    setFormErrors({});
    clearError();
    
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <div className="login-form-container">
      <form onSubmit={handleSubmit} className="login-form" noValidate>
        <h1 className="page-title">AWS 사용자 관리 시스템 로그인</h1>
        
        {/* Global Error Message */}
        {error && (
          <div className="error-message" role="alert" aria-live="polite">
            <span className="sr-only">오류: </span>
            {error}
          </div>
        )}
        
        {/* 이메일 필드 */}
        <div className={`form-group ${formErrors.username ? 'form-group--error' : ''}`}>
          <label htmlFor="username">
            이메일 
            <span className="input-label__required" aria-label="필수 입력 항목">*</span>
          </label>
          <input
            type="email"
            id="username"
            name="username"
            value={formData.username}
            onChange={handleInputChange}
            className={formErrors.username ? 'error' : ''}
            placeholder="이메일 주소를 입력하세요"
            disabled={isSubmitting || loading}
            autoComplete="username"
            aria-required="true"
            aria-invalid={formErrors.username ? 'true' : 'false'}
            aria-describedby={formErrors.username ? 'username-error' : undefined}
          />
          {formErrors.username && (
            <span 
              id="username-error" 
              className="field-error" 
              role="alert" 
              aria-live="polite"
            >
              {formErrors.username}
            </span>
          )}
        </div>
        
        {/* 비밀번호 필드 */}
        <div className={`form-group ${formErrors.password ? 'form-group--error' : ''}`}>
          <label htmlFor="password">
            비밀번호 
            <span className="input-label__required" aria-label="필수 입력 항목">*</span>
          </label>
          <input
            type="password"
            id="password"
            name="password"
            value={formData.password}
            onChange={handleInputChange}
            className={formErrors.password ? 'error' : ''}
            placeholder="비밀번호를 입력하세요"
            disabled={isSubmitting || loading}
            autoComplete="current-password"
            aria-required="true"
            aria-invalid={formErrors.password ? 'true' : 'false'}
            aria-describedby={formErrors.password ? 'password-error' : undefined}
          />
          {formErrors.password && (
            <span 
              id="password-error" 
              className="field-error" 
              role="alert" 
              aria-live="polite"
            >
              {formErrors.password}
            </span>
          )}
        </div>
        
        {/* 폼 액션 */}
        <div className="form-actions" role="group" aria-label="폼 액션">
          <button
            type="button"
            onClick={handleCancel}
            className="btn btn-secondary"
            disabled={isSubmitting || loading}
            aria-label="로그인 취소"
          >
            취소
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting || loading}
            aria-label={isSubmitting || loading ? '로그인 처리 중' : '로그인 실행'}
            aria-describedby={isSubmitting || loading ? 'login-status' : undefined}
          >
            {isSubmitting || loading ? '로그인 중...' : '로그인'}
          </button>
          {(isSubmitting || loading) && (
            <span id="login-status" className="sr-only" aria-live="polite">
              로그인을 처리하고 있습니다. 잠시만 기다려주세요.
            </span>
          )}
        </div>
        
        <p className="form-note">
          * 필수 입력 항목입니다. 계정이 없으시면 회원가입을 해주세요.
        </p>
      </form>
    </div>
  );
};

export default LoginForm;