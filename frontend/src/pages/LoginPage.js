import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context';
import { LoginForm } from '../components';
import './LoginPage.css';

const LoginPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated, userStatus, isAdmin } = useAuth();

  const handleRedirectBasedOnStatus = useCallback((status) => {
    if (isAdmin()) {
      navigate('/admin');
    } else {
      navigate('/dashboard');
    }
  }, [isAdmin, navigate]);

  useEffect(() => {
    if (isAuthenticated) {
      handleRedirectBasedOnStatus(userStatus);
    }
  }, [isAuthenticated, userStatus, handleRedirectBasedOnStatus]);

  const handleLoginSuccess = (result) => {
    handleRedirectBasedOnStatus(result.userStatus);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1 className="login-title">로그인</h1>
          <p className="login-subtitle">AWS 사용자 관리 시스템</p>
        </div>
        
        <LoginForm onSuccess={handleLoginSuccess} />
        
        <div className="login-footer">
          <p className="signup-link">
            계정이 없으시나요? 
            <button 
              onClick={() => navigate('/register')}
              className="link-button"
            >
              회원가입
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;