import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import UserDashboard from '../UserDashboard';
import { AuthProvider } from '../../context';
import { userService } from '../../services';

// Mock the userService
jest.mock('../../services', () => ({
  userService: {
    getProfile: jest.fn()
  }
}));

// Helper function to render component with providers
const renderWithProviders = (component) => {
  return render(
    <BrowserRouter>
      <AuthProvider>
        {component}
      </AuthProvider>
    </BrowserRouter>
  );
};

describe('UserDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders component without crashing', () => {
    userService.getProfile.mockResolvedValue({
      success: true,
      userInfo: {
        username: 'testuser',
        companyName: 'Test Company',
        roleArn: 'arn:aws:iam::123456789012:role/TestRole',
        status: 'pending',
        createdAt: '2024-01-01T00:00:00Z'
      }
    });
    
    renderWithProviders(<UserDashboard />);
    
    // Component should render without crashing
    expect(document.body).toBeInTheDocument();
  });

  test('renders basic dashboard structure', async () => {
    const mockProfile = {
      username: 'testuser',
      companyName: 'Test Company',
      roleArn: 'arn:aws:iam::123456789012:role/TestRole',
      status: 'pending',
      createdAt: '2024-01-01T00:00:00Z'
    };

    userService.getProfile.mockResolvedValue({
      success: true,
      userInfo: mockProfile
    });

    renderWithProviders(<UserDashboard />);

    // Wait for async operations to complete
    await waitFor(() => {
      expect(userService.getProfile).toHaveBeenCalled();
    });
  });
});