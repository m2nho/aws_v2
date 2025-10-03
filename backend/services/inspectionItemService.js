const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

// 환경변수 로드
require('dotenv').config();

/**
 * 검사 항목별 결과 관리 서비스
 * AWS Trusted Advisor 스타일의 항목별 상태 관리
 */
class InspectionItemService {
  constructor() {
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({
      region: process.env.AWS_REGION || 'us-east-1'
    }));
    this.tableName = process.env.AWS_DYNAMODB_INSPECTION_ITEMS_TABLE || 'InspectionItemResults';
  }

  /**
   * 검사 항목별 결과 저장/업데이트
   * @param {string} customerId - 고객 ID
   * @param {string} inspectionId - 검사 ID
   * @param {Object} itemResult - 검사 항목 결과
   */
  async saveItemResult(customerId, inspectionId, itemResult) {
    try {
      const now = Date.now();
      
      // 공통 아이템 데이터
      const baseItem = {
        customerId,
        serviceType: itemResult.serviceType,
        itemId: itemResult.itemId,
        itemName: itemResult.itemName,
        category: itemResult.category,
        
        lastInspectionId: inspectionId,
        lastInspectionTime: now,
        status: this.determineStatus(itemResult),
        
        totalResources: itemResult.totalResources || 0,
        issuesFound: itemResult.issuesFound || 0,
        riskLevel: itemResult.riskLevel || 'LOW',
        score: itemResult.score || 100,
        
        findings: itemResult.findings || [],
        recommendations: itemResult.recommendations || [],
        
        updatedAt: now,
        createdAt: itemResult.createdAt || now
      };

      // 1. 히스토리용 레코드 저장 (검사 ID 포함)
      const historyItem = {
        ...baseItem,
        itemKey: `${itemResult.serviceType}#${itemResult.itemId}#${inspectionId}`,
        recordType: 'HISTORY'
      };

      // 2. 최신 상태용 레코드 저장/업데이트 (LATEST)
      const latestItem = {
        ...baseItem,
        itemKey: `${itemResult.serviceType}#${itemResult.itemId}#LATEST`,
        recordType: 'LATEST'
      };

      // 두 레코드 모두 저장
      await Promise.all([
        this.client.send(new PutCommand({
          TableName: this.tableName,
          Item: historyItem
        })),
        this.client.send(new PutCommand({
          TableName: this.tableName,
          Item: latestItem
        }))
      ]);

      console.log(`✅ [InspectionItemService] Saved both LATEST and HISTORY records for ${itemResult.serviceType}#${itemResult.itemId}`);

      return { success: true, data: { historyItem, latestItem } };

    } catch (error) {
      console.error('Failed to save item result:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 서비스별 최근 검사 항목 결과 조회
   * @param {string} customerId - 고객 ID
   * @param {string} serviceType - 서비스 타입 (EC2, RDS, S3, IAM)
   */
  async getServiceItemResults(customerId, serviceType) {
    try {
      const command = new QueryCommand({
        TableName: this.tableName,
        IndexName: 'customerId-serviceType-index',
        KeyConditionExpression: 'customerId = :customerId AND serviceType = :serviceType',
        ExpressionAttributeValues: {
          ':customerId': customerId,
          ':serviceType': serviceType
        },
        ScanIndexForward: false // 최신순 정렬
      });

      const result = await this.client.send(command);
      return {
        success: true,
        data: result.Items || []
      };

    } catch (error) {
      console.error('Failed to get service item results:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 모든 서비스의 최근 검사 항목 결과 조회 (LATEST만)
   * @param {string} customerId - 고객 ID
   */
  async getAllItemResults(customerId) {
    try {
      const command = new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'customerId = :customerId',
        FilterExpression: 'recordType = :recordType',
        ExpressionAttributeValues: {
          ':customerId': customerId,
          ':recordType': 'LATEST'
        }
      });

      const result = await this.client.send(command);
      
      console.log(`🔍 [InspectionItemService] Found ${result.Items?.length || 0} LATEST item results`);
      
      // 서비스별로 그룹화
      const groupedResults = {};
      (result.Items || []).forEach(item => {
        if (!groupedResults[item.serviceType]) {
          groupedResults[item.serviceType] = [];
        }
        groupedResults[item.serviceType].push(item);
      });

      return {
        success: true,
        data: groupedResults
      };

    } catch (error) {
      console.error('Failed to get all item results:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 특정 검사 항목의 상세 결과 조회
   * @param {string} customerId - 고객 ID
   * @param {string} serviceType - 서비스 타입
   * @param {string} itemId - 검사 항목 ID
   */
  async getItemResult(customerId, serviceType, itemId) {
    try {
      const itemKey = `${serviceType}#${itemId}`;
      
      const command = new GetCommand({
        TableName: this.tableName,
        Key: {
          customerId,
          itemKey
        }
      });

      const result = await this.client.send(command);
      
      if (!result.Item) {
        return {
          success: false,
          error: 'Item result not found'
        };
      }

      return {
        success: true,
        data: result.Item
      };

    } catch (error) {
      console.error('Failed to get item result:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 고객의 모든 검사 항목 히스토리 조회 (시간순 정렬)
   * @param {string} customerId - 고객 ID
   * @param {Object} options - 조회 옵션
   */
  async getItemHistory(customerId, options = {}) {
    try {
      const { serviceType, limit = 50, startDate, endDate } = options;
      
      console.log(`🔍 [InspectionItemService] Getting item history for customer: ${customerId}`);
      console.log(`🔍 [InspectionItemService] Options:`, { serviceType, limit, startDate, endDate });
      
      let queryParams = {
        TableName: this.tableName,
        KeyConditionExpression: 'customerId = :customerId',
        FilterExpression: 'recordType = :recordType',
        ExpressionAttributeValues: {
          ':customerId': customerId,
          ':recordType': 'HISTORY'
        },
        ScanIndexForward: false // 최신순 정렬
      };

      // 서비스 타입 필터가 있는 경우 GSI 사용
      if (serviceType) {
        queryParams.IndexName = 'customerId-serviceType-index';
        queryParams.KeyConditionExpression = 'customerId = :customerId AND serviceType = :serviceType';
        queryParams.ExpressionAttributeValues[':serviceType'] = serviceType;
      }

      // 날짜 필터가 있는 경우 FilterExpression 추가
      if (startDate || endDate) {
        let filterExpressions = [];
        
        if (startDate) {
          filterExpressions.push('lastInspectionTime >= :startDate');
          queryParams.ExpressionAttributeValues[':startDate'] = new Date(startDate).getTime();
        }
        
        if (endDate) {
          filterExpressions.push('lastInspectionTime <= :endDate');
          queryParams.ExpressionAttributeValues[':endDate'] = new Date(endDate).getTime();
        }
        
        if (filterExpressions.length > 0) {
          queryParams.FilterExpression = filterExpressions.join(' AND ');
        }
      }

      if (limit) {
        queryParams.Limit = parseInt(limit);
      }

      const command = new QueryCommand(queryParams);
      const result = await this.client.send(command);
      
      console.log(`🔍 [InspectionItemService] Found ${result.Items?.length || 0} item history records`);
      
      // 각 항목의 itemKey 구조 확인
      if (result.Items && result.Items.length > 0) {
        console.log('🔍 [InspectionItemService] Sample itemKeys:');
        result.Items.slice(0, 3).forEach((item, index) => {
          console.log(`  ${index + 1}. ${item.itemKey} - ${item.itemName} (${new Date(item.lastInspectionTime).toLocaleString()})`);
        });
      }
      
      // 시간순으로 정렬 (DynamoDB 쿼리 결과를 추가로 정렬)
      const sortedItems = (result.Items || []).sort((a, b) => 
        (b.lastInspectionTime || 0) - (a.lastInspectionTime || 0)
      );

      return {
        success: true,
        data: sortedItems,
        count: result.Count || 0,
        hasMore: !!result.LastEvaluatedKey
      };

    } catch (error) {
      console.error('Failed to get item history:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 검사 결과를 기반으로 상태 결정
   * @param {Object} itemResult - 검사 항목 결과
   * @returns {string} 상태 (PASS, FAIL, WARNING, NOT_CHECKED)
   */
  determineStatus(itemResult) {
    if (!itemResult.totalResources || itemResult.totalResources === 0) {
      return 'NOT_CHECKED';
    }

    const issuesFound = itemResult.issuesFound || 0;
    const riskLevel = itemResult.riskLevel || 'LOW';

    if (issuesFound === 0) {
      return 'PASS';
    }

    if (riskLevel === 'CRITICAL' || riskLevel === 'HIGH') {
      return 'FAIL';
    }

    return 'WARNING';
  }

  /**
   * 검사 완료 시 전체 결과를 항목별로 분해하여 저장
   * @param {string} customerId - 고객 ID
   * @param {string} inspectionId - 검사 ID
   * @param {Object} inspectionResult - 전체 검사 결과
   */
  async processInspectionResult(customerId, inspectionId, inspectionResult) {
    try {
      const { serviceType, results, metadata } = inspectionResult;
      
      if (!results || !results.findings) {
        return { success: true, message: 'No findings to process' };
      }

      // 개별 항목 검사인 경우 해당 항목으로만 분류
      if (metadata && metadata.targetItem && metadata.targetItem !== 'all') {
        const targetItemId = metadata.targetItem;
        const itemMapping = this.getServiceItemMappings(serviceType)[targetItemId];
        
        // 모든 findings를 해당 항목으로 분류
        const itemResult = {
          serviceType,
          itemId: targetItemId,
          itemName: itemMapping?.name || metadata.itemName || targetItemId,
          category: itemMapping?.category || 'other',
          totalResources: results.findings.length,
          issuesFound: results.findings.length,
          riskLevel: this.calculateMaxRiskLevel(results.findings),
          score: this.calculateScore(results.findings),
          findings: results.findings,
          recommendations: results.recommendations || []
        };

        await this.saveItemResult(customerId, inspectionId, itemResult);
        
        return {
          success: true,
          message: `Processed single inspection item: ${targetItemId}`
        };
      }

      // 전체 검사인 경우 기존 로직 사용
      const itemResults = this.categorizeFindings(serviceType, results.findings);
      
      // 각 항목별 결과 저장
      const savePromises = Object.entries(itemResults).map(([itemId, itemData]) => {
        return this.saveItemResult(customerId, inspectionId, {
          serviceType,
          itemId,
          itemName: itemData.name,
          category: itemData.category,
          totalResources: itemData.totalResources,
          issuesFound: itemData.findings.length,
          riskLevel: itemData.maxRiskLevel,
          score: itemData.score,
          findings: itemData.findings,
          recommendations: itemData.recommendations
        });
      });

      await Promise.all(savePromises);
      
      return {
        success: true,
        message: `Processed ${Object.keys(itemResults).length} inspection items`
      };

    } catch (error) {
      console.error('Failed to process inspection result:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 검사 결과를 항목별로 분류
   * @param {string} serviceType - 서비스 타입
   * @param {Array} findings - 검사 결과
   * @returns {Object} 항목별 분류된 결과
   */
  categorizeFindings(serviceType, findings) {
    const itemResults = {};
    
    // 서비스별 항목 매핑 정의
    const itemMappings = {
      EC2: {
        'security_groups': { name: '보안 그룹 규칙', category: 'security' },
        'key_pairs': { name: '키 페어 관리', category: 'security' },
        'instance_metadata': { name: '인스턴스 메타데이터', category: 'security' },
        'instance_types': { name: '인스턴스 타입 최적화', category: 'performance' },
        'ebs_optimization': { name: 'EBS 최적화', category: 'performance' }
      },
      RDS: {
        'encryption': { name: '암호화 설정', category: 'security' },
        'security_groups': { name: '데이터베이스 보안 그룹', category: 'security' },
        'public_access': { name: '퍼블릭 접근 설정', category: 'security' },
        'automated_backup': { name: '자동 백업', category: 'backup' }
      },
      S3: {
        'bucket_policy': { name: '버킷 정책', category: 'security' },
        'public_access': { name: '퍼블릭 접근 차단', category: 'security' },
        'encryption': { name: '서버 측 암호화', category: 'security' },
        'versioning': { name: '버전 관리', category: 'compliance' }
      },
      IAM: {
        'root_access_key': { name: '루트 계정 액세스 키', category: 'security' },
        'mfa_enabled': { name: 'MFA 활성화', category: 'security' },
        'unused_credentials': { name: '미사용 자격 증명', category: 'security' }
      }
    };

    const mappings = itemMappings[serviceType] || {};

    // 각 finding을 적절한 항목으로 분류
    findings.forEach(finding => {
      const itemId = this.determineItemId(finding);
      
      if (!itemResults[itemId]) {
        itemResults[itemId] = {
          name: mappings[itemId]?.name || itemId,
          category: mappings[itemId]?.category || 'other',
          totalResources: 0,
          findings: [],
          recommendations: [],
          maxRiskLevel: 'LOW',
          score: 100
        };
      }

      itemResults[itemId].findings.push(finding);
      itemResults[itemId].totalResources++;
      
      // 최대 위험도 업데이트
      if (this.getRiskPriority(finding.riskLevel) > this.getRiskPriority(itemResults[itemId].maxRiskLevel)) {
        itemResults[itemId].maxRiskLevel = finding.riskLevel;
      }
      
      // 점수 계산 (간단한 로직)
      itemResults[itemId].score = Math.max(0, itemResults[itemId].score - (finding.riskScore || 10));
    });

    return itemResults;
  }

  /**
   * Finding에서 검사 항목 ID 결정
   * @param {Object} finding - 검사 결과
   * @returns {string} 항목 ID
   */
  determineItemId(finding) {
    // 간단한 키워드 매칭으로 항목 결정
    const issue = finding.issue?.toLowerCase() || '';
    
    if (issue.includes('security group')) return 'security_groups';
    if (issue.includes('key pair')) return 'key_pairs';
    if (issue.includes('metadata')) return 'instance_metadata';
    if (issue.includes('encryption')) return 'encryption';
    if (issue.includes('backup')) return 'automated_backup';
    if (issue.includes('bucket policy')) return 'bucket_policy';
    if (issue.includes('public access')) return 'public_access';
    if (issue.includes('root')) return 'root_access_key';
    if (issue.includes('mfa')) return 'mfa_enabled';
    
    return 'other';
  }

  /**
   * 최대 위험도 계산
   * @param {Array} findings - 검사 결과 목록
   * @returns {string} 최대 위험도
   */
  calculateMaxRiskLevel(findings) {
    let maxRiskLevel = 'LOW';
    findings.forEach(finding => {
      if (this.getRiskPriority(finding.riskLevel) > this.getRiskPriority(maxRiskLevel)) {
        maxRiskLevel = finding.riskLevel;
      }
    });
    return maxRiskLevel;
  }

  /**
   * 점수 계산
   * @param {Array} findings - 검사 결과 목록
   * @returns {number} 점수 (0-100)
   */
  calculateScore(findings) {
    let score = 100;
    findings.forEach(finding => {
      score = Math.max(0, score - (finding.riskScore || 10));
    });
    return score;
  }

  /**
   * 위험도 우선순위 반환
   * @param {string} riskLevel - 위험도
   * @returns {number} 우선순위 (높을수록 위험)
   */
  getRiskPriority(riskLevel) {
    const priorities = {
      'LOW': 1,
      'MEDIUM': 2,
      'HIGH': 3,
      'CRITICAL': 4
    };
    return priorities[riskLevel] || 0;
  }
}

module.exports = new InspectionItemService();