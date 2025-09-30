import React, { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context';
import { LoginForm } from '../components';

const LoginPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated, userStatus, isAdmin } = useAuth();

  const handleRedirectBasedOnStatus = useCallback((status) => {
    if (isAdmin()) {
      // Admin users go to admin panel
      navigate('/admin');
    } else {
      // Regular users go to dashboard regardless of status
      // The dashboard will show appropriate messages based on status
      navigate('/dashboard');
    }
  }, [isAdmin, navigate]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      handleRedirectBasedOnStatus(userStatus);
    }
  }, [isAuthenticated, userStatus, handleRedirectBasedOnStatus]);

  const handleLoginSuccess = (result) => {
    // Redirect based on user status after successful login
    handleRedirectBasedOnStatus(result.userStatus);
  };

  const handleCancel = () => {
    // Redirect to register page if user cancels
    navigate('/register');
  };

  return (
    <div className="login-page">
      <LoginForm 
        onSuccess={handleLoginSuccess}
        onCancel={handleCancel}
      />
      
      <div style={{ textAlign: 'center', marginTop: '1rem' }}>
        <p>
          계정이 없으시나요?{' '}
          <button 
            onClick={() => navigate('/register')}
            style={{
              background: 'none',
              border: 'none',
              color: '#007bff',
              textDecoration: 'underline',
              cursor: 'pointer'
            }}
          >
            회원가입
          </button>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;