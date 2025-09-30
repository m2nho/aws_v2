import React from 'react';
import { useNavigate } from 'react-router-dom';
import { RegisterForm } from '../components';

const RegisterPage = () => {
  const navigate = useNavigate();

  const handleRegistrationSuccess = () => {
    // Redirect to login page after successful registration
    navigate('/login');
  };

  const handleCancel = () => {
    // Redirect to login page if user cancels
    navigate('/login');
  };

  return (
    <div className="register-page">
      <RegisterForm 
        onSuccess={handleRegistrationSuccess}
        onCancel={handleCancel}
      />
    </div>
  );
};

export default RegisterPage;