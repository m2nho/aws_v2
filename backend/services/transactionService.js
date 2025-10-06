/**
 * Transaction Service
 * DynamoDB 트랜잭션을 활용한 데이터 일관성 보장 서비스
 */

// .env 파일 로드 확인
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, TransactWriteCommand, TransactGetCommand } = require('@aws-sdk/lib-dynamodb');

class TransactionService {
  constructor() {
    // AWS 설정을 사용하여 클라이언트 생성
    try {
      const { dynamoDBDocClient } = require('../config/aws');
      this.client = dynamoDBDocClient;
    } catch (error) {
      // 폴백: 직접 클라이언트 생성
      this.client = DynamoDBDocumentClient.from(new DynamoDBClient({
        region: process.env.AWS_REGION || 'ap-northeast-2',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      }));
    }
    
    this.itemsTableName = process.env.AWS_DYNAMODB_INSPECTION_ITEMS_TABLE || 'InspectionItemResults';
    
    this.logger = this.createLogger();
  }

  /**
   * 검사 결과를 트랜잭션으로 저장
   * @param {Object} inspectionData - 검사 데이터
   * @param {Array} itemResults - 검사 항목 결과들
   * @returns {Promise<Object>} 저장 결과
   */
  async saveInspectionResultsTransaction(inspectionData, itemResults = []) {
    try {
      this.logger.info('Starting transaction for inspection results', {
        inspectionId: inspectionData.inspectionId,
        itemCount: itemResults.length,
        customerId: inspectionData.customerId,
        hasResults: !!inspectionData.results
      });
      


      // 트랜잭션 아이템들 준비 (단일 테이블 구조)
      const transactItems = [];
      const now = Date.now();

      // InspectionItemResults에 LATEST + HISTORY 레코드 저장
      itemResults.forEach(itemResult => {
        const baseItem = {
          customerId: inspectionData.customerId,
          serviceType: itemResult.serviceType,
          itemId: itemResult.itemId,
          itemName: itemResult.itemName,
          category: itemResult.category,
          
          lastInspectionId: inspectionData.inspectionId,
          lastInspectionTime: now,
          status: this.determineItemStatus(itemResult),
          
          riskLevel: itemResult.riskLevel || 'LOW',
          score: itemResult.score || 100,
          
          findings: itemResult.findings || [],
          recommendations: itemResult.recommendations || [],
          
          updatedAt: now,
          createdAt: itemResult.createdAt || now
        };

        // 1. HISTORY 레코드 (검사 ID 포함)
        transactItems.push({
          Put: {
            TableName: this.itemsTableName,
            Item: {
              ...baseItem,
              itemKey: `${itemResult.serviceType}#${itemResult.itemId}#${inspectionData.inspectionId}`,
              recordType: 'HISTORY'
            }
          }
        });

        // 2. LATEST 레코드 (덮어쓰기)
        transactItems.push({
          Put: {
            TableName: this.itemsTableName,
            Item: {
              ...baseItem,
              itemKey: `${itemResult.serviceType}#${itemResult.itemId}#LATEST`,
              recordType: 'LATEST'
            }
          }
        });
      });

      // 트랜잭션 실행 (최대 25개 아이템 제한)
      if (transactItems.length > 25) {
        return await this.executeBatchTransaction(transactItems, inspectionData);
      }

      const command = new TransactWriteCommand({
        TransactItems: transactItems
      });

      await this.client.send(command);
      

      this.logger.info('Transaction completed successfully', {
        inspectionId: inspectionData.inspectionId,
        itemsProcessed: itemResults.length
      });

      return {
        success: true,
        inspectionId: inspectionData.inspectionId,
        itemsProcessed: itemResults.length,
        message: 'Inspection results saved successfully with transaction'
      };

    } catch (error) {
      this.logger.error('Transaction failed', {
        inspectionId: inspectionData.inspectionId,
        error: error.message,
        errorCode: error.name
      });

      // 트랜잭션 실패 시 상세 오류 정보 제공
      if (error.name === 'TransactionCanceledException') {
        return await this.handleTransactionCancellation(error, inspectionData);
      }

      return {
        success: false,
        error: {
          code: 'TRANSACTION_FAILED',
          message: 'Failed to save inspection results',
          details: error.message
        }
      };
    }
  }

