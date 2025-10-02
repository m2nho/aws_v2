import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import InspectionDashboard from '../InspectionDashboard';
import { inspectionService } from '../../services';

// Mock the inspection service
jest.mock('../../services', () => ({
  inspectionService: {
    getInspectionDetails: jest.fn()
  }
}));

// Mock CSS import
jest.mock('../InspectionDashboard.css', () => ({}));

describe('InspectionDashboard', () => {
  const mockInspectionData = {
    inspectionId: 'test-inspection-123',
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
        overallScore: 75
      },
      findings: [
        {
          resourceId: 'sg-123456',
          resourceType: 'SecurityGroup',
          riskLevel: 'HIGH',
          issue: 'Security group allows unrestricted access (0.0.0.0/0) on port 22',
          recommendation: 'Restrict SSH access to specific IP ranges',
          category: 'SECURITY',
          details: {
            groupId: 'sg-123456',
            groupName: 'default',
            rules: []
          }
        },
        {
          resourceId: 'i-789012',
          resourceType: 'EC2Instance',
          riskLevel: 'MEDIUM',
          issue: 'Instance is not using latest AMI',
          recommendation: 'Update to latest AMI version',
          category: 'SECURITY',
          details: {
            instanceId: 'i-789012',
            instanceType: 't2.micro'
          }
        },
        {
          resourceId: 'sg-345678',
          resourceType: 'SecurityGroup',
          riskLevel: 'LOW',
          issue: 'Security group has unused rules',
          recommendation: 'Remove unused security group rules',
          category: 'COST',
          details: {
            groupId: 'sg-345678'
          }
        }
      ]
    }
  };

  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Loading State', () => {
    it('should show loading spinner while fetching data', () => {
      inspectionService.getInspectionDetails.mockImplementation(() => 
        new Promise(() => {}) // Never resolves
      );

      render(<InspectionDashboard inspectionId="test-123" onClose={mockOnClose} />);

      expect(screen.getByText('검사 결과를 불러오는 중...')).toBeInTheDocument();
      expect(screen.getByLabelText('검사 결과 로딩 중')).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('should show error message when inspection ID is not provided', async () => {
      render(<InspectionDashboard inspectionId={null} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('검사 ID가 제공되지 않았습니다.')).toBeInTheDocument();
      });
    });

    it('should show error message when API call fails', async () => {
      const errorMessage = 'Network error';
      inspectionService.getInspectionDetails.mockRejectedValue(new Error(errorMessage));

      render(<InspectionDashboard inspectionId="test-123" onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });

    it('should show error message when API returns error response', async () => {
      inspectionService.getInspectionDetails.mockResolvedValue({
        success: false,
        error: { message: 'Inspection not found' }
      });

      render(<InspectionDashboard inspectionId="test-123" onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Inspection not found')).toBeInTheDocument();
      });
    });

    it('should call onClose when close button is clicked in error state', async () => {
      inspectionService.getInspectionDetails.mockRejectedValue(new Error('Test error'));

      render(<InspectionDashboard inspectionId="test-123" onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Test error')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('닫기'));
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Successful Data Display', () => {
    beforeEach(() => {
      inspectionService.getInspectionDetails.mockResolvedValue({
        success: true,
        data: mockInspectionData
      });
    });

    it('should display inspection dashboard with correct data', async () => {
      render(<InspectionDashboard inspectionId="test-123" onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('검사 결과 대시보드')).toBeInTheDocument();
        expect(screen.getByText('EC2 검사')).toBeInTheDocument();
      });

      // Check summary cards
      expect(screen.getByText('25')).toBeInTheDocument(); // Total resources
      expect(screen.getByText('3')).toBeInTheDocument(); // High risk issues
      expect(screen.getByText('7')).toBeInTheDocument(); // Medium risk issues
      expect(screen.getByText('2')).toBeInTheDocument(); // Low risk issues
      expect(screen.getByText('75')).toBeInTheDocument(); // Overall score
    });

    it('should display findings list with correct information', async () => {
      render(<InspectionDashboard inspectionId="test-123" onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Security group allows unrestricted access (0.0.0.0/0) on port 22')).toBeInTheDocument();
        expect(screen.getByText('Instance is not using latest AMI')).toBeInTheDocument();
        expect(screen.getByText('Security group has unused rules')).toBeInTheDocument();
      });

      // Check resource types and IDs
      expect(screen.getByText('sg-123456')).toBeInTheDocument();
      expect(screen.getByText('i-789012')).toBeInTheDocument();
      expect(screen.getByText('sg-345678')).toBeInTheDocument();
    });

    it('should expand finding details when clicked', async () => {
      render(<InspectionDashboard inspectionId="test-123" onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Security group allows unrestricted access (0.0.0.0/0) on port 22')).toBeInTheDocument();
      });

      // Click on the first finding to expand it
      const firstFinding = screen.getByText('Security group allows unrestricted access (0.0.0.0/0) on port 22').closest('.finding-header');
      fireEvent.click(firstFinding);

      // Check if recommendation is shown
      expect(screen.getByText('Restrict SSH access to specific IP ranges')).toBeInTheDocument();
    });

    it('should filter findings by risk level', async () => {
      render(<InspectionDashboard inspectionId="test-123" onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('3개 항목 표시 중')).toBeInTheDocument();
      });

      // Filter by HIGH risk
      const riskFilter = screen.getByLabelText('위험도');
      fireEvent.change(riskFilter, { target: { value: 'HIGH' } });

      expect(screen.getByText('1개 항목 표시 중')).toBeInTheDocument();
      expect(screen.getByText('Security group allows unrestricted access (0.0.0.0/0) on port 22')).toBeInTheDocument();
      expect(screen.queryByText('Instance is not using latest AMI')).not.toBeInTheDocument();
    });

    it('should filter findings by category', async () => {
      render(<InspectionDashboard inspectionId="test-123" onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('3개 항목 표시 중')).toBeInTheDocument();
      });

      // Filter by COST category
      const categoryFilter = screen.getByLabelText('카테고리');
      fireEvent.change(categoryFilter, { target: { value: 'COST' } });

      expect(screen.getByText('1개 항목 표시 중')).toBeInTheDocument();
      expect(screen.getByText('Security group has unused rules')).toBeInTheDocument();
      expect(screen.queryByText('Security group allows unrestricted access (0.0.0.0/0) on port 22')).not.toBeInTheDocument();
    });

    it('should display recommendations section for high-risk findings', async () => {
      render(<InspectionDashboard inspectionId="test-123" onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('주요 권장사항')).toBeInTheDocument();
        expect(screen.getByText('Restrict SSH access to specific IP ranges')).toBeInTheDocument();
      });
    });

    it('should call onClose when close button is clicked', async () => {
      render(<InspectionDashboard inspectionId="test-123" onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('검사 결과 대시보드')).toBeInTheDocument();
      });

      const closeButton = screen.getByLabelText('대시보드 닫기');
      fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Empty Findings State', () => {
    it('should show no findings message when no findings match filters', async () => {
      const dataWithNoFindings = {
        ...mockInspectionData,
        results: {
          ...mockInspectionData.results,
          findings: []
        }
      };

      inspectionService.getInspectionDetails.mockResolvedValue({
        success: true,
        data: dataWithNoFindings
      });

      render(<InspectionDashboard inspectionId="test-123" onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('해당 조건의 문제가 발견되지 않았습니다')).toBeInTheDocument();
        expect(screen.getByText('선택한 필터 조건에 맞는 검사 결과가 없습니다.')).toBeInTheDocument();
      });
    });
  });

  describe('Risk Level Visualization', () => {
    beforeEach(() => {
      inspectionService.getInspectionDetails.mockResolvedValue({
        success: true,
        data: mockInspectionData
      });
    });

    it('should display risk level distribution chart', async () => {
      render(<InspectionDashboard inspectionId="test-123" onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('위험도별 분포')).toBeInTheDocument();
        expect(screen.getByText('HIGH')).toBeInTheDocument();
        expect(screen.getByText('MEDIUM')).toBeInTheDocument();
        expect(screen.getByText('LOW')).toBeInTheDocument();
      });

      // Check percentages
      expect(screen.getByText('1개 (33.3%)')).toBeInTheDocument(); // HIGH: 1 out of 3
      expect(screen.getByText('1개 (33.3%)')).toBeInTheDocument(); // MEDIUM: 1 out of 3
      expect(screen.getByText('1개 (33.3%)')).toBeInTheDocument(); // LOW: 1 out of 3
    });
  });

  describe('Accessibility', () => {
    beforeEach(() => {
      inspectionService.getInspectionDetails.mockResolvedValue({
        success: true,
        data: mockInspectionData
      });
    });

    it('should have proper ARIA labels and roles', async () => {
      render(<InspectionDashboard inspectionId="test-123" onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByLabelText('대시보드 닫기')).toBeInTheDocument();
        expect(screen.getByLabelText('위험도')).toBeInTheDocument();
        expect(screen.getByLabelText('카테고리')).toBeInTheDocument();
      });
    });

    it('should support keyboard navigation for expand buttons', async () => {
      render(<InspectionDashboard inspectionId="test-123" onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Security group allows unrestricted access (0.0.0.0/0) on port 22')).toBeInTheDocument();
      });

      const expandButtons = screen.getAllByLabelText(/접기|펼치기/);
      expect(expandButtons.length).toBeGreaterThan(0);
      
      // Focus should be manageable
      expandButtons[0].focus();
      expect(document.activeElement).toBe(expandButtons[0]);
    });
  });
});