// Mock AWS SDK

// Mock AWS SDK
const mockPutCommand = jest.fn();
const mockGetCommand = jest.fn();
const mockQueryCommand = jest.fn();
const mockScanCommand = jest.fn();
const mockUpdateCommand = jest.fn();
const mockDeleteCommand = jest.fn();
const mockSend = jest.fn();

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  PutCommand: jest.fn().mockImplementation((params) => {
    mockPutCommand(params);
    return { params };
  }),
  GetCommand: jest.fn().mockImplementation((params) => {
    mockGetCommand(params);
    return { params };
  }),
  QueryCommand: jest.fn().mockImplementation((params) => {
    mockQueryCommand(params);
    return { params };
  }),
  ScanCommand: jest.fn().mockImplementation((params) => {
    mockScanCommand(params);
    return { params };
  }),
  UpdateCommand: jest.fn().mockImplementation((params) => {
    mockUpdateCommand(params);
    return { params };
  }),
  DeleteCommand: jest.fn().mockImplementation((params) => {
    mockDeleteCommand(params);
    return { params };
  }),
}));

jest.mock('../../config/aws', () => ({
  dynamoDBDocClient: {
    send: mockSend
  }
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-123')
}));

const historyService = require('../../services/historyService');

describe('HistoryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock Date.now() for consistent timestamps
    jest.spyOn(Date, 'now').mockReturnValue(1640995200000);
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2022-01-01T00:00:00.000Z');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('saveInspectionHistory', () => {
    it('should save inspection history successfully', async () => {
      // Arrange
      const inspectionData = {
        customerId: 'customer-123',
        serviceType: 'EC2',
        results: {
          summary: {
            totalResources: 10,
            highRiskIssues: 2,
            mediumRiskIssues: 3,
            lowRiskIssues: 1,
            overallScore: 75
          },
          findings: [
            {
              resourceId: 'sg-123',
              riskLevel: 'HIGH',
              issue: 'Open SSH port'
            }
          ]
        },
        assumeRoleArn: 'arn:aws:iam::123456789012:role/TestRole',
        metadata: {
          inspectorVersion: 'ec2-inspector-v1.0'
        }
      };

      mockSend.mockResolvedValue({});

      // Act
      const result = await historyService.saveInspectionHistory(inspectionData);

      // Assert
      expect(result.success).toBe(true);
      expect(result.inspectionId).toBe('test-uuid-123');
      expect(mockPutCommand).toHaveBeenCalledWith({
        TableName: 'InspectionHistory',
        Item: expect.objectContaining({
          customerId: 'customer-123',
          inspectionId: 'test-uuid-123',
          serviceType: 'EC2',
          status: 'COMPLETED',
          timestamp: 1640995200000,
          createdAt: '2022-01-01T00:00:00.000Z'
        }),
        ConditionExpression: 'attribute_not_exists(inspectionId)'
      });
    });

    it('should handle save errors', async () => {
      // Arrange
      const inspectionData = {
        customerId: 'customer-123',
        serviceType: 'EC2',
        results: {}
      };

      mockSend.mockRejectedValue(new Error('DynamoDB error'));

      // Act & Assert
      await expect(historyService.saveInspectionHistory(inspectionData))
        .rejects.toThrow('검사 이력 저장 실패: DynamoDB error');
    });
  });

  describe('getInspectionHistory', () => {
    it('should retrieve inspection history successfully', async () => {
      // Arrange
      const mockItem = {
        customerId: 'customer-123',
        inspectionId: 'inspection-123',
        serviceType: 'EC2',
        results: { summary: {} }
      };

      mockSend.mockResolvedValue({ Item: mockItem });

      // Act
      const result = await historyService.getInspectionHistory('customer-123', 'inspection-123');

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockItem);
      expect(mockGetCommand).toHaveBeenCalledWith({
        TableName: 'InspectionHistory',
        Key: {
          customerId: 'customer-123',
          inspectionId: 'inspection-123'
        }
      });
    });

    it('should handle not found case', async () => {
      // Arrange
      mockSend.mockResolvedValue({});

      // Act
      const result = await historyService.getInspectionHistory('customer-123', 'inspection-123');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('검사 이력을 찾을 수 없습니다');
    });
  });

  describe('getInspectionHistoryList', () => {
    it('should retrieve inspection history list successfully', async () => {
      // Arrange
      const mockItems = [
        {
          customerId: 'customer-123',
          inspectionId: 'inspection-1',
          timestamp: 1640995200000
        },
        {
          customerId: 'customer-123',
          inspectionId: 'inspection-2',
          timestamp: 1640995100000
        }
      ];

      mockSend.mockResolvedValue({
        Items: mockItems,
        Count: 2,
        LastEvaluatedKey: null
      });

      // Act
      const result = await historyService.getInspectionHistoryList('customer-123');

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.items).toEqual(mockItems);
      expect(result.data.count).toBe(2);
      expect(result.data.hasMore).toBe(false);
      expect(mockQueryCommand).toHaveBeenCalledWith({
        TableName: 'InspectionHistory',
        IndexName: 'TimestampIndex',
        KeyConditionExpression: 'customerId = :customerId',
        ExpressionAttributeValues: {
          ':customerId': 'customer-123'
        },
        ScanIndexForward: false,
        Limit: 50
      });
    });

    it('should handle pagination options', async () => {
      // Arrange
      const options = {
        limit: 10,
        lastEvaluatedKey: { customerId: 'customer-123', timestamp: 123456 },
        ascending: true
      };

      mockSend.mockResolvedValue({
        Items: [],
        Count: 0
      });

      // Act
      await historyService.getInspectionHistoryList('customer-123', options);

      // Assert
      expect(mockQueryCommand).toHaveBeenCalledWith({
        TableName: 'InspectionHistory',
        IndexName: 'TimestampIndex',
        KeyConditionExpression: 'customerId = :customerId',
        ExpressionAttributeValues: {
          ':customerId': 'customer-123'
        },
        ScanIndexForward: true,
        Limit: 10,
        ExclusiveStartKey: { customerId: 'customer-123', timestamp: 123456 }
      });
    });
  });

  describe('getInspectionHistoryByService', () => {
    it('should retrieve service-specific inspection history', async () => {
      // Arrange
      const mockItems = [
        {
          customerId: 'customer-123',
          inspectionId: 'inspection-1',
          serviceType: 'EC2'
        }
      ];

      mockSend.mockResolvedValue({
        Items: mockItems,
        Count: 1
      });

      // Act
      const result = await historyService.getInspectionHistoryByService('customer-123', 'EC2');

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.items).toEqual(mockItems);
      expect(mockQueryCommand).toHaveBeenCalledWith({
        TableName: 'InspectionHistory',
        IndexName: 'ServiceTypeIndex',
        KeyConditionExpression: 'customerId = :customerId AND serviceType = :serviceType',
        ExpressionAttributeValues: {
          ':customerId': 'customer-123',
          ':serviceType': 'EC2'
        },
        ScanIndexForward: false,
        Limit: 50
      });
    });
  });

  describe('filterInspectionHistory', () => {
    it('should filter inspection history with multiple criteria', async () => {
      // Arrange
      const filters = {
        serviceTypes: ['EC2', 'RDS'],
        statuses: ['COMPLETED'],
        startDate: 1640995000000,
        endDate: 1640995300000,
        riskLevels: ['HIGH']
      };

      const mockItems = [
        {
          customerId: 'customer-123',
          serviceType: 'EC2',
          status: 'COMPLETED',
          results: {
            findings: [
              { riskLevel: 'HIGH', issue: 'High risk issue' }
            ]
          }
        }
      ];

      mockSend.mockResolvedValue({
        Items: mockItems,
        Count: 1
      });

      // Act
      const result = await historyService.filterInspectionHistory('customer-123', filters);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.items).toHaveLength(1);
      expect(mockScanCommand).toHaveBeenCalledWith({
        TableName: 'InspectionHistory',
        FilterExpression: expect.stringContaining('customerId = :customerId'),
        ExpressionAttributeValues: expect.objectContaining({
          ':customerId': 'customer-123',
          ':serviceType0': 'EC2',
          ':serviceType1': 'RDS',
          ':status0': 'COMPLETED',
          ':startDate': 1640995000000,
          ':endDate': 1640995300000
        }),
        ExpressionAttributeNames: {
          '#status': 'status',
          '#timestamp': 'timestamp'
        }
      });
    });

    it('should filter by risk levels on client side', async () => {
      // Arrange
      const filters = {
        riskLevels: ['HIGH']
      };

      const mockItems = [
        {
          customerId: 'customer-123',
          results: {
            findings: [
              { riskLevel: 'HIGH', issue: 'High risk issue' }
            ]
          }
        },
        {
          customerId: 'customer-123',
          results: {
            findings: [
              { riskLevel: 'LOW', issue: 'Low risk issue' }
            ]
          }
        }
      ];

      mockSend.mockResolvedValue({
        Items: mockItems,
        Count: 2
      });

      // Act
      const result = await historyService.filterInspectionHistory('customer-123', filters);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0].results.findings[0].riskLevel).toBe('HIGH');
    });
  }); 
 describe('compareInspectionResults', () => {
    it('should compare two inspection results successfully', async () => {
      // Arrange
      const currentInspection = {
        customerId: 'customer-123',
        inspectionId: 'current-123',
        serviceType: 'EC2',
        createdAt: '2022-01-02T00:00:00.000Z',
        results: {
          summary: {
            totalResources: 15,
            highRiskIssues: 1,
            mediumRiskIssues: 3,
            lowRiskIssues: 2,
            overallScore: 80
          },
          findings: [
            {
              resourceId: 'sg-123',
              riskLevel: 'HIGH',
              issue: 'Open SSH port'
            },
            {
              resourceId: 'sg-456',
              riskLevel: 'MEDIUM',
              issue: 'Broad access rule'
            }
          ]
        }
      };

      const previousInspection = {
        customerId: 'customer-123',
        inspectionId: 'previous-123',
        serviceType: 'EC2',
        createdAt: '2022-01-01T00:00:00.000Z',
        results: {
          summary: {
            totalResources: 12,
            highRiskIssues: 2,
            mediumRiskIssues: 2,
            lowRiskIssues: 1,
            overallScore: 70
          },
          findings: [
            {
              resourceId: 'sg-123',
              riskLevel: 'HIGH',
              issue: 'Open SSH port'
            },
            {
              resourceId: 'sg-789',
              riskLevel: 'HIGH',
              issue: 'Open RDP port'
            }
          ]
        }
      };

      // Mock the getInspectionHistory calls
      mockSend
        .mockResolvedValueOnce({ Item: currentInspection }) // First call for current
        .mockResolvedValueOnce({ Item: previousInspection }); // Second call for previous

      // Act
      const result = await historyService.compareInspectionResults(
        'customer-123',
        'current-123',
        'previous-123'
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.current).toEqual(currentInspection);
      expect(result.data.previous).toEqual(previousInspection);
      expect(result.data.comparison.hasComparison).toBe(true);
      expect(result.data.comparison.summary.overallScore.change).toBe(10);
      expect(result.data.comparison.summary.highRiskIssues.change).toBe(-1);
      expect(result.data.comparison.overallTrend.trend).toBe('improved');
    });

    it('should auto-find previous inspection when not specified', async () => {
      // Arrange
      const currentInspection = {
        customerId: 'customer-123',
        inspectionId: 'current-123',
        serviceType: 'EC2',
        createdAt: '2022-01-02T00:00:00.000Z',
        results: { summary: { overallScore: 80 } }
      };

      const serviceHistoryItems = [
        currentInspection,
        {
          customerId: 'customer-123',
          inspectionId: 'previous-123',
          serviceType: 'EC2',
          createdAt: '2022-01-01T00:00:00.000Z',
          results: { summary: { overallScore: 70 } }
        }
      ];

      // Mock calls: current inspection, then service history
      mockSend
        .mockResolvedValueOnce({ Item: currentInspection })
        .mockResolvedValueOnce({
          Items: serviceHistoryItems,
          Count: 2
        });

      // Act
      const result = await historyService.compareInspectionResults(
        'customer-123',
        'current-123'
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.previous.inspectionId).toBe('previous-123');
    });

    it('should handle case with no previous inspection', async () => {
      // Arrange
      const currentInspection = {
        customerId: 'customer-123',
        inspectionId: 'current-123',
        serviceType: 'EC2',
        results: { summary: {} }
      };

      mockSend
        .mockResolvedValueOnce({ Item: currentInspection })
        .mockResolvedValueOnce({ Items: [currentInspection], Count: 1 });

      // Act
      const result = await historyService.compareInspectionResults(
        'customer-123',
        'current-123'
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.previous).toBeNull();
      expect(result.data.comparison.hasComparison).toBe(false);
    });

    it('should handle current inspection not found', async () => {
      // Arrange
      mockSend.mockResolvedValueOnce({});

      // Act & Assert
      await expect(historyService.compareInspectionResults('customer-123', 'invalid-id'))
        .rejects.toThrow('현재 검사 결과를 찾을 수 없습니다');
    });
  });

  describe('_performComparison', () => {
    it('should perform detailed comparison analysis', () => {
      // Arrange
      const current = {
        createdAt: '2022-01-02T00:00:00.000Z',
        results: {
          summary: {
            totalResources: 15,
            highRiskIssues: 1,
            mediumRiskIssues: 3,
            overallScore: 80
          },
          findings: [
            { resourceId: 'sg-123', issue: 'Open SSH', riskLevel: 'HIGH' },
            { resourceId: 'sg-456', issue: 'New issue', riskLevel: 'MEDIUM' }
          ]
        }
      };

      const previous = {
        createdAt: '2022-01-01T00:00:00.000Z',
        results: {
          summary: {
            totalResources: 12,
            highRiskIssues: 2,
            mediumRiskIssues: 2,
            overallScore: 70
          },
          findings: [
            { resourceId: 'sg-123', issue: 'Open SSH', riskLevel: 'HIGH' },
            { resourceId: 'sg-789', issue: 'Resolved issue', riskLevel: 'HIGH' }
          ]
        }
      };

      // Act
      const comparison = historyService._performComparison(current, previous);

      // Assert
      expect(comparison.hasComparison).toBe(true);
      expect(comparison.timePeriod.daysDifference).toBe(1);
      expect(comparison.summary.overallScore.change).toBe(10);
      expect(comparison.findings.new).toHaveLength(1);
      expect(comparison.findings.resolved).toHaveLength(1);
      expect(comparison.findings.persistent).toHaveLength(1);
      expect(comparison.overallTrend.trend).toBe('improved');
    });
  });

  describe('getInspectionStatistics', () => {
    it('should calculate inspection statistics correctly', async () => {
      // Arrange
      const mockInspections = [
        {
          serviceType: 'EC2',
          createdAt: '2022-01-01T00:00:00.000Z',
          results: {
            summary: {
              totalResources: 10,
              highRiskIssues: 2,
              mediumRiskIssues: 3,
              lowRiskIssues: 1,
              overallScore: 75
            }
          }
        },
        {
          serviceType: 'EC2',
          createdAt: '2022-01-02T00:00:00.000Z',
          results: {
            summary: {
              totalResources: 12,
              highRiskIssues: 1,
              mediumRiskIssues: 2,
              lowRiskIssues: 2,
              overallScore: 85
            }
          }
        },
        {
          serviceType: 'RDS',
          createdAt: '2022-01-03T00:00:00.000Z',
          results: {
            summary: {
              totalResources: 5,
              highRiskIssues: 0,
              mediumRiskIssues: 1,
              lowRiskIssues: 0,
              overallScore: 90
            }
          }
        }
      ];

      mockSend.mockResolvedValue({
        Items: mockInspections,
        Count: 3
      });

      // Act
      const result = await historyService.getInspectionStatistics('customer-123', { days: 30 });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.summary.totalInspections).toBe(3);
      expect(result.data.summary.servicesInspected).toBe(2);
      expect(result.data.serviceStats.EC2.count).toBe(2);
      expect(result.data.serviceStats.EC2.averageScore).toBe(80); // (75 + 85) / 2
      expect(result.data.serviceStats.RDS.count).toBe(1);
      expect(result.data.serviceStats.RDS.averageScore).toBe(90);
      expect(result.data.riskTrends).toHaveLength(3);
    });
  });

  describe('updateInspectionStatus', () => {
    it('should update inspection status successfully', async () => {
      // Arrange
      const updatedItem = {
        customerId: 'customer-123',
        inspectionId: 'inspection-123',
        status: 'COMPLETED',
        updatedAt: '2022-01-01T00:00:00.000Z'
      };

      mockSend.mockResolvedValue({ Attributes: updatedItem });

      // Act
      const result = await historyService.updateInspectionStatus(
        'customer-123',
        'inspection-123',
        'COMPLETED',
        { endTime: 1640995300000, duration: 300000 }
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toEqual(updatedItem);
      expect(mockUpdateCommand).toHaveBeenCalledWith({
        TableName: 'InspectionHistory',
        Key: {
          customerId: 'customer-123',
          inspectionId: 'inspection-123'
        },
        UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt, endTime = :endTime, duration = :duration',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': 'COMPLETED',
          ':updatedAt': '2022-01-01T00:00:00.000Z',
          ':endTime': 1640995300000,
          ':duration': 300000
        },
        ConditionExpression: 'attribute_exists(inspectionId)',
        ReturnValues: 'ALL_NEW'
      });
    });

    it('should handle inspection not found', async () => {
      // Arrange
      const error = new Error('ConditionalCheckFailedException');
      error.name = 'ConditionalCheckFailedException';
      mockSend.mockRejectedValue(error);

      // Act
      const result = await historyService.updateInspectionStatus(
        'customer-123',
        'invalid-id',
        'COMPLETED'
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('검사 이력을 찾을 수 없습니다');
    });
  });

  describe('deleteInspectionHistory', () => {
    it('should delete inspection history successfully', async () => {
      // Arrange
      mockSend.mockResolvedValue({});

      // Act
      const result = await historyService.deleteInspectionHistory('customer-123', 'inspection-123');

      // Assert
      expect(result.success).toBe(true);
      expect(result.message).toBe('검사 이력이 삭제되었습니다');
      expect(mockDeleteCommand).toHaveBeenCalledWith({
        TableName: 'InspectionHistory',
        Key: {
          customerId: 'customer-123',
          inspectionId: 'inspection-123'
        },
        ConditionExpression: 'attribute_exists(inspectionId)'
      });
    });

    it('should handle inspection not found for deletion', async () => {
      // Arrange
      const error = new Error('ConditionalCheckFailedException');
      error.name = 'ConditionalCheckFailedException';
      mockSend.mockRejectedValue(error);

      // Act
      const result = await historyService.deleteInspectionHistory('customer-123', 'invalid-id');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('검사 이력을 찾을 수 없습니다');
    });
  });

  describe('_compareFindingsDetails', () => {
    it('should categorize findings correctly', () => {
      // Arrange
      const currentFindings = [
        { resourceId: 'sg-123', issue: 'Open SSH', riskLevel: 'HIGH' },
        { resourceId: 'sg-456', issue: 'New issue', riskLevel: 'MEDIUM' },
        { resourceId: 'sg-789', issue: 'Persistent issue', riskLevel: 'LOW' }
      ];

      const previousFindings = [
        { resourceId: 'sg-123', issue: 'Open SSH', riskLevel: 'HIGH' },
        { resourceId: 'sg-789', issue: 'Persistent issue', riskLevel: 'LOW' },
        { resourceId: 'sg-999', issue: 'Resolved issue', riskLevel: 'MEDIUM' }
      ];

      // Act
      const result = historyService._compareFindingsDetails(currentFindings, previousFindings);

      // Assert
      expect(result.new).toHaveLength(1);
      expect(result.new[0].resourceId).toBe('sg-456');
      expect(result.resolved).toHaveLength(1);
      expect(result.resolved[0].resourceId).toBe('sg-999');
      expect(result.persistent).toHaveLength(2);
      expect(result.summary.newCount).toBe(1);
      expect(result.summary.resolvedCount).toBe(1);
      expect(result.summary.persistentCount).toBe(2);
    });
  });

  describe('_calculateOverallTrend', () => {
    it('should identify improved trend', () => {
      // Arrange
      const summaryComparison = {
        overallScore: { change: 10 },
        highRiskIssues: { change: -2 },
        mediumRiskIssues: { change: 0 },
        lowRiskIssues: { change: 1 }
      };

      // Act
      const result = historyService._calculateOverallTrend(summaryComparison);

      // Assert
      expect(result.trend).toBe('improved');
      expect(result.message).toBe('보안 상태가 개선되었습니다');
      expect(result.scoreChange).toBe(10);
    });

    it('should identify degraded trend', () => {
      // Arrange
      const summaryComparison = {
        overallScore: { change: -15 },
        highRiskIssues: { change: 3 },
        mediumRiskIssues: { change: 2 },
        lowRiskIssues: { change: 0 }
      };

      // Act
      const result = historyService._calculateOverallTrend(summaryComparison);

      // Assert
      expect(result.trend).toBe('degraded');
      expect(result.message).toBe('보안 상태가 악화되었습니다');
    });

    it('should identify stable trend', () => {
      // Arrange
      const summaryComparison = {
        overallScore: { change: 2 },
        highRiskIssues: { change: 0 },
        mediumRiskIssues: { change: 1 },
        lowRiskIssues: { change: -1 }
      };

      // Act
      const result = historyService._calculateOverallTrend(summaryComparison);

      // Assert
      expect(result.trend).toBe('stable');
      expect(result.message).toBe('보안 상태가 안정적으로 유지되고 있습니다');
    });
  });

  describe('_generateComparisonRecommendations', () => {
    it('should generate appropriate recommendations', () => {
      // Arrange
      const summaryComparison = {
        overallScore: { change: -15 }
      };

      const findingsComparison = {
        new: [
          { riskLevel: 'HIGH', issue: 'New high risk issue' },
          { riskLevel: 'MEDIUM', issue: 'New medium risk issue' }
        ],
        resolved: [
          { issue: 'Resolved issue' }
        ],
        persistent: [
          { current: { riskLevel: 'HIGH', issue: 'Persistent high risk' } }
        ]
      };

      // Act
      const result = historyService._generateComparisonRecommendations(
        summaryComparison,
        findingsComparison
      );

      // Assert
      expect(result).toHaveLength(4); // new high risk, persistent high risk, resolved, score degradation
      expect(result.find(r => r.category === 'new_issues')).toBeDefined();
      expect(result.find(r => r.category === 'persistent_issues')).toBeDefined();
      expect(result.find(r => r.category === 'resolved_issues')).toBeDefined();
      expect(result.find(r => r.category === 'score_degradation')).toBeDefined();
    });
  });
});