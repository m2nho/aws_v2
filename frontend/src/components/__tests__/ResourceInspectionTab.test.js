import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ResourceInspectionTab from '../ResourceInspectionTab';
import { inspectionService } from '../../services';

// Mock the inspection service
jest.mock('../../services', () => ({
  inspectionService: {
    getAvailableServices: jest.fn(),
    startInspection: jest.fn(),
    pollInspectionStatus: jest.fn(),
    cancelInspection: jest.fn()
  }
}));

// Test wrapper with router
const TestWrapper = ({ children }) => (
  <BrowserRouter>
    {children}
  </BrowserRouter>
);

describe('ResourceInspectionTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders inspection tab header', async () => {
    // Mock successful service loading with default services
    inspectionService.getAvailableServices.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'EC2',
          name: 'EC2 (Elastic Compute Cloud)',
          description: '보안 그룹, 인스턴스 설정, 키 페어 등을 검사합니다',
          icon: '🖥️',
          inspectionItems: ['보안 그룹 규칙 검사']
        }
      ]
    });

    render(
      <TestWrapper>
        <ResourceInspectionTab />
      </TestWrapper>
    );

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('AWS 리소스 검사')).toBeInTheDocument();
      expect(screen.getByText('AWS 계정의 리소스에 대한 보안 검사를 수행합니다')).toBeInTheDocument();
    });
  });

  test('displays loading state initially', () => {
    // Mock pending service loading
    inspectionService.getAvailableServices.mockImplementation(() => new Promise(() => {}));

    render(
      <TestWrapper>
        <ResourceInspectionTab />
      </TestWrapper>
    );

    expect(screen.getByText('사용 가능한 서비스를 불러오는 중...')).toBeInTheDocument();
    expect(screen.getByLabelText('서비스 목록 로딩 중')).toBeInTheDocument();
  });

  test('displays default services when API fails', async () => {
    // Mock API failure
    inspectionService.getAvailableServices.mockRejectedValue(new Error('API Error'));

    render(
      <TestWrapper>
        <ResourceInspectionTab />
      </TestWrapper>
    );

    // Wait for default services to load
    await waitFor(() => {
      expect(screen.getByText('EC2 (Elastic Compute Cloud)')).toBeInTheDocument();
      expect(screen.getByText('RDS (Relational Database Service)')).toBeInTheDocument();
      expect(screen.getByText('S3 (Simple Storage Service)')).toBeInTheDocument();
      expect(screen.getByText('IAM (Identity and Access Management)')).toBeInTheDocument();
    });
  });

  test('allows service selection', async () => {
    // Mock successful service loading with default services
    inspectionService.getAvailableServices.mockResolvedValue({
      success: false // This will trigger fallback to default services
    });

    render(
      <TestWrapper>
        <ResourceInspectionTab />
      </TestWrapper>
    );

    // Wait for services to load
    await waitFor(() => {
      expect(screen.getByText('EC2 (Elastic Compute Cloud)')).toBeInTheDocument();
    });

    // Click on EC2 service
    const ec2Card = screen.getByText('EC2 (Elastic Compute Cloud)').closest('.service-card');
    fireEvent.click(ec2Card);

    // Check if service is selected
    expect(ec2Card).toHaveClass('selected');
    
    // Check if form section appears
    expect(screen.getByText('검사 설정')).toBeInTheDocument();
    expect(screen.getByLabelText('Assume Role ARN *')).toBeInTheDocument();
  });

  test('validates form before starting inspection', async () => {
    // Mock service loading to use defaults
    inspectionService.getAvailableServices.mockResolvedValue({
      success: false
    });

    render(
      <TestWrapper>
        <ResourceInspectionTab />
      </TestWrapper>
    );

    // Wait for services to load
    await waitFor(() => {
      expect(screen.getByText('EC2 (Elastic Compute Cloud)')).toBeInTheDocument();
    });

    // Select service first to make the form appear
    const ec2Card = screen.getByText('EC2 (Elastic Compute Cloud)').closest('.service-card');
    fireEvent.click(ec2Card);

    // Wait for form to appear
    await waitFor(() => {
      expect(screen.getByText('검사 설정')).toBeInTheDocument();
    });

    // Now check the start button
    const startButton = screen.getByText('검사 시작');
    expect(startButton).toBeDisabled(); // Should be disabled without ARN

    // Enter invalid ARN
    const arnInput = screen.getByLabelText('Assume Role ARN *');
    fireEvent.change(arnInput, { target: { value: 'invalid-arn' } });

    // Button should be enabled but clicking should show error
    expect(startButton).not.toBeDisabled();
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(screen.getByText(/올바른 ARN 형식이 아닙니다/)).toBeInTheDocument();
    });
  });

  test('starts inspection with valid input', async () => {
    // Mock service loading to use defaults and inspection start
    inspectionService.getAvailableServices.mockResolvedValue({
      success: false
    });
    
    inspectionService.startInspection.mockResolvedValue({
      success: true,
      data: {
        inspectionId: 'test-inspection-id',
        status: 'PENDING'
      }
    });

    // Mock polling
    const mockPollingController = {
      stop: jest.fn()
    };
    inspectionService.pollInspectionStatus.mockReturnValue(mockPollingController);

    render(
      <TestWrapper>
        <ResourceInspectionTab />
      </TestWrapper>
    );

    // Wait for services to load
    await waitFor(() => {
      expect(screen.getByText('EC2 (Elastic Compute Cloud)')).toBeInTheDocument();
    });

    // Select service and enter valid ARN
    const ec2Card = screen.getByText('EC2 (Elastic Compute Cloud)').closest('.service-card');
    fireEvent.click(ec2Card);

    const arnInput = screen.getByLabelText('Assume Role ARN *');
    fireEvent.change(arnInput, { 
      target: { value: 'arn:aws:iam::123456789012:role/InspectionRole' } 
    });

    // Start inspection
    const startButton = screen.getByText('검사 시작');
    fireEvent.click(startButton);

    // Verify inspection service was called
    await waitFor(() => {
      expect(inspectionService.startInspection).toHaveBeenCalledWith({
        serviceType: 'EC2',
        assumeRoleArn: 'arn:aws:iam::123456789012:role/InspectionRole',
        inspectionConfig: {}
      });
    });

    // Verify polling started
    await waitFor(() => {
      expect(inspectionService.pollInspectionStatus).toHaveBeenCalledWith(
        'test-inspection-id',
        expect.any(Function),
        expect.any(Function),
        expect.any(Function)
      );
    });

    // Check if progress card appears
    await waitFor(() => {
      expect(screen.getByText('검사 진행 중')).toBeInTheDocument();
    });
  });

  test('handles inspection errors', async () => {
    // Mock service loading to use defaults but failed inspection start
    inspectionService.getAvailableServices.mockResolvedValue({
      success: false
    });
    
    inspectionService.startInspection.mockRejectedValue(new Error('Inspection failed'));

    render(
      <TestWrapper>
        <ResourceInspectionTab />
      </TestWrapper>
    );

    // Wait for services to load and select service
    await waitFor(() => {
      expect(screen.getByText('EC2 (Elastic Compute Cloud)')).toBeInTheDocument();
    });

    const ec2Card = screen.getByText('EC2 (Elastic Compute Cloud)').closest('.service-card');
    fireEvent.click(ec2Card);

    const arnInput = screen.getByLabelText('Assume Role ARN *');
    fireEvent.change(arnInput, { 
      target: { value: 'arn:aws:iam::123456789012:role/InspectionRole' } 
    });

    // Start inspection
    const startButton = screen.getByText('검사 시작');
    fireEvent.click(startButton);

    // Check for error message
    await waitFor(() => {
      expect(screen.getByText('Inspection failed')).toBeInTheDocument();
    });
  });

  test('allows form reset', async () => {
    // Mock service loading to use defaults
    inspectionService.getAvailableServices.mockResolvedValue({
      success: false
    });

    render(
      <TestWrapper>
        <ResourceInspectionTab />
      </TestWrapper>
    );

    // Wait for services to load and select service
    await waitFor(() => {
      expect(screen.getByText('EC2 (Elastic Compute Cloud)')).toBeInTheDocument();
    });

    const ec2Card = screen.getByText('EC2 (Elastic Compute Cloud)').closest('.service-card');
    fireEvent.click(ec2Card);

    const arnInput = screen.getByLabelText('Assume Role ARN *');
    fireEvent.change(arnInput, { 
      target: { value: 'arn:aws:iam::123456789012:role/InspectionRole' } 
    });

    // Reset form
    const resetButton = screen.getByText('초기화');
    fireEvent.click(resetButton);

    // Check if form is reset
    await waitFor(() => {
      expect(ec2Card).not.toHaveClass('selected');
    });
    
    // The form section should disappear after reset
    expect(screen.queryByText('검사 설정')).not.toBeInTheDocument();
  });
});