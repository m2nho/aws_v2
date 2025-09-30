import React from 'react';
import { render, screen } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';

// Mock the authService
jest.mock('../../services', () => ({
  authService: {
    verifyToken: jest.fn(),
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn()
  }
}));

// Test component that uses the auth context
const TestComponent = () => {
  const { isAuthenticated, loading } = useAuth();
  
  return (
    <div>
      <div data-testid="loading">{loading ? 'loading' : 'not-loading'}</div>
      <div data-testid="authenticated">{isAuthenticated ? 'authenticated' : 'not-authenticated'}</div>
    </div>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  test('provides initial state', () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId('authenticated').textContent).toBe('not-authenticated');
    expect(screen.getByTestId('loading').textContent).toBe('not-loading');
  });

  test('throws error when useAuth is used outside provider', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    expect(() => {
      render(<TestComponent />);
    }).toThrow('useAuth must be used within an AuthProvider');
    
    consoleSpy.mockRestore();
  });
});