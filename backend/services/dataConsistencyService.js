/**
 * Data Consistency Service
 * 데이터 일관성 검증 및 복구 서비스
 */

const transactionService = require('./transactionService');
const historyService = require('./historyService');
const inspectionItemService = require('./inspectionItemService');

class DataConsistencyService {
  constructor() {
    this.logger = this.createLogger();
  }

  /**
   * 특정 검사의 데이터 일관성 검증
   * @param {string} customerId - 고객 ID
   * @param {string} inspectionId - 검사 ID
   * @returns {Promise<Object>} 검증 결과
   */
  async validateInspectionConsistency(customerId, inspectionId) {
    try {
      this.logger.info('Starting consistency validation', {
        customerId,
        inspectionId
      });

      // 트랜잭션 서비스를 통한 일관성 검증
      const validationResult = await transactionService.validateDataConsistency(
        customerId, 
        inspectionId
      );

      if (validationResult.isConsistent) {
        this.logger.info('Data consistency validation passed', {
          customerId,
          inspectionId
        });
        return {
          success: true,
          isConsistent: true,
          message: 'Data is consistent',
          details: validationResult
        };
      }

      // 일관성 문제 발견 시 상세 분석
      const analysisResult = await this.analyzeInconsistencies(
        customerId, 
        inspectionId, 
        validationResult
      );

      return {
        success: true,
        isConsistent: false,
        issues: validationResult.issues,
        analysis: analysisResult,
        canRecover: analysisResult.recoverable
      };

    } catch (error) {
      this.logger.error('Consistency validation failed', {
        customerId,
        inspectionId,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 일관성 문제 분석
   * @param {string} customerId - 고객 ID
   * @param {string} inspectionId - 검사 ID
   * @param {Object} validationResult - 검증 결과
   * @returns {Promise<Object>} 분석 결과
   */
  async analyzeInconsistencies(customerId, inspectionId, validationResult) {
    const analysis = {
      recoverable: true,
      recommendations: [],
      severity: 'LOW',
      affectedComponents: []
    };

    // 히스토리 레코드 누락 분석
    if (validationResult.issues.includes('History record not found')) {
      analysis.severity = 'HIGH';
      analysis.affectedComponents.push('InspectionHistory');
      analysis.recommendations.push('Recreate history record from available data');
      
      // 아이템 결과에서 히스토리 복구 가능한지 확인
      const itemResults = await this.getItemResultsForInspection(customerId, inspectionId);
      if (itemResults.length > 0) {
        analysis.recommendations.push('History can be reconstructed from item results');
      } else {
        analysis.recoverable = false;
        analysis.recommendations.push('No data available for recovery');
      }
    }

    // 아이템 결과 누락 분석
    if (validationResult.issues.includes('Completed inspection has no item results')) {
      analysis.severity = analysis.severity === 'HIGH' ? 'HIGH' : 'MEDIUM';
      analysis.affectedComponents.push('InspectionItemResults');
      analysis.recommendations.push('Regenerate item results from history findings');
      
      // 히스토리에서 findings 확인
      if (validationResult.historyRecord?.results?.findings?.length > 0) {
        analysis.recommendations.push('Item results can be regenerated from findings');
      }
    }

    // 타임스탬프 불일치 분석
    const timestampIssue = validationResult.issues.find(issue => 
      issue.includes('inconsistent timestamps')
    );
    if (timestampIssue) {
      analysis.severity = analysis.severity === 'HIGH' ? 'HIGH' : 'LOW';
      analysis.affectedComponents.push('Timestamps');
      analysis.recommendations.push('Synchronize timestamps across records');
    }

    return analysis;
  }

  /**
   * 데이터 일관성 복구
   * @param {string} customerId - 고객 ID
   * @param {string} inspectionId - 검사 ID
   * @param {Object} recoveryOptions - 복구 옵션
   * @returns {Promise<Object>} 복구 결과
   */
  async recoverDataConsistency(customerId, inspectionId, recoveryOptions = {}) {
    try {
      this.logger.info('Starting data consistency recovery', {
        customerId,
        inspectionId,
        options: recoveryOptions
      });

      // 현재 상태 분석
      const validationResult = await transactionService.validateDataConsistency(
        customerId, 
        inspectionId
      );

      if (validationResult.isConsistent) {
        return {
          success: true,
          message: 'Data is already consistent',
          actionsPerformed: []
        };
      }

      const recoveryActions = [];

      // 히스토리 레코드 복구
      if (validationResult.issues.includes('History record not found')) {
        const historyRecovery = await this.recoverHistoryRecord(
          customerId, 
          inspectionId, 
          recoveryOptions
        );
        recoveryActions.push(historyRecovery);
      }

      // 아이템 결과 복구
      if (validationResult.issues.includes('Completed inspection has no item results')) {
        const itemRecovery = await this.recoverItemResults(
          customerId, 
          inspectionId, 
          validationResult.historyRecord,
          recoveryOptions
        );
        recoveryActions.push(itemRecovery);
      }

      // 타임스탬프 동기화
      const timestampIssue = validationResult.issues.find(issue => 
        issue.includes('inconsistent timestamps')
      );
      if (timestampIssue) {
        const timestampSync = await this.synchronizeTimestamps(
          customerId, 
          inspectionId,
          recoveryOptions
        );
        recoveryActions.push(timestampSync);
      }

      // 복구 후 재검증
      const postRecoveryValidation = await transactionService.validateDataConsistency(
        customerId, 
        inspectionId
      );

      return {
        success: true,
        message: 'Data consistency recovery completed',
        actionsPerformed: recoveryActions,
        finalConsistencyStatus: postRecoveryValidation.isConsistent,
        remainingIssues: postRecoveryValidation.issues || []
      };

    } catch (error) {
      this.logger.error('Data consistency recovery failed', {
        customerId,
        inspectionId,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 히스토리 레코드 복구
   * @param {string} customerId - 고객 ID
   * @param {string} inspectionId - 검사 ID
   * @param {Object} options - 복구 옵션
   * @returns {Promise<Object>} 복구 결과
   */
  async recoverHistoryRecord(customerId, inspectionId, options = {}) {
    try {
      // 아이템 결과에서 정보 수집
      const itemResults = await this.getItemResultsForInspection(customerId, inspectionId);
      
      if (itemResults.length === 0) {
        return {
          action: 'recover_history',
          success: false,
          message: 'No item results available for history reconstruction'
        };
      }

      // 아이템 결과에서 히스토리 데이터 재구성
      const reconstructedHistory = this.reconstructHistoryFromItems(
        customerId,
        inspectionId,
        itemResults,
        options
      );

      // 히스토리 저장
      const saveResult = await historyService.saveInspectionHistory(reconstructedHistory);

      return {
        action: 'recover_history',
        success: saveResult.success,
        message: saveResult.success ? 
          'History record reconstructed successfully' : 
          'Failed to save reconstructed history',
        details: {
          itemsUsed: itemResults.length,
          reconstructedData: reconstructedHistory
        }
      };

    } catch (error) {
      this.logger.error('History record recovery failed', {
        customerId,
        inspectionId,
        error: error.message
      });

      return {
        action: 'recover_history',
        success: false,
        message: `History recovery failed: ${error.message}`
      };
    }
  }

  /**
   * 아이템 결과 복구
   * @param {string} customerId - 고객 ID
   * @param {string} inspectionId - 검사 ID
   * @param {Object} historyRecord - 히스토리 레코드
   * @param {Object} options - 복구 옵션
   * @returns {Promise<Object>} 복구 결과
   */
  async recoverItemResults(customerId, inspectionId, historyRecord, options = {}) {
    try {
      if (!historyRecord?.results?.findings) {
        return {
          action: 'recover_items',
          success: false,
          message: 'No findings available in history record'
        };
      }

      // findings에서 아이템 결과 재생성
      const itemResults = await inspectionItemService.processInspectionResult(
        customerId,
        inspectionId,
        {
          serviceType: historyRecord.serviceType,
          results: historyRecord.results
        }
      );

      return {
        action: 'recover_items',
        success: itemResults.success,
        message: itemResults.success ? 
          'Item results regenerated successfully' : 
          'Failed to regenerate item results',
        details: itemResults
      };

    } catch (error) {
      this.logger.error('Item results recovery failed', {
        customerId,
        inspectionId,
        error: error.message
      });

      return {
        action: 'recover_items',
        success: false,
        message: `Item recovery failed: ${error.message}`
      };
    }
  }

  /**
   * 타임스탬프 동기화
   * @param {string} customerId - 고객 ID
   * @param {string} inspectionId - 검사 ID
   * @param {Object} options - 동기화 옵션
   * @returns {Promise<Object>} 동기화 결과
   */
  async synchronizeTimestamps(customerId, inspectionId, options = {}) {
    try {
      // 히스토리 레코드의 타임스탬프를 기준으로 사용
      const historyResult = await historyService.getInspectionHistory(customerId, inspectionId);
      
      if (!historyResult.success) {
        return {
          action: 'sync_timestamps',
          success: false,
          message: 'History record not found for timestamp synchronization'
        };
      }

      const referenceTimestamp = historyResult.data.endTime || historyResult.data.timestamp;
      const itemResults = await this.getItemResultsForInspection(customerId, inspectionId);

      let syncCount = 0;
      const syncPromises = itemResults.map(async (item) => {
        if (Math.abs(item.lastInspectionTime - referenceTimestamp) > 60000) {
          // 1분 이상 차이나는 경우 동기화
          const updateResult = await this.updateItemTimestamp(
            customerId,
            item.itemKey,
            referenceTimestamp
          );
          if (updateResult.success) {
            syncCount++;
          }
          return updateResult;
        }
        return { success: true, skipped: true };
      });

      await Promise.all(syncPromises);

      return {
        action: 'sync_timestamps',
        success: true,
        message: `Synchronized ${syncCount} item timestamps`,
        details: {
          referenceTimestamp,
          itemsChecked: itemResults.length,
          itemsSynchronized: syncCount
        }
      };

    } catch (error) {
      this.logger.error('Timestamp synchronization failed', {
        customerId,
        inspectionId,
        error: error.message
      });

      return {
        action: 'sync_timestamps',
        success: false,
        message: `Timestamp sync failed: ${error.message}`
      };
    }
  }

  /**
   * 검사 ID로 아이템 결과들 조회
   * @param {string} customerId - 고객 ID
   * @param {string} inspectionId - 검사 ID
   * @returns {Promise<Array>} 아이템 결과들
   */
  async getItemResultsForInspection(customerId, inspectionId) {
    try {
      return await transactionService.getRelatedItemResults(customerId, inspectionId);
    } catch (error) {
      this.logger.error('Failed to get item results for inspection', {
        customerId,
        inspectionId,
        error: error.message
      });
      return [];
    }
  }

  /**
   * 아이템 결과에서 히스토리 재구성
   * @param {string} customerId - 고객 ID
   * @param {string} inspectionId - 검사 ID
   * @param {Array} itemResults - 아이템 결과들
   * @param {Object} options - 옵션
   * @returns {Object} 재구성된 히스토리 데이터
   */
  reconstructHistoryFromItems(customerId, inspectionId, itemResults, options = {}) {
    // 가장 최근 아이템의 타임스탬프 사용
    const latestTimestamp = Math.max(...itemResults.map(item => item.lastInspectionTime));
    
    // 모든 findings 수집
    const allFindings = [];
    itemResults.forEach(item => {
      if (item.findings && Array.isArray(item.findings)) {
        allFindings.push(...item.findings);
      }
    });

    // 요약 통계 계산
    const summary = {
      totalResources: itemResults.reduce((sum, item) => sum + (item.totalResources || 0), 0),
      criticalIssues: allFindings.filter(f => f.riskLevel === 'CRITICAL').length,
      highRiskIssues: allFindings.filter(f => f.riskLevel === 'HIGH').length,
      mediumRiskIssues: allFindings.filter(f => f.riskLevel === 'MEDIUM').length,
      lowRiskIssues: allFindings.filter(f => f.riskLevel === 'LOW').length,
      overallScore: Math.round(itemResults.reduce((sum, item) => sum + (item.score || 0), 0) / itemResults.length)
    };

    // 서비스 타입 결정 (가장 많이 나타나는 것)
    const serviceTypes = itemResults.map(item => item.serviceType);
    const serviceType = serviceTypes.reduce((a, b, i, arr) =>
      arr.filter(v => v === a).length >= arr.filter(v => v === b).length ? a : b
    );

    return {
      customerId,
      inspectionId,
      serviceType,
      status: 'COMPLETED',
      startTime: latestTimestamp - 300000, // 5분 전으로 추정
      endTime: latestTimestamp,
      duration: 300000, // 5분으로 추정
      results: {
        summary,
        findings: allFindings,
        recommendations: []
      },
      assumeRoleArn: options.assumeRoleArn || 'arn:aws:iam::unknown:role/unknown',
      metadata: {
        version: '1.0',
        reconstructed: true,
        reconstructionTimestamp: Date.now(),
        sourceItems: itemResults.length
      }
    };
  }

  /**
   * 아이템 타임스탬프 업데이트
   * @param {string} customerId - 고객 ID
   * @param {string} itemKey - 아이템 키
   * @param {number} timestamp - 새 타임스탬프
   * @returns {Promise<Object>} 업데이트 결과
   */
  async updateItemTimestamp(customerId, itemKey, timestamp) {
    try {
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
      const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
      
      const client = DynamoDBDocumentClient.from(new DynamoDBClient({
        region: process.env.AWS_REGION || 'us-east-1'
      }));

      const command = new UpdateCommand({
        TableName: 'InspectionItemResults',
        Key: {
          customerId,
          itemKey
        },
        UpdateExpression: 'SET lastInspectionTime = :timestamp, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':timestamp': timestamp,
          ':updatedAt': Date.now()
        }
      });

      await client.send(command);
      return { success: true };

    } catch (error) {
      this.logger.error('Failed to update item timestamp', {
        customerId,
        itemKey,
        timestamp,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * 로거 생성
   * @returns {Object} 로거 객체
   */
  createLogger() {
    return {
      debug: (message, meta = {}) => {
        console.log(`[DEBUG] [DataConsistencyService] ${message}`, meta);
      },
      info: (message, meta = {}) => {
        console.log(`[INFO] [DataConsistencyService] ${message}`, meta);
      },
      warn: (message, meta = {}) => {
        console.warn(`[WARN] [DataConsistencyService] ${message}`, meta);
      },
      error: (message, meta = {}) => {
        console.error(`[ERROR] [DataConsistencyService] ${message}`, meta);
      }
    };
  }
}

module.exports = new DataConsistencyService();