import { useNavigate } from 'react-router-dom';
import { RegisterForm } from '../components';
import './RegisterPage.css';

const RegisterPage = () => {
  const navigate = useNavigate();

  const handleRegistrationSuccess = () => {
    navigate('/login');
  };

  return (
    <div className="register-page">
      <div className="register-card">
        <div className="register-header">
          <h1 className="register-title">회원가입</h1>
          <p className="register-subtitle">AWS 사용자 관리 시스템</p>
        </div>
        
        <RegisterForm onSuccess={handleRegistrationSuccess} />
        
        <div className="register-footer">
          <p className="login-link">
            이미 계정이 있으시나요? 
            <button 
              onClick={() => navigate('/login')}
              className="link-button"
            >
              로그인
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;