  /**
   * 대용량 트랜잭션을 배치로 처리
   * @param {Array} transactItems - 트랜잭션 아이템들
   * @param {Object} inspectionData - 검사 데이터
   * @returns {Promise<Object>} 처리 결과
   */
  async executeBatchTransaction(transactItems, inspectionData) {
    const batchSize = 25;
    const batches = [];
    
    // 25개씩 배치로 나누기
    for (let i = 0; i < transactItems.length; i += batchSize) {
      batches.push(transactItems.slice(i, i + batchSize));
    }

    this.logger.info('Executing batch transactions', {
      inspectionId: inspectionData.inspectionId,
      totalBatches: batches.length,
      totalItems: transactItems.length
    });

    const results = [];
    let successCount = 0;
    let failureCount = 0;

    // 각 배치를 순차적으로 실행 (병렬 실행 시 스로틀링 위험)
    for (let i = 0; i < batches.length; i++) {
      try {
        const command = new TransactWriteCommand({
          TransactItems: batches[i]
        });

        await this.client.send(command);
        successCount++;
        results.push({ batchIndex: i, success: true });

        this.logger.debug('Batch transaction completed', {
          batchIndex: i,
          itemsInBatch: batches[i].length
        });

      } catch (error) {
        failureCount++;
        results.push({ 
          batchIndex: i, 
          success: false, 
          error: error.message 
        });

        this.logger.error('Batch transaction failed', {
          batchIndex: i,
          error: error.message
        });

        // 첫 번째 배치(히스토리 포함) 실패 시 전체 실패로 처리
        if (i === 0) {
          throw new Error(`Critical batch failed: ${error.message}`);
        }
      }
    }

    return {
      success: failureCount === 0,
      inspectionId: inspectionData.inspectionId,
      batchResults: results,
      successfulBatches: successCount,
      failedBatches: failureCount,
      message: failureCount === 0 ? 
        'All batch transactions completed successfully' : 
        `${successCount}/${batches.length} batches completed successfully`
    };
  }

  /**
   * 트랜잭션 취소 처리
   * @param {Error} error - 트랜잭션 오류
   * @param {Object} inspectionData - 검사 데이터
   * @returns {Promise<Object>} 처리 결과
   */
  async handleTransactionCancellation(error, inspectionData) {
    this.logger.warn('Transaction was cancelled, attempting recovery', {
      inspectionId: inspectionData.inspectionId,
      cancellationReasons: error.CancellationReasons
    });

    // 취소 이유 분석
    const cancellationReasons = error.CancellationReasons || [];
    const conflictReasons = cancellationReasons.filter(reason => 
      reason.Code === 'ConditionalCheckFailed'
    );

    if (conflictReasons.length > 0) {
      // 조건부 체크 실패 - 이미 완료된 검사일 가능성
      const existingData = await this.checkExistingInspection(
        inspectionData.customerId, 
        inspectionData.inspectionId
      );

      if (existingData && existingData.status === 'COMPLETED') {
        return {
          success: false,
          error: {
            code: 'INSPECTION_ALREADY_COMPLETED',
            message: 'Inspection has already been completed',
            details: 'Cannot overwrite completed inspection results'
          }
        };
      }
    }

    // 재시도 로직
    return await this.retryTransactionWithBackoff(inspectionData);
  }

