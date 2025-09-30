import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuthProvider } from '../../context';
import LoginForm from '../LoginForm';

// Mock the auth service
jest.mock('../../services', () => ({
  authService: {
    login: jest.fn(),
    verifyToken: jest.fn(),
    logout: jest.fn()
  }
}));

const MockedLoginForm = (props) => (
  <AuthProvider>
    <LoginForm {...props} />
  </AuthProvider>
);

describe('LoginForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders form with required fields', () => {
    render(<MockedLoginForm />);
    
    expect(screen.getByText('AWS 사용자 관리 시스템 로그인')).toBeInTheDocument();
    expect(screen.getByLabelText('이메일 *')).toBeInTheDocument();
    expect(screen.getByLabelText('비밀번호 *')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument();
  });

  test('validates required fields', () => {
    render(<MockedLoginForm />);
    
    const submitButton = screen.getByRole('button', { name: '로그인' });
    fireEvent.click(submitButton);
    
    expect(screen.getByText('이메일을 입력해주세요')).toBeInTheDocument();
    expect(screen.getByText('비밀번호를 입력해주세요')).toBeInTheDocument();
  });

  test('calls onCancel when cancel button is clicked', () => {
    const mockOnCancel = jest.fn();
    render(<MockedLoginForm onCancel={mockOnCancel} />);
    
    const cancelButton = screen.getByRole('button', { name: '취소' });
    fireEvent.click(cancelButton);
    
    expect(mockOnCancel).toHaveBeenCalled();
  });
});