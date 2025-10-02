import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import InspectionHistory from '../InspectionHistory';
import { inspectionService } from '../../services/inspectionService';

// Mock the inspection service
jest.mock('../../services/inspectionService', () => ({
  inspectionService: {
    getInspectionHistory: jest.fn(),
    getInspectionDetails: jest.fn()
  }
}));

const mockInspections = [
  {
    inspectionId: 'inspection-1',
    serviceType: 'EC2',
    status: 'COMPLETED',
    startTime: 1640995200000,
    endTime: 1640995800000,
    duration: 600000,
    results: {
      summary: {
        totalResources: 25,
        highRiskIssues: 3,
        mediumRiskIssues: 7,
        lowRiskIssues: 2,
        score: 75
      },
      findings: [
        {
          resourceId: 'sg-123456',
          resourceType: 'SecurityGroup',
          riskLevel: 'HIGH',
          issue: 'Security group allows unrestricted access',
          recommendation: 'Restrict SSH access to specific IP ranges'
        }
      ]
    }
  },
  {
    inspectionId: 'inspection-2',
    serviceType: 'EC2',
    status: 'IN_PROGRESS',
    startTime: 1641081600000
  },
  {
    inspectionId: 'inspection-3',
    serviceType: 'EC2',
    status: 'FAILED',
    startTime: 1641168000000
  }
];

const mockInspectionDetails = {
  inspectionId: 'inspection-1',
  serviceType: 'EC2',
  status: 'COMPLETED',
  startTime: 1640995200000,
  endTime: 1640995800000,
  duration: 600000,
  results: {
    summary: {
      totalResources: 25,
      highRiskIssues: 3,
      mediumRiskIssues: 7,
      lowRiskIssues: 2,
      score: 75
    },
    findings: [
      {
        resourceId: 'sg-123456',
        resourceType: 'SecurityGroup',
        riskLevel: 'HIGH',
        issue: 'Security group allows unrestricted access (0.0.0.0/0) on port 22',
        recommendation: 'Restrict SSH access to specific IP ranges'
      }
    ]
  }
};

