const {
  PutCommand,
  GetCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');
// .env 파일 로드 확인
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { dynamoDBDocClient } = require('../config/aws');

/**
 * History Service
 * DynamoDB를 사용한 검사 이력 관리 서비스
 * 
 * 주요 기능:
 * - 검사 이력 저장 및 조회
 * - 검사 결과 필터링
 * - 검사 결과 비교 분석
 */
class HistoryService {
  constructor() {
    this.client = dynamoDBDocClient;
    this.tableName = process.env.AWS_DYNAMODB_INSPECTION_HISTORY_TABLE || 'InspectionHistory';
  }

  /**
   * 검사 이력 저장
   * Requirements: 3.1 - WHEN 검사가 완료 THEN 시스템은 검사 결과를 DynamoDB에 저장해야 합니다
   * 
   * @param {Object} inspectionData - 검사 데이터
   * @param {string} inspectionData.customerId - 고객 ID
   * @param {string} inspectionData.inspectionId - 검사 ID (기존에 생성된 ID 사용)
   * @param {string} inspectionData.serviceType - 서비스 타입 (EC2, RDS, S3 등)
   * @param {Object} inspectionData.results - 검사 결과
   * @param {string} inspectionData.assumeRoleArn - Assume Role ARN
   * @param {Object} inspectionData.metadata - 메타데이터
   * @returns {Promise<Object>} 저장 결과
   */
  async saveInspectionHistory(inspectionData) {
    try {
      // 전달받은 inspectionId 사용 (새로 생성하지 않음)
      const inspectionId = inspectionData.inspectionId;
      if (!inspectionId) {
        throw new Error('inspectionId is required');
      }
      
      console.log('🔍 [HistoryService] Saving inspection with ID:', inspectionId);
      console.log('🔍 [HistoryService] Full inspection data:', JSON.stringify(inspectionData, null, 2));
      
      const timestamp = Date.now();
      const isoTimestamp = new Date().toISOString();

      const historyRecord = {
        customerId: inspectionData.customerId,
        inspectionId,
        serviceType: inspectionData.serviceType,
        status: 'COMPLETED',
        startTime: inspectionData.startTime || timestamp,
        endTime: inspectionData.endTime || timestamp,
        duration: inspectionData.duration || 0,
        timestamp, // Unix timestamp for sorting
        createdAt: isoTimestamp,
        results: {
          summary: inspectionData.results.summary || {},
          findings: inspectionData.results.findings || [],
          recommendations: inspectionData.results.recommendations || []
        },
        assumeRoleArn: inspectionData.assumeRoleArn,
        metadata: {
          version: '1.0',
          inspectorVersion: inspectionData.metadata?.inspectorVersion || 'unknown',
          ...inspectionData.metadata
        }
      };

      const params = {
        TableName: this.tableName,
        Item: historyRecord
        // ConditionExpression 제거하여 기존 레코드 업데이트 허용
      };

      const command = new PutCommand(params);
      await this.client.send(command);

      console.log('✅ [HistoryService] Successfully saved inspection with ID:', inspectionId);

      return {
        success: true,
        inspectionId,
        data: historyRecord
      };
    } catch (error) {
      console.error('검사 이력 저장 실패:', error);
      throw new Error(`검사 이력 저장 실패: ${error.message}`);
    }
  }

  /**
   * 특정 검사 이력 조회
   * 
   * @param {string} customerId - 고객 ID
   * @param {string} inspectionId - 검사 ID
   * @returns {Promise<Object>} 검사 이력
   */
  async getInspectionHistory(customerId, inspectionId) {
    try {
      const params = {
        TableName: this.tableName,
        Key: {
          customerId,
          inspectionId
        }
      };

      const command = new GetCommand(params);
      const result = await this.client.send(command);

      if (!result.Item) {
        return {
          success: false,
          error: '검사 이력을 찾을 수 없습니다'
        };
      }

      return {
        success: true,
        data: result.Item
      };
    } catch (error) {
      console.error('검사 이력 조회 실패:', error);
      throw new Error(`검사 이력 조회 실패: ${error.message}`);
    }
  }

  /**
   * 고객별 검사 이력 목록 조회 (날짜순 정렬)
   * Requirements: 3.2 - WHEN 고객이 검사 이력을 요청 THEN 시스템은 날짜순으로 정렬된 검사 이력을 표시해야 합니다
   * 
   * @param {string} customerId - 고객 ID
   * @param {Object} options - 조회 옵션
   * @param {number} options.limit - 조회 제한 수
   * @param {Object} options.lastEvaluatedKey - 페이지네이션 키
   * @param {boolean} options.ascending - 오름차순 정렬 여부 (기본: false - 최신순)
   * @returns {Promise<Object>} 검사 이력 목록
   */
  async getInspectionHistoryList(customerId, options = {}) {
    try {
      const {
        limit = 50,
        lastEvaluatedKey = null,
        ascending = false
      } = options;

      const params = {
        TableName: this.tableName,
        IndexName: 'TimestampIndex',
        KeyConditionExpression: 'customerId = :customerId',
        ExpressionAttributeValues: {
          ':customerId': customerId
        },
        ScanIndexForward: ascending, // false = 내림차순 (최신순)
        Limit: limit
      };

      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey;
      }

      const command = new QueryCommand(params);
      const result = await this.client.send(command);

      return {
        success: true,
        data: {
          items: result.Items || [],
          count: result.Count || 0,
          lastEvaluatedKey: result.LastEvaluatedKey || null,
          hasMore: !!result.LastEvaluatedKey
        }
      };
    } catch (error) {
      console.error('검사 이력 목록 조회 실패:', error);
      throw new Error(`검사 이력 목록 조회 실패: ${error.message}`);
    }
  }

  /**
   * 서비스 타입별 검사 이력 조회
   * 
   * @param {string} customerId - 고객 ID
   * @param {string} serviceType - 서비스 타입
   * @param {Object} options - 조회 옵션
   * @returns {Promise<Object>} 서비스별 검사 이력
   */
  async getInspectionHistoryByService(customerId, serviceType, options = {}) {
    try {
      const {
        limit = 50,
        lastEvaluatedKey = null
      } = options;

      const params = {
        TableName: this.tableName,
        IndexName: 'ServiceTypeIndex',
        KeyConditionExpression: 'customerId = :customerId AND serviceType = :serviceType',
        ExpressionAttributeValues: {
          ':customerId': customerId,
          ':serviceType': serviceType
        },
        ScanIndexForward: false, // 최신순 정렬
        Limit: limit
      };

      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey;
      }

      const command = new QueryCommand(params);
      const result = await this.client.send(command);

      return {
        success: true,
        data: {
          items: result.Items || [],
          count: result.Count || 0,
          lastEvaluatedKey: result.LastEvaluatedKey || null,
          hasMore: !!result.LastEvaluatedKey
        }
      };
    } catch (error) {
      console.error('서비스별 검사 이력 조회 실패:', error);
      throw new Error(`서비스별 검사 이력 조회 실패: ${error.message}`);
    }
  }

  /**
   * 검사 이력 필터링
   * 
   * @param {string} customerId - 고객 ID
   * @param {Object} filters - 필터 조건
   * @param {string[]} filters.serviceTypes - 서비스 타입 목록
   * @param {string[]} filters.statuses - 상태 목록
   * @param {number} filters.startDate - 시작 날짜 (Unix timestamp)
   * @param {number} filters.endDate - 종료 날짜 (Unix timestamp)
   * @param {string[]} filters.riskLevels - 위험도 레벨 목록
   * @returns {Promise<Object>} 필터링된 검사 이력
   */
  async filterInspectionHistory(customerId, filters = {}) {
    try {
      const {
        serviceTypes = [],
        statuses = [],
        startDate = null,
        endDate = null,
        riskLevels = []
      } = filters;

      let filterExpression = 'customerId = :customerId';
      const expressionAttributeValues = {
        ':customerId': customerId
      };

      // 서비스 타입 필터
      if (serviceTypes.length > 0) {
        const serviceTypeConditions = serviceTypes.map((_, index) => {
          const key = `:serviceType${index}`;
          expressionAttributeValues[key] = serviceTypes[index];
          return `serviceType = ${key}`;
        });
        filterExpression += ` AND (${serviceTypeConditions.join(' OR ')})`;
      }

      // 상태 필터
      if (statuses.length > 0) {
        const statusConditions = statuses.map((_, index) => {
          const key = `:status${index}`;
          expressionAttributeValues[key] = statuses[index];
          return `#status = ${key}`;
        });
        filterExpression += ` AND (${statusConditions.join(' OR ')})`;
      }

      // 날짜 범위 필터
      if (startDate) {
        filterExpression += ' AND #timestamp >= :startDate';
        expressionAttributeValues[':startDate'] = startDate;
      }

      if (endDate) {
        filterExpression += ' AND #timestamp <= :endDate';
        expressionAttributeValues[':endDate'] = endDate;
      }

      const params = {
        TableName: this.tableName,
        FilterExpression: filterExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: {
          '#status': 'status',
          '#timestamp': 'timestamp'
        }
      };

      const command = new ScanCommand(params);
      const result = await this.client.send(command);

      let filteredItems = result.Items || [];

      // 위험도 레벨 필터 (클라이언트 사이드 필터링)
      if (riskLevels.length > 0) {
        filteredItems = filteredItems.filter(item => {
          const findings = item.results?.findings || [];
          return findings.some(finding => riskLevels.includes(finding.riskLevel));
        });
      }

      return {
        success: true,
        data: {
          items: filteredItems,
          count: filteredItems.length
        }
      };
    } catch (error) {
      console.error('검사 이력 필터링 실패:', error);
      throw new Error(`검사 이력 필터링 실패: ${error.message}`);
    }
  }
  
