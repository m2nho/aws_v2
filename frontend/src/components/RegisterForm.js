import React, { useState } from 'react';
import { useAuth } from '../context';
import './RegisterForm.css';

const RegisterForm = ({ onSuccess, onCancel }) => {
  const { register, loading, error, clearError } = useAuth();
  
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    roleArn: '',
    companyName: ''
  });
  
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

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
    } else if (formData.password.length < 8) {
      errors.password = '비밀번호는 최소 8자 이상이어야 합니다';
    } else if (!/(?=.*[a-z])(?=.*\d)/.test(formData.password)) {
      errors.password = '비밀번호는 소문자와 숫자를 포함해야 합니다';
    }
    
    // 비밀번호 확인 유효성 검사
    if (!formData.confirmPassword) {
      errors.confirmPassword = '비밀번호 확인을 입력해주세요';
    } else if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = '비밀번호가 일치하지 않습니다';
    }
    
    // AWS Role ARN 유효성 검사
    if (!formData.roleArn.trim()) {
      errors.roleArn = 'AWS Role ARN을 입력해주세요';
    } else if (!formData.roleArn.startsWith('arn:aws:iam::')) {
      errors.roleArn = 'AWS Role ARN은 "arn:aws:iam::"로 시작해야 합니다';
    }
    
    // 회사명 유효성 검사
    if (!formData.companyName.trim()) {
      errors.companyName = '회사명을 입력해주세요';
    } else if (formData.companyName.length < 2) {
      errors.companyName = '회사명은 최소 2자 이상이어야 합니다';
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
    
    // Clear success message when user makes changes
    if (successMessage) {
      setSuccessMessage('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Clear previous errors
    setFormErrors({});
    clearError();
    setSuccessMessage('');
    
    // Validate form
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // API 호출 시 confirmPassword 제외
      const { confirmPassword, ...registrationData } = formData;
      const result = await register(registrationData);
      
      if (result.success) {
        setSuccessMessage('회원가입이 완료되었습니다! 관리자 승인 후 로그인이 가능합니다.');
        setFormData({
          username: '',
          password: '',
          confirmPassword: '',
          roleArn: '',
          companyName: ''
        });
        
        // 성공 콜백 호출
        if (onSuccess) {
          setTimeout(() => onSuccess(result), 2000);
        }
      } else {
        // 회원가입 실패, 에러는 AuthContext에서 처리
        console.error('Registration failed:', result.message);
      }
    } catch (err) {
      console.error('Registration error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      username: '',
      password: '',
      confirmPassword: '',
      roleArn: '',
      companyName: ''
    });
    setFormErrors({});
    clearError();
    setSuccessMessage('');
    
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <div className="register-form-container">
      <form onSubmit={handleSubmit} className="register-form" noValidate>
        <h1 className="page-title">AWS 사용자 관리 시스템 회원가입</h1>
        
        {/* Progress Indicator */}
        <div className="form-progress" role="progressbar" aria-label="회원가입 진행 상황" aria-valuenow="1" aria-valuemin="1" aria-valuemax="4">
          <div className="progress-steps">
            <div className="progress-step">
              <div className="step-indicator active" aria-current="step">1</div>
              <span className="step-label active">기본 정보</span>
            </div>
            <div className="progress-step">
              <div className="step-indicator" aria-hidden="true">2</div>
              <span className="step-label">보안 설정</span>
            </div>
            <div className="progress-step">
              <div className="step-indicator" aria-hidden="true">3</div>
              <span className="step-label">AWS 설정</span>
            </div>
            <div className="progress-step">
              <div className="step-indicator" aria-hidden="true">4</div>
              <span className="step-label">완료</span>
            </div>
          </div>
          <span className="sr-only">4단계 중 1단계: 기본 정보 입력</span>
        </div>

        <div className="form-content">
          {/* Success Message */}
          {successMessage && (
            <div className="success-message" role="alert" aria-live="polite">
              <span className="sr-only">성공: </span>
              {successMessage}
            </div>
          )}
          
          {/* Global Error Message */}
          {error && (
            <div className="error-message" role="alert" aria-live="polite">
              <span className="sr-only">오류: </span>
              {error}
            </div>
          )}
        
        {/* 이메일 필드 */}
        <div className="form-group">
          <label htmlFor="username">이메일 *</label>
          <input
            type="email"
            id="username"
            name="username"
            value={formData.username}
            onChange={handleInputChange}
            className={formErrors.username ? 'error' : ''}
            placeholder="이메일 주소를 입력하세요"
            disabled={isSubmitting || loading}
          />
          {formErrors.username && (
            <span className="field-error">{formErrors.username}</span>
          )}
        </div>
        
        {/* 비밀번호 필드 */}
        <div className="form-group">
          <label htmlFor="password">비밀번호 *</label>
          <input
            type="password"
            id="password"
            name="password"
            value={formData.password}
            onChange={handleInputChange}
            className={formErrors.password ? 'error' : ''}
            placeholder="비밀번호를 입력하세요"
            disabled={isSubmitting || loading}
          />
          {formErrors.password && (
            <span className="field-error">{formErrors.password}</span>
          )}
          <small className="field-hint">
            비밀번호는 최소 8자 이상, 소문자와 숫자를 포함해야 합니다
          </small>
        </div>
        
        {/* 비밀번호 확인 필드 */}
        <div className="form-group">
          <label htmlFor="confirmPassword">비밀번호 확인 *</label>
          <input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleInputChange}
            className={formErrors.confirmPassword ? 'error' : ''}
            placeholder="비밀번호를 다시 입력하세요"
            disabled={isSubmitting || loading}
          />
          {formErrors.confirmPassword && (
            <span className="field-error">{formErrors.confirmPassword}</span>
          )}
        </div>
        
        {/* AWS Role ARN 필드 */}
        <div className="form-group">
          <label htmlFor="roleArn">AWS Role ARN *</label>
          <input
            type="text"
            id="roleArn"
            name="roleArn"
            value={formData.roleArn}
            onChange={handleInputChange}
            className={formErrors.roleArn ? 'error' : ''}
            placeholder="arn:aws:iam::123456789012:role/YourRoleName"
            disabled={isSubmitting || loading}
          />
          {formErrors.roleArn && (
            <span className="field-error">{formErrors.roleArn}</span>
          )}
          <small className="field-hint">
            AWS IAM 역할의 전체 ARN을 입력하세요
          </small>
        </div>
        
        {/* 회사명 필드 */}
        <div className="form-group">
          <label htmlFor="companyName">회사명 *</label>
          <input
            type="text"
            id="companyName"
            name="companyName"
            value={formData.companyName}
            onChange={handleInputChange}
            className={formErrors.companyName ? 'error' : ''}
            placeholder="회사명을 입력하세요"
            disabled={isSubmitting || loading}
          />
          {formErrors.companyName && (
            <span className="field-error">{formErrors.companyName}</span>
          )}
        </div>
        
          {/* 폼 액션 */}
          <div className="form-actions">
            <button
              type="button"
              onClick={handleCancel}
              className="btn btn-secondary"
              disabled={isSubmitting || loading}
            >
              취소
            </button>
            <button
              type="submit"
              className={`btn btn-primary ${(isSubmitting || loading) ? 'btn-loading' : ''}`}
              disabled={isSubmitting || loading}
            >
              {isSubmitting || loading ? '가입 중...' : '회원가입'}
            </button>
          </div>
        
          <p className="form-note">
            * 필수 입력 항목입니다. 회원가입 후 관리자 승인을 기다려주세요.
          </p>
        </div>
      </form>
    </div>
  );
};

export default RegisterForm;