describe('InspectionHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders loading state initially', () => {
    inspectionService.getInspectionHistory.mockImplementation(() => new Promise(() => {}));
    
    render(<InspectionHistory customerId="customer-123" />);
    
    expect(screen.getByText('검사 이력을 불러오는 중...')).toBeInTheDocument();
  });

  test('renders inspection history successfully', async () => {
    inspectionService.getInspectionHistory.mockResolvedValue({
      data: mockInspections
    });

    render(<InspectionHistory customerId="customer-123" />);

    await waitFor(() => {
      expect(screen.getByText('검사 이력')).toBeInTheDocument();
    });

    expect(screen.getByText('EC2 검사')).toBeInTheDocument();
    expect(screen.getByText('완료')).toBeInTheDocument();
    expect(screen.getByText('진행중')).toBeInTheDocument();
    expect(screen.getByText('실패')).toBeInTheDocument();
  });

  test('renders error state when loading fails', async () => {
    inspectionService.getInspectionHistory.mockRejectedValue(new Error('Network error'));

    render(<InspectionHistory customerId="customer-123" />);

    await waitFor(() => {
      expect(screen.getByText('검사 이력을 불러오는데 실패했습니다.')).toBeInTheDocument();
    });

    expect(screen.getByText('다시 시도')).toBeInTheDocument();
  });

  test('renders empty state when no inspections exist', async () => {
    inspectionService.getInspectionHistory.mockResolvedValue({
      data: []
    });

    render(<InspectionHistory customerId="customer-123" />);

    await waitFor(() => {
      expect(screen.getByText('검사 이력이 없습니다.')).toBeInTheDocument();
    });
  });

  test('displays inspection summary for completed inspections', async () => {
    inspectionService.getInspectionHistory.mockResolvedValue({
      data: mockInspections
    });

    render(<InspectionHistory customerId="customer-123" />);

    await waitFor(() => {
      expect(screen.getByText('총 리소스:')).toBeInTheDocument();
      expect(screen.getByText('25')).toBeInTheDocument();
      expect(screen.getByText('고위험:')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('점수:')).toBeInTheDocument();
      expect(screen.getByText('75/100')).toBeInTheDocument();
    });
  });

  test('opens inspection detail modal when clicking on completed inspection', async () => {
    inspectionService.getInspectionHistory.mockResolvedValue({
      data: mockInspections
    });
    inspectionService.getInspectionDetails.mockResolvedValue({
      data: mockInspectionDetails
    });

    render(<InspectionHistory customerId="customer-123" />);

    await waitFor(() => {
      expect(screen.getByText('EC2 검사')).toBeInTheDocument();
    });

    // Click on the first inspection item
    const inspectionItems = screen.getAllByText('EC2 검사');
    fireEvent.click(inspectionItems[0].closest('.inspection-item'));

    await waitFor(() => {
      expect(screen.getByText('EC2 검사 상세 결과')).toBeInTheDocument();
    });

    expect(screen.getByText('검사 요약')).toBeInTheDocument();
    expect(screen.getByText('발견된 이슈')).toBeInTheDocument();
  });

  test('enables compare mode when compare button is clicked', async () => {
    inspectionService.getInspectionHistory.mockResolvedValue({
      data: mockInspections
    });

    render(<InspectionHistory customerId="customer-123" />);

    await waitFor(() => {
      expect(screen.getByText('검사 비교')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('검사 비교'));

    expect(screen.getByText('비교 모드 종료')).toBeInTheDocument();
  });

  test('allows selecting inspections for comparison', async () => {
    inspectionService.getInspectionHistory.mockResolvedValue({
      data: mockInspections.slice(0, 2) // Only completed and in-progress inspections
    });

    render(<InspectionHistory customerId="customer-123" />);

    await waitFor(() => {
      expect(screen.getByText('검사 비교')).toBeInTheDocument();
    });

    // Enable compare mode
    fireEvent.click(screen.getByText('검사 비교'));

    // Select first inspection
    const inspectionItems = document.querySelectorAll('.inspection-item');
    fireEvent.click(inspectionItems[0]);

    expect(inspectionItems[0]).toHaveClass('selected-for-comparison');
  });

  test('shows compare execution button when two inspections are selected', async () => {
    const completedInspections = [
      { ...mockInspections[0], inspectionId: 'inspection-1' },
      { ...mockInspections[0], inspectionId: 'inspection-2', startTime: 1641081600000 }
    ];

    inspectionService.getInspectionHistory.mockResolvedValue({
      data: completedInspections
    });

    render(<InspectionHistory customerId="customer-123" />);

    await waitFor(() => {
      expect(screen.getByText('검사 비교')).toBeInTheDocument();
    });

    // Enable compare mode
    fireEvent.click(screen.getByText('검사 비교'));

    // Select two inspections
    const inspectionItems = document.querySelectorAll('.inspection-item');
    fireEvent.click(inspectionItems[0]);
    fireEvent.click(inspectionItems[1]);

    expect(screen.getByText('비교 실행')).toBeInTheDocument();
  });

  test('opens comparison modal when compare is executed', async () => {
    const completedInspections = [
      { ...mockInspections[0], inspectionId: 'inspection-1' },
      { ...mockInspections[0], inspectionId: 'inspection-2', startTime: 1641081600000 }
    ];

    inspectionService.getInspectionHistory.mockResolvedValue({
      data: completedInspections
    });
    inspectionService.getInspectionDetails
      .mockResolvedValueOnce({ data: { ...mockInspectionDetails, inspectionId: 'inspection-1' } })
      .mockResolvedValueOnce({ data: { ...mockInspectionDetails, inspectionId: 'inspection-2', startTime: 1641081600000 } });

    render(<InspectionHistory customerId="customer-123" />);

    await waitFor(() => {
      expect(screen.getByText('검사 비교')).toBeInTheDocument();
    });

    // Enable compare mode
    fireEvent.click(screen.getByText('검사 비교'));

    // Select two inspections
    const inspectionItems = document.querySelectorAll('.inspection-item');
    fireEvent.click(inspectionItems[0]);
    fireEvent.click(inspectionItems[1]);

    // Execute comparison
    fireEvent.click(screen.getByText('비교 실행'));

    await waitFor(() => {
      expect(screen.getByText('검사 결과 비교')).toBeInTheDocument();
    });

    expect(screen.getByText('이전 검사')).toBeInTheDocument();
    expect(screen.getByText('최근 검사')).toBeInTheDocument();
    expect(screen.getByText('변경 사항')).toBeInTheDocument();
  });

  test('closes modal when close button is clicked', async () => {
    inspectionService.getInspectionHistory.mockResolvedValue({
      data: mockInspections
    });
    inspectionService.getInspectionDetails.mockResolvedValue({
      data: mockInspectionDetails
    });

    render(<InspectionHistory customerId="customer-123" />);

    await waitFor(() => {
      expect(screen.getByText('EC2 검사')).toBeInTheDocument();
    });

    // Open modal
    const inspectionItems = screen.getAllByText('EC2 검사');
    fireEvent.click(inspectionItems[0].closest('.inspection-item'));

    await waitFor(() => {
      expect(screen.getByText('EC2 검사 상세 결과')).toBeInTheDocument();
    });

    // Close modal
    fireEvent.click(screen.getByText('×'));

    await waitFor(() => {
      expect(screen.queryByText('EC2 검사 상세 결과')).not.toBeInTheDocument();
    });
  });

  test('retries loading when retry button is clicked', async () => {
    inspectionService.getInspectionHistory
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ data: mockInspections });

    render(<InspectionHistory customerId="customer-123" />);

    await waitFor(() => {
      expect(screen.getByText('검사 이력을 불러오는데 실패했습니다.')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('다시 시도'));

    await waitFor(() => {
      expect(screen.getByText('검사 이력')).toBeInTheDocument();
    });

    expect(inspectionService.getInspectionHistory).toHaveBeenCalledTimes(2);
  });

  test('formats dates correctly', async () => {
    inspectionService.getInspectionHistory.mockResolvedValue({
      data: mockInspections
    });

    render(<InspectionHistory customerId="customer-123" />);

    await waitFor(() => {
      // Check if date is formatted in Korean locale
      expect(screen.getByText(/2022/)).toBeInTheDocument();
    });
  });

  test('displays correct status badges', async () => {
    inspectionService.getInspectionHistory.mockResolvedValue({
      data: mockInspections
    });

    render(<InspectionHistory customerId="customer-123" />);

    await waitFor(() => {
      expect(screen.getByText('완료')).toHaveClass('status-completed');
      expect(screen.getByText('진행중')).toHaveClass('status-in-progress');
      expect(screen.getByText('실패')).toHaveClass('status-failed');
    });
  });
});