  /**
   * 백오프를 사용한 트랜잭션 재시도
   * @param {Object} inspectionData - 검사 데이터
   * @returns {Promise<Object>} 재시도 결과
   */
  async retryTransactionWithBackoff(inspectionData, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.info('Retrying transaction', {
          inspectionId: inspectionData.inspectionId,
          attempt,
          maxRetries
        });

        // 지수 백오프 (1초, 2초, 4초)
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));

        // 조건을 완화하여 재시도
        const relaxedData = {
          ...inspectionData,
          metadata: {
            ...inspectionData.metadata,
            retryAttempt: attempt,
            originalTimestamp: inspectionData.metadata?.originalTimestamp || Date.now()
          }
        };

        return await this.saveInspectionResultsTransaction(relaxedData, []);

      } catch (error) {
        this.logger.warn('Retry attempt failed', {
          inspectionId: inspectionData.inspectionId,
          attempt,
          error: error.message
        });

        if (attempt === maxRetries) {
          return {
            success: false,
            error: {
              code: 'TRANSACTION_RETRY_EXHAUSTED',
              message: 'Failed to save after multiple retry attempts',
              details: `All ${maxRetries} retry attempts failed`
            }
          };
        }
      }
    }
  }

  /**
   * 기존 검사 데이터 확인
   * @param {string} customerId - 고객 ID
   * @param {string} inspectionId - 검사 ID
   * @returns {Promise<Object|null>} 기존 데이터
   */
  async checkExistingInspection(customerId, inspectionId) {
    try {
      const command = new TransactGetCommand({
        TransactItems: [{
          Get: {
            TableName: this.historyTableName,
            Key: {
              customerId,
              inspectionId
            }
          }
        }]
      });

      const result = await this.client.send(command);
      return result.Responses?.[0]?.Item || null;

    } catch (error) {
      this.logger.error('Failed to check existing inspection', {
        customerId,
        inspectionId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * 히스토리 아이템 준비
   * @param {Object} inspectionData - 검사 데이터
   * @returns {Object} DynamoDB 아이템
   */
  prepareHistoryItem(inspectionData) {
    const timestamp = Date.now();
    const isoTimestamp = new Date().toISOString();

    return {
      customerId: inspectionData.customerId,
      inspectionId: inspectionData.inspectionId,
      serviceType: inspectionData.serviceType,
      status: 'COMPLETED',
      startTime: inspectionData.startTime || timestamp,
      endTime: inspectionData.endTime || timestamp,
      duration: inspectionData.duration || 0,
      timestamp,
      createdAt: isoTimestamp,
      results: {
        summary: inspectionData.results?.summary || {},
        findings: inspectionData.results?.findings || [],
        recommendations: inspectionData.results?.recommendations || []
      },
      assumeRoleArn: inspectionData.assumeRoleArn,
      metadata: {
        version: '1.0',
        inspectorVersion: inspectionData.metadata?.inspectorVersion || 'unknown',
        transactionId: `tx-${Date.now()}`,
        ...inspectionData.metadata
      }
    };
  }

  /**
   * 검사 항목 상태 결정
   * @param {Object} itemResult - 검사 항목 결과
   * @returns {string} 상태
   */
  determineItemStatus(itemResult) {
    const issuesFound = itemResult.issuesFound || 0;
    const riskLevel = itemResult.riskLevel || 'LOW';
    const hasFindings = itemResult.findings && itemResult.findings.length > 0;

    // findings가 있으면 검사가 수행된 것으로 판단
    if (!hasFindings && (!itemResult.totalResources || itemResult.totalResources === 0)) {
      return 'NOT_CHECKED';
    }

    if (issuesFound === 0) {
      return 'PASS';
    }

    if (riskLevel === 'CRITICAL' || riskLevel === 'HIGH') {
      return 'FAIL';
    }

    return 'WARNING';
  }

  /**
   * 데이터 일관성 검증
   * @param {string} customerId - 고객 ID
   * @param {string} inspectionId - 검사 ID
   * @returns {Promise<Object>} 검증 결과
   */
  async validateDataConsistency(customerId, inspectionId) {
    try {
      // 히스토리와 아이템 결과 동시 조회
      const command = new TransactGetCommand({
        TransactItems: [
          {
            Get: {
              TableName: this.historyTableName,
              Key: { customerId, inspectionId }
            }
          }
        ]
      });

      const result = await this.client.send(command);
      const historyItem = result.Responses?.[0]?.Item;

      if (!historyItem) {
        return {
          isConsistent: false,
          issues: ['History record not found']
        };
      }

      // 관련 아이템 결과들 조회
      const itemResults = await this.getRelatedItemResults(customerId, inspectionId);
      
      const issues = [];
      
      // 일관성 검사
      if (historyItem.status === 'COMPLETED' && itemResults.length === 0) {
        issues.push('Completed inspection has no item results');
      }

      // 타임스탬프 일관성 검사
      const historyTime = historyItem.endTime || historyItem.timestamp;
      const inconsistentItems = itemResults.filter(item => 
        Math.abs(item.lastInspectionTime - historyTime) > 60000 // 1분 이상 차이
      );

      if (inconsistentItems.length > 0) {
        issues.push(`${inconsistentItems.length} items have inconsistent timestamps`);
      }

      return {
        isConsistent: issues.length === 0,
        issues,
        historyRecord: historyItem,
        itemResults: itemResults.length,
        inconsistentItems: inconsistentItems.length
      };

    } catch (error) {
      this.logger.error('Data consistency validation failed', {
        customerId,
        inspectionId,
        error: error.message
      });

      return {
        isConsistent: false,
        issues: [`Validation failed: ${error.message}`]
      };
    }
  }

  /**
   * 관련 아이템 결과들 조회
   * @param {string} customerId - 고객 ID
   * @param {string} inspectionId - 검사 ID
   * @returns {Promise<Array>} 아이템 결과들
   */
  async getRelatedItemResults(customerId, inspectionId) {
    try {
      const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
      
      const command = new QueryCommand({
        TableName: this.itemsTableName,
        KeyConditionExpression: 'customerId = :customerId',
        FilterExpression: 'lastInspectionId = :inspectionId',
        ExpressionAttributeValues: {
          ':customerId': customerId,
          ':inspectionId': inspectionId
        }
      });

      const result = await this.client.send(command);
      return result.Items || [];

    } catch (error) {
      this.logger.error('Failed to get related item results', {
        customerId,
        inspectionId,
        error: error.message
      });
      return [];
    }
  }

  /**
   * 로거 생성
   * @returns {Object} 로거 객체
   */
  createLogger() {
    return {
      debug: (message, meta = {}) => {
        // DEBUG 로그 완전 비활성화
      },
      info: (message, meta = {}) => {
        // INFO 로그 완전 비활성화 (에러와 경고만 유지)
      },
      warn: (message, meta = {}) => {
        console.warn(`[WARN] [TransactionService] ${message}`, meta);
      },
      error: (message, meta = {}) => {
        console.error(`[ERROR] [TransactionService] ${message}`, meta);
      }
    };
  }
}

module.exports = new TransactionService();