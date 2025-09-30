import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import UserList from '../UserList';
import { adminService } from '../../services';

// Mock the adminService
jest.mock('../../services', () => ({
  adminService: {
    getAllUsers: jest.fn(),
    updateUserStatus: jest.fn(),
    validateUserArn: jest.fn()
  }
}));

describe('UserList Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders loading state initially', () => {
    adminService.getAllUsers.mockImplementation(() => new Promise(() => {})); // Never resolves
    
    render(<UserList />);
    
    expect(screen.getByText('사용자 목록을 불러오는 중...')).toBeInTheDocument();
  });

  test('renders user list when data is loaded successfully', async () => {
    const mockUsers = [
      {
        userId: 'user-1',
        username: 'testuser1',
        companyName: 'Test Company 1',
        status: 'pending',
        roleArn: 'arn:aws:iam::123456789012:role/TestRole1',
        createdAt: '2024-01-01T00:00:00Z',
        arnValidation: {
          isValid: true,
          lastChecked: '2024-01-02T00:00:00Z'
        }
      },
      {
        userId: 'user-2',
        username: 'testuser2',
        companyName: 'Test Company 2',
        status: 'approved',
        roleArn: 'arn:aws:iam::123456789012:role/TestRole2',
        createdAt: '2024-01-01T00:00:00Z',
        arnValidation: null
      }
    ];

    adminService.getAllUsers.mockResolvedValue({
      success: true,
      data: mockUsers
    });

    render(<UserList />);

    await waitFor(() => {
      expect(screen.getByText('사용자 목록')).toBeInTheDocument();
    });

    // Check if users are displayed
    expect(screen.getByText('testuser1')).toBeInTheDocument();
    expect(screen.getByText('testuser2')).toBeInTheDocument();
    expect(screen.getByText('Test Company 1')).toBeInTheDocument();
    expect(screen.getByText('Test Company 2')).toBeInTheDocument();

    // Check status badges
    expect(screen.getByText('승인 대기')).toBeInTheDocument();
    expect(screen.getByText('활성')).toBeInTheDocument();

    // Check ARN validation badges
    expect(screen.getByText('유효함')).toBeInTheDocument();
    expect(screen.getByText('검증 대기')).toBeInTheDocument();

    // Check user count
    expect(screen.getByText('총 2명의 사용자')).toBeInTheDocument();
  });

  test('renders error state when API call fails', async () => {
    adminService.getAllUsers.mockRejectedValue(new Error('API Error'));

    render(<UserList />);

    await waitFor(() => {
      expect(screen.getByText('오류 발생')).toBeInTheDocument();
    });

    expect(screen.getByText('사용자 목록을 불러오는 중 오류가 발생했습니다.')).toBeInTheDocument();
    expect(screen.getByText('다시 시도')).toBeInTheDocument();
  });

  test('renders empty state when no users exist', async () => {
    adminService.getAllUsers.mockResolvedValue({
      success: true,
      data: []
    });

    render(<UserList />);

    await waitFor(() => {
      expect(screen.getByText('사용자 목록')).toBeInTheDocument();
    });

    expect(screen.getByText('등록된 사용자가 없습니다.')).toBeInTheDocument();
    expect(screen.getByText('총 0명의 사용자')).toBeInTheDocument();
  });

  test('handles API response with success: false', async () => {
    adminService.getAllUsers.mockResolvedValue({
      success: false,
      message: 'Unauthorized access'
    });

    render(<UserList />);

    await waitFor(() => {
      expect(screen.getByText('오류 발생')).toBeInTheDocument();
    });

    expect(screen.getByText('Unauthorized access')).toBeInTheDocument();
  });

  test('displays correct status badges for different user statuses', async () => {
    const mockUsers = [
      {
        userId: 'user-1',
        username: 'pending-user',
        companyName: 'Company 1',
        status: 'pending',
        roleArn: 'arn:aws:iam::123456789012:role/Role1',
        createdAt: '2024-01-01T00:00:00Z'
      },
      {
        userId: 'user-2',
        username: 'active-user',
        companyName: 'Company 2',
        status: 'active',
        roleArn: 'arn:aws:iam::123456789012:role/Role2',
        createdAt: '2024-01-01T00:00:00Z'
      },
      {
        userId: 'user-3',
        username: 'rejected-user',
        companyName: 'Company 3',
        status: 'rejected',
        roleArn: 'arn:aws:iam::123456789012:role/Role3',
        createdAt: '2024-01-01T00:00:00Z'
      }
    ];

    adminService.getAllUsers.mockResolvedValue({
      success: true,
      data: mockUsers
    });

    render(<UserList />);

    await waitFor(() => {
      expect(screen.getByText('사용자 목록')).toBeInTheDocument();
    });

    // Check all status types are displayed
    expect(screen.getByText('승인 대기')).toBeInTheDocument();
    expect(screen.getByText('활성')).toBeInTheDocument();
    expect(screen.getByText('거부됨')).toBeInTheDocument();
  });

  test('displays ARN validation information correctly', async () => {
    const mockUsers = [
      {
        userId: 'user-1',
        username: 'user-with-valid-arn',
        companyName: 'Company 1',
        status: 'approved',
        roleArn: 'arn:aws:iam::123456789012:role/ValidRole',
        createdAt: '2024-01-01T00:00:00Z',
        arnValidation: {
          isValid: true,
          lastChecked: '2024-01-02T12:00:00Z'
        }
      },
      {
        userId: 'user-2',
        username: 'user-with-invalid-arn',
        companyName: 'Company 2',
        status: 'approved',
        roleArn: 'arn:aws:iam::123456789012:role/InvalidRole',
        createdAt: '2024-01-01T00:00:00Z',
        arnValidation: {
          isValid: false,
          lastChecked: '2024-01-02T12:00:00Z',
          error: 'Role does not exist'
        }
      }
    ];

    adminService.getAllUsers.mockResolvedValue({
      success: true,
      data: mockUsers
    });

    render(<UserList />);

    await waitFor(() => {
      expect(screen.getByText('사용자 목록')).toBeInTheDocument();
    });

    // Check ARN validation statuses
    expect(screen.getByText('유효함')).toBeInTheDocument();
    expect(screen.getByText('무효함')).toBeInTheDocument();
  });

  test('displays action buttons for user management', async () => {
    const mockUsers = [
      {
        userId: 'user-1',
        username: 'pending-user',
        companyName: 'Company 1',
        status: 'pending',
        roleArn: 'arn:aws:iam::123456789012:role/Role1',
        createdAt: '2024-01-01T00:00:00Z'
      },
      {
        userId: 'user-2',
        username: 'approved-user',
        companyName: 'Company 2',
        status: 'approved',
        roleArn: 'arn:aws:iam::123456789012:role/Role2',
        createdAt: '2024-01-01T00:00:00Z'
      }
    ];

    adminService.getAllUsers.mockResolvedValue({
      success: true,
      data: mockUsers
    });

    render(<UserList />);

    await waitFor(() => {
      expect(screen.getByText('사용자 목록')).toBeInTheDocument();
    });

    // Check that action buttons are present
    expect(screen.getAllByText('ARN 검증')).toHaveLength(2);
    
    // For pending user, should have approve and reject buttons
    expect(screen.getByText('승인')).toBeInTheDocument();
    expect(screen.getAllByText('거부')).toHaveLength(2); // One for pending, one for approved user
  });
});