import { useState } from 'react';
import { useAuth } from '../context';
import './LoginForm.css';

const LoginForm = ({ onSuccess }) => {
  const { login, loading, error, clearError } = useAuth();
  
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  
  const [formErrors, setFormErrors] = useState({});
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [showPassword, setShowPassword] = useState(false);

  const validateForm = () => {
    const errors = {};
    
    if (!formData.username.trim()) {
      errors.username = '사용자명을 입력해주세요';
    }
    
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
    
    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
    
    if (error) {
      clearError();
    }
  };

  // 사용자 친화적인 오류 메시지 변환
  const getErrorMessage = (error) => {
    if (!error) return '';
    
    // 백엔드 오류 코드에 따른 메시지 변환
    if (error.includes('AUTH_FAILED') || error.includes('Authentication failed') || error.includes('Invalid username or password')) {
      return '사용자명 또는 비밀번호가 올바르지 않습니다.';
    }
    
    if (error.includes('USER_NOT_FOUND') || error.includes('User not found')) {
      return '존재하지 않는 사용자입니다. 사용자명을 확인해주세요.';
    }
    
    if (error.includes('INTERNAL_ERROR') || error.includes('Internal server error')) {
      return '서버에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.';
    }
    
    if (error.includes('TOKEN_ERROR') || error.includes('Token generation failed')) {
      return '로그인 처리 중 오류가 발생했습니다. 다시 시도해주세요.';
    }
    
    if (error.includes('Network Error') || error.includes('ECONNABORTED')) {
      return '네트워크 연결을 확인하고 다시 시도해주세요.';
    }
    
    // 기본 오류 메시지
    return error || '로그인 중 오류가 발생했습니다.';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    setFormErrors({});
    clearError();
    
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    
    try {
      const result = await login(formData);
      
      if (result.success) {
        setLoginAttempts(0); // 성공 시 시도 횟수 초기화
        if (onSuccess) {
          onSuccess(result);
        }
      } else {
        setLoginAttempts(prev => prev + 1);
      }
    } catch (err) {
      console.error('Login error:', err);
      setLoginAttempts(prev => prev + 1);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="login-form">
      {error && (
        <div className={`error-message ${loginAttempts >= 3 ? 'error-critical' : ''}`}>
          <div className="error-icon">⚠️</div>
          <div className="error-content">
            <div className="error-text">{getErrorMessage(error)}</div>
            {loginAttempts >= 3 && (
              <div className="error-help">
                여러 번 실패했습니다. 사용자명과 비밀번호를 다시 확인해주세요.
              </div>
            )}
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
            placeholder="비밀번호를 입력하세요"
            disabled={loading}
            autoComplete="current-password"
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
      
      <button
        type="submit"
        className="login-button"
        disabled={loading}
      >
        {loading ? '로그인 중...' : '로그인'}
      </button>
    </form>
  );
};

export default LoginForm;