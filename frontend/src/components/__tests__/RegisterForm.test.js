import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider } from '../../context';
import RegisterForm from '../RegisterForm';

// Mock the auth service
jest.mock('../../services', () => ({
  authService: {
    register: jest.fn(),
  }
}));

const MockedRegisterForm = ({ onSuccess, onCancel }) => (
  <AuthProvider>
    <RegisterForm onSuccess={onSuccess} onCancel={onCancel} />
  </AuthProvider>
);

describe('RegisterForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders form with required fields', () => {
    render(<MockedRegisterForm />);
    
    expect(screen.getByText('AWS 사용자 관리 시스템 회원가입')).toBeInTheDocument();
    expect(screen.getByLabelText('이메일 *')).toBeInTheDocument();
    expect(screen.getByLabelText('비밀번호 *')).toBeInTheDocument();
    expect(screen.getByLabelText('AWS Role ARN *')).toBeInTheDocument();
    expect(screen.getByLabelText('회사명 *')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '회원가입' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument();
  });

  test('validates required fields', async () => {
    render(<MockedRegisterForm />);
    
    const submitButton = screen.getByRole('button', { name: '회원가입' });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('이메일을 입력해주세요')).toBeInTheDocument();
      expect(screen.getByText('비밀번호를 입력해주세요')).toBeInTheDocument();
      expect(screen.getByText('AWS Role ARN을 입력해주세요')).toBeInTheDocument();
      expect(screen.getByText('회사명을 입력해주세요')).toBeInTheDocument();
    });
  });

  test('calls onCancel when cancel button is clicked', () => {
    const mockOnCancel = jest.fn();
    render(<MockedRegisterForm onCancel={mockOnCancel} />);
    
    const cancelButton = screen.getByRole('button', { name: '취소' });
    fireEvent.click(cancelButton);
    
    expect(mockOnCancel).toHaveBeenCalled();
  });
});