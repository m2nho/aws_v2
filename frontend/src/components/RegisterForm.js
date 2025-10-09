import { useState } from 'react';
import { useAuth } from '../context';
import './RegisterForm.css';

const RegisterForm = ({ onSuccess }) => {
  const { register, loading, error, clearError } = useAuth();
  
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    roleArn: '',
    companyName: ''
  });
  
  const [formErrors, setFormErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const validateForm = () => {
    const errors = {};
    
    if (!formData.username.trim()) {
      errors.username = '사용자명을 입력해주세요';
    }
    
    if (!formData.password) {
      errors.password = '비밀번호를 입력해주세요';
    } else if (formData.password.length < 8) {
      errors.password = '비밀번호는 최소 8자 이상이어야 합니다';
    }
    
    if (!formData.confirmPassword) {
      errors.confirmPassword = '비밀번호 확인을 입력해주세요';
    } else if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = '비밀번호가 일치하지 않습니다';
    }
    
    if (!formData.roleArn.trim()) {
      errors.roleArn = 'AWS Role ARN을 입력해주세요';
    }
    
    if (!formData.companyName.trim()) {
      errors.companyName = '회사명을 입력해주세요';
    }
    
    return errors;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
    
    if (error) {
      clearError();
    }
    
    if (successMessage) {
      setSuccessMessage('');
    }
  };

  // 사용자 친화적인 오류 메시지 변환
  const getErrorMessage = (error) => {
    if (!error) return '';
    
    if (error.includes('USER_EXISTS') || error.includes('already exists')) {
      return '이미 존재하는 사용자명입니다. 다른 사용자명을 사용해주세요.';
    }
    
    if (error.includes('COGNITO_ERROR') || error.includes('Failed to create user in Cognito')) {
      return '계정 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
    }
    
    if (error.includes('DATABASE_ERROR') || error.includes('Failed to save user metadata')) {
      return '사용자 정보 저장 중 오류가 발생했습니다. 다시 시도해주세요.';
    }
    
    if (error.includes('INTERNAL_ERROR') || error.includes('Internal server error')) {
      return '서버에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.';
    }
    
    if (error.includes('Network Error') || error.includes('ECONNABORTED')) {
      return '네트워크 연결을 확인하고 다시 시도해주세요.';
    }
    
    return error || '회원가입 중 오류가 발생했습니다.';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    setFormErrors({});
    clearError();
    setSuccessMessage('');
    
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    
    try {
      const { confirmPassword, ...registrationData } = formData;
      const result = await register(registrationData);
      
      if (result.success) {
        setSuccessMessage('🎉 회원가입이 완료되었습니다! 관리자 승인 후 로그인이 가능합니다.');
        setFormData({
          username: '',
          password: '',
          confirmPassword: '',
          roleArn: '',
          companyName: ''
        });
        
        if (onSuccess) {
          setTimeout(() => onSuccess(result), 3000);
        }
      }
    } catch (err) {
      console.error('Registration error:', err);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="register-form">
      {successMessage && (
        <div className="success-message">
          {successMessage}
        </div>
      )}
      
      {error && (
        <div className="error-message">
          <div className="error-icon">⚠️</div>
          <div className="error-content">
            <div className="error-text">{getErrorMessage(error)}</div>
          </div>
        </div>
      )}
      
      <div className="form-group">
        <label htmlFor="username">사용자명</label>
        <input
          type="text"
          id="username"
          name="username"
          value={formData.username}
          onChange={handleInputChange}
          className={formErrors.username ? 'error' : ''}
          placeholder="사용자명을 입력하세요"
          disabled={loading}
          autoComplete="username"
        />
        {formErrors.username && (
          <span className="field-error">
            {formErrors.username}
          </span>
        )}
      </div>
      
      <div className="form-group">
        <label htmlFor="password">비밀번호</label>
        <div className="password-input-container">
          <input
            type={showPassword ? "text" : "password"}
            id="password"
            name="password"
            value={formData.password}
            onChange={handleInputChange}
            className={formErrors.password ? 'error' : ''}
            placeholder="비밀번호를 입력하세요 (최소 8자)"
            disabled={loading}
            autoComplete="new-password"
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowPassword(!showPassword)}
            disabled={loading}
            aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
          >
            {showPassword ? '🙈' : '👁️'}
          </button>
        </div>
        {formErrors.password && (
          <span className="field-error">
            {formErrors.password}
          </span>
        )}
      </div>
      
      <div className="form-group">
        <label htmlFor="confirmPassword">비밀번호 확인</label>
        <div className="password-input-container">
          <input
            type={showConfirmPassword ? "text" : "password"}
            id="confirmPassword"
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleInputChange}
            className={formErrors.confirmPassword ? 'error' : ''}
            placeholder="비밀번호를 다시 입력하세요"
            disabled={loading}
            autoComplete="new-password"
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            disabled={loading}
            aria-label={showConfirmPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
          >
            {showConfirmPassword ? '🙈' : '👁️'}
          </button>
        </div>
        {formErrors.confirmPassword && (
          <span className="field-error">
            {formErrors.confirmPassword}
          </span>
        )}
      </div>
      
      <div className="form-group">
        <label htmlFor="roleArn">AWS Role ARN</label>
        <input
          type="text"
          id="roleArn"
          name="roleArn"
          value={formData.roleArn}
          onChange={handleInputChange}
          className={formErrors.roleArn ? 'error' : ''}
          placeholder="arn:aws:iam::123456789012:role/YourRole"
          disabled={loading}
        />
        {formErrors.roleArn && (
          <span className="field-error">
            {formErrors.roleArn}
          </span>
        )}
      </div>
      
      <div className="form-group">
        <label htmlFor="companyName">회사명</label>
        <input
          type="text"
          id="companyName"
          name="companyName"
          value={formData.companyName}
          onChange={handleInputChange}
          className={formErrors.companyName ? 'error' : ''}
          placeholder="회사명을 입력하세요"
          disabled={loading}
        />
        {formErrors.companyName && (
          <span className="field-error">
            {formErrors.companyName}
          </span>
        )}
      </div>
      
      <button
        type="submit"
        className="register-button"
        disabled={loading}
      >
        {loading ? '가입 중...' : '회원가입'}
      </button>
      
      <p className="form-note">
        회원가입 후 관리자 승인을 기다려주세요.
      </p>
    </form>
  );
};

export default RegisterForm;