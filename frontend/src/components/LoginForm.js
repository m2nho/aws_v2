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
      
      if (result.success && onSuccess) {
        onSuccess(result);
      }
    } catch (err) {
      console.error('Login error:', err);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="login-form">
      {error && (
        <div className="error-message">
          {error}
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
        <input
          type="password"
          id="password"
          name="password"
          value={formData.password}
          onChange={handleInputChange}
          className={formErrors.password ? 'error' : ''}
          placeholder="비밀번호를 입력하세요"
          disabled={loading}
          autoComplete="current-password"
        />
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