/**
   * 검사 결과 비교 분석
   * Requirements: 3.3, 3.4 - WHEN 고객이 특정 검사 결과를 선택 THEN 시스템은 상세한 검사 결과를 표시해야 합니다
   *                        WHEN 동일한 서비스에 대한 이전 검사가 존재 THEN 시스템은 변경사항을 하이라이트해야 합니다
   * 
   * @param {string} customerId - 고객 ID
   * @param {string} currentInspectionId - 현재 검사 ID
   * @param {string} previousInspectionId - 이전 검사 ID (선택사항)
   * @returns {Promise<Object>} 비교 분석 결과
   */
  async compareInspectionResults(customerId, currentInspectionId, previousInspectionId = null) {
    try {
      // 현재 검사 결과 조회
      const currentResult = await this.getInspectionHistory(customerId, currentInspectionId);
      if (!currentResult.success) {
        throw new Error('현재 검사 결과를 찾을 수 없습니다');
      }

      const currentInspection = currentResult.data;
      let previousInspection = null;

      // 이전 검사 결과 조회 (지정되지 않은 경우 동일 서비스의 가장 최근 검사 조회)
      if (previousInspectionId) {
        const previousResult = await this.getInspectionHistory(customerId, previousInspectionId);
        if (previousResult.success) {
          previousInspection = previousResult.data;
        }
      } else {
        // 동일 서비스의 이전 검사 자동 조회
        const serviceHistoryResult = await this.getInspectionHistoryByService(
          customerId, 
          currentInspection.serviceType,
          { limit: 2 }
        );

        if (serviceHistoryResult.success && serviceHistoryResult.data.items.length > 1) {
          // 현재 검사를 제외한 가장 최근 검사 선택
          previousInspection = serviceHistoryResult.data.items.find(
            item => item.inspectionId !== currentInspectionId
          );
        }
      }

      // 비교 분석 수행
      const comparison = this._performComparison(currentInspection, previousInspection);

      return {
        success: true,
        data: {
          current: currentInspection,
          previous: previousInspection,
          comparison
        }
      };
    } catch (error) {
      console.error('검사 결과 비교 실패:', error);
      throw new Error(`검사 결과 비교 실패: ${error.message}`);
    }
  }

  /**
   * 검사 결과 비교 분석 수행 (내부 메서드)
   * 
   * @param {Object} current - 현재 검사 결과
   * @param {Object} previous - 이전 검사 결과
   * @returns {Object} 비교 분석 결과
   */
  _performComparison(current, previous) {
    if (!previous) {
      return {
        hasComparison: false,
        message: '비교할 이전 검사 결과가 없습니다'
      };
    }

    const currentSummary = current.results?.summary || {};
    const previousSummary = previous.results?.summary || {};
    const currentFindings = current.results?.findings || [];
    const previousFindings = previous.results?.findings || [];

    // 요약 통계 비교
    const summaryComparison = {
      totalResources: {
        current: currentSummary.totalResources || 0,
        previous: previousSummary.totalResources || 0,
        change: (currentSummary.totalResources || 0) - (previousSummary.totalResources || 0)
      },
      highRiskIssues: {
        current: currentSummary.highRiskIssues || 0,
        previous: previousSummary.highRiskIssues || 0,
        change: (currentSummary.highRiskIssues || 0) - (previousSummary.highRiskIssues || 0)
      },
      mediumRiskIssues: {
        current: currentSummary.mediumRiskIssues || 0,
        previous: previousSummary.mediumRiskIssues || 0,
        change: (currentSummary.mediumRiskIssues || 0) - (previousSummary.mediumRiskIssues || 0)
      },
      lowRiskIssues: {
        current: currentSummary.lowRiskIssues || 0,
        previous: previousSummary.lowRiskIssues || 0,
        change: (currentSummary.lowRiskIssues || 0) - (previousSummary.lowRiskIssues || 0)
      },
      overallScore: {
        current: currentSummary.overallScore || 0,
        previous: previousSummary.overallScore || 0,
        change: (currentSummary.overallScore || 0) - (previousSummary.overallScore || 0)
      }
    };

    // 발견사항 비교
    const findingsComparison = this._compareFindingsDetails(currentFindings, previousFindings);

    // 전체적인 개선/악화 상태 판단
    const overallTrend = this._calculateOverallTrend(summaryComparison);

    return {
      hasComparison: true,
      timePeriod: {
        current: current.createdAt,
        previous: previous.createdAt,
        daysDifference: Math.floor((new Date(current.createdAt) - new Date(previous.createdAt)) / (1000 * 60 * 60 * 24))
      },
      summary: summaryComparison,
      findings: findingsComparison,
      overallTrend,
      recommendations: this._generateComparisonRecommendations(summaryComparison, findingsComparison)
    };
  }

  /**
   * 발견사항 상세 비교
   * 
   * @param {Array} currentFindings - 현재 발견사항
   * @param {Array} previousFindings - 이전 발견사항
   * @returns {Object} 발견사항 비교 결과
   */
  _compareFindingsDetails(currentFindings, previousFindings) {
    const currentFindingsMap = new Map();
    const previousFindingsMap = new Map();

    // 발견사항을 리소스 ID와 이슈 타입으로 매핑
    currentFindings.forEach(finding => {
      const key = `${finding.resourceId}-${finding.issue}`;
      currentFindingsMap.set(key, finding);
    });

    previousFindings.forEach(finding => {
      const key = `${finding.resourceId}-${finding.issue}`;
      previousFindingsMap.set(key, finding);
    });

    // 새로운 이슈, 해결된 이슈, 지속되는 이슈 분류
    const newIssues = [];
    const resolvedIssues = [];
    const persistentIssues = [];

    // 새로운 이슈 찾기
    currentFindingsMap.forEach((finding, key) => {
      if (!previousFindingsMap.has(key)) {
        newIssues.push(finding);
      } else {
        persistentIssues.push({
          current: finding,
          previous: previousFindingsMap.get(key)
        });
      }
    });

    // 해결된 이슈 찾기
    previousFindingsMap.forEach((finding, key) => {
      if (!currentFindingsMap.has(key)) {
        resolvedIssues.push(finding);
      }
    });

    return {
      new: newIssues,
      resolved: resolvedIssues,
      persistent: persistentIssues,
      summary: {
        newCount: newIssues.length,
        resolvedCount: resolvedIssues.length,
        persistentCount: persistentIssues.length
      }
    };
  }

  /**
   * 전체적인 개선/악화 트렌드 계산
   * 
   * @param {Object} summaryComparison - 요약 비교 결과
   * @returns {Object} 트렌드 분석 결과
   */
  _calculateOverallTrend(summaryComparison) {
    const scoreChange = summaryComparison.overallScore.change;
    const highRiskChange = summaryComparison.highRiskIssues.change;
    const mediumRiskChange = summaryComparison.mediumRiskIssues.change;

    let trend = 'stable';
    let message = '보안 상태가 안정적으로 유지되고 있습니다';

    if (scoreChange > 5 || (highRiskChange < 0 && mediumRiskChange <= 0)) {
      trend = 'improved';
      message = '보안 상태가 개선되었습니다';
    } else if (scoreChange < -5 || highRiskChange > 0) {
      trend = 'degraded';
      message = '보안 상태가 악화되었습니다';
    }

    return {
      trend,
      message,
      scoreChange,
      riskChangeImpact: {
        high: highRiskChange,
        medium: mediumRiskChange,
        low: summaryComparison.lowRiskIssues.change
      }
    };
  }

  /**
   * 비교 분석 기반 권장사항 생성
   * 
   * @param {Object} summaryComparison - 요약 비교 결과
   * @param {Object} findingsComparison - 발견사항 비교 결과
   * @returns {Array} 권장사항 목록
   */
  _generateComparisonRecommendations(summaryComparison, findingsComparison) {
    const recommendations = [];

    // 새로운 고위험 이슈에 대한 권장사항
    const newHighRiskIssues = findingsComparison.new.filter(issue => issue.riskLevel === 'HIGH');
    if (newHighRiskIssues.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'new_issues',
        message: `${newHighRiskIssues.length}개의 새로운 고위험 이슈가 발견되었습니다. 즉시 조치가 필요합니다.`,
        details: newHighRiskIssues.map(issue => issue.issue)
      });
    }

    // 지속되는 고위험 이슈에 대한 권장사항
    const persistentHighRiskIssues = findingsComparison.persistent.filter(
      issue => issue.current.riskLevel === 'HIGH'
    );
    if (persistentHighRiskIssues.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'persistent_issues',
        message: `${persistentHighRiskIssues.length}개의 고위험 이슈가 지속되고 있습니다. 해결 계획을 수립하세요.`,
        details: persistentHighRiskIssues.map(issue => issue.current.issue)
      });
    }

    // 해결된 이슈에 대한 긍정적 피드백
    if (findingsComparison.resolved.length > 0) {
      recommendations.push({
        priority: 'INFO',
        category: 'resolved_issues',
        message: `${findingsComparison.resolved.length}개의 이슈가 해결되었습니다. 좋은 진전입니다!`,
        details: findingsComparison.resolved.map(issue => issue.issue)
      });
    }

    // 전체 점수 변화에 따른 권장사항
    const scoreChange = summaryComparison.overallScore.change;
    if (scoreChange < -10) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'score_degradation',
        message: '전체 보안 점수가 크게 하락했습니다. 보안 정책을 재검토하세요.',
        details: ['정기적인 보안 검토 실시', '자동화된 보안 모니터링 도구 도입 검토']
      });
    }

    return recommendations;
  }

  /**
   * 검사 이력 통계 조회
   * 
   * @param {string} customerId - 고객 ID
   * @param {Object} options - 옵션
   * @param {number} options.days - 조회 기간 (일)
   * @returns {Promise<Object>} 통계 결과
   */
  async getInspectionStatistics(customerId, options = {}) {
    try {
      const { days = 30 } = options;
      const endDate = Date.now();
      const startDate = endDate - (days * 24 * 60 * 60 * 1000);

      const historyResult = await this.filterInspectionHistory(customerId, {
        startDate,
        endDate
      });

      if (!historyResult.success) {
        throw new Error('통계 조회 실패');
      }

      const inspections = historyResult.data.items;

      // 서비스별 통계
      const serviceStats = {};
      const riskTrends = [];
      let totalInspections = inspections.length;

      inspections.forEach(inspection => {
        const serviceType = inspection.serviceType;
        const summary = inspection.results?.summary || {};

        if (!serviceStats[serviceType]) {
          serviceStats[serviceType] = {
            count: 0,
            totalResources: 0,
            totalHighRisk: 0,
            totalMediumRisk: 0,
            totalLowRisk: 0,
            averageScore: 0
          };
        }

        serviceStats[serviceType].count++;
        serviceStats[serviceType].totalResources += summary.totalResources || 0;
        serviceStats[serviceType].totalHighRisk += summary.highRiskIssues || 0;
        serviceStats[serviceType].totalMediumRisk += summary.mediumRiskIssues || 0;
        serviceStats[serviceType].totalLowRisk += summary.lowRiskIssues || 0;
        serviceStats[serviceType].averageScore += summary.overallScore || 0;

        // 위험도 트렌드 데이터
        riskTrends.push({
          date: inspection.createdAt,
          serviceType: serviceType,
          highRisk: summary.highRiskIssues || 0,
          mediumRisk: summary.mediumRiskIssues || 0,
          lowRisk: summary.lowRiskIssues || 0,
          score: summary.overallScore || 0
        });
      });

      // 평균 점수 계산
      Object.keys(serviceStats).forEach(serviceType => {
        const stats = serviceStats[serviceType];
        stats.averageScore = stats.count > 0 ? Math.round(stats.averageScore / stats.count) : 0;
      });

      return {
        success: true,
        data: {
          period: {
            days,
            startDate: new Date(startDate).toISOString(),
            endDate: new Date(endDate).toISOString()
          },
          summary: {
            totalInspections,
            servicesInspected: Object.keys(serviceStats).length
          },
          serviceStats,
          riskTrends: riskTrends.sort((a, b) => new Date(a.date) - new Date(b.date))
        }
      };
    } catch (error) {
      console.error('검사 통계 조회 실패:', error);
      throw new Error(`검사 통계 조회 실패: ${error.message}`);
    }
  }

  /**
   * 검사 이력 삭제
   * 
   * @param {string} customerId - 고객 ID
   * @param {string} inspectionId - 검사 ID
   * @returns {Promise<Object>} 삭제 결과
   */
  async deleteInspectionHistory(customerId, inspectionId) {
    try {
      const params = {
        TableName: this.tableName,
        Key: {
          customerId,
          inspectionId
        },
        ConditionExpression: 'attribute_exists(inspectionId)'
      };

      const command = new DeleteCommand(params);
      await this.client.send(command);

      return {
        success: true,
        message: '검사 이력이 삭제되었습니다'
      };
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        return {
          success: false,
          error: '검사 이력을 찾을 수 없습니다'
        };
      }
      console.error('검사 이력 삭제 실패:', error);
      throw new Error(`검사 이력 삭제 실패: ${error.message}`);
    }
  }

  /**
   * 검사 상태 업데이트
   * 
   * @param {string} customerId - 고객 ID
   * @param {string} inspectionId - 검사 ID
   * @param {string} status - 새로운 상태
   * @param {Object} additionalData - 추가 데이터
   * @returns {Promise<Object>} 업데이트 결과
   */
  async updateInspectionStatus(customerId, inspectionId, status, additionalData = {}) {
    try {
      const timestamp = new Date().toISOString();
      
      let updateExpression = 'SET #status = :status, updatedAt = :updatedAt';
      const expressionAttributeNames = { '#status': 'status' };
      const expressionAttributeValues = {
        ':status': status,
        ':updatedAt': timestamp
      };

      // 추가 데이터가 있는 경우 업데이트 표현식에 추가
      if (additionalData.endTime) {
        updateExpression += ', endTime = :endTime';
        expressionAttributeValues[':endTime'] = additionalData.endTime;
      }

      if (additionalData.duration) {
        updateExpression += ', duration = :duration';
        expressionAttributeValues[':duration'] = additionalData.duration;
      }

      if (additionalData.results) {
        updateExpression += ', results = :results';
        expressionAttributeValues[':results'] = additionalData.results;
      }

      const params = {
        TableName: this.tableName,
        Key: {
          customerId,
          inspectionId
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ConditionExpression: 'attribute_exists(inspectionId)',
        ReturnValues: 'ALL_NEW'
      };

      const command = new UpdateCommand(params);
      const result = await this.client.send(command);

      return {
        success: true,
        data: result.Attributes
      };
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        return {
          success: false,
          error: '검사 이력을 찾을 수 없습니다'
        };
      }
      console.error('검사 상태 업데이트 실패:', error);
      throw new Error(`검사 상태 업데이트 실패: ${error.message}`);
    }
  }
}

module.exports = new HistoryService();