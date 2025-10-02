#!/usr/bin/env node

/**
 * 데이터 일관성 검증 스크립트
 * 모든 검사 결과의 데이터 일관성을 검증하고 문제가 있는 경우 복구 옵션을 제공
 */

const dataConsistencyService = require('../services/dataConsistencyService');
const historyService = require('../services/historyService');

class DataConsistencyValidator {
  constructor() {
    this.logger = this.createLogger();
    this.stats = {
      totalInspections: 0,
      consistentInspections: 0,
      inconsistentInspections: 0,
      recoveredInspections: 0,
      failedRecoveries: 0
    };
  }

  /**
   * 전체 데이터 일관성 검증 실행
   * @param {Object} options - 검증 옵션
   */
  async validateAllInspections(options = {}) {
    try {
      this.logger.info('Starting comprehensive data consistency validation');

      // 모든 고객의 검사 이력 조회
      const customers = await this.getAllCustomers();
      
      for (const customerId of customers) {
        await this.validateCustomerInspections(customerId, options);
      }

      this.printSummaryReport();

    } catch (error) {
      this.logger.error('Validation process failed', { error: error.message });
      process.exit(1);
    }
  }

  /**
   * 특정 고객의 모든 검사 검증
   * @param {string} customerId - 고객 ID
   * @param {Object} options - 검증 옵션
   */
  async validateCustomerInspections(customerId, options = {}) {
    try {
      this.logger.info('Validating inspections for customer', { customerId });

      // 고객의 모든 검사 이력 조회
      const historyResult = await historyService.getInspectionHistoryList(customerId, {
        limit: 100
      });

      if (!historyResult.success) {
        this.logger.warn('Failed to get inspection history', { 
          customerId, 
          error: historyResult.error 
        });
        return;
      }

      const inspections = historyResult.data.items;
      this.stats.totalInspections += inspections.length;

      for (const inspection of inspections) {
        await this.validateSingleInspection(
          customerId, 
          inspection.inspectionId, 
          options
        );
      }

    } catch (error) {
      this.logger.error('Customer validation failed', {
        customerId,
        error: error.message
      });
    }
  }

  /**
   * 단일 검사 검증
   * @param {string} customerId - 고객 ID
   * @param {string} inspectionId - 검사 ID
   * @param {Object} options - 검증 옵션
   */
  async validateSingleInspection(customerId, inspectionId, options = {}) {
    try {
      const validationResult = await dataConsistencyService.validateInspectionConsistency(
        customerId,
        inspectionId
      );

      if (!validationResult.success) {
        this.logger.error('Validation failed', {
          customerId,
          inspectionId,
          error: validationResult.error
        });
        return;
      }

      if (validationResult.isConsistent) {
        this.stats.consistentInspections++;
        this.logger.debug('Inspection is consistent', {
          customerId,
          inspectionId
        });
      } else {
        this.stats.inconsistentInspections++;
        this.logger.warn('Inconsistent inspection found', {
          customerId,
          inspectionId,
          issues: validationResult.issues
        });

        // 자동 복구 옵션이 활성화된 경우
        if (options.autoRecover && validationResult.canRecover) {
          await this.attemptRecovery(customerId, inspectionId, options);
        }
      }

    } catch (error) {
      this.logger.error('Single inspection validation failed', {
        customerId,
        inspectionId,
        error: error.message
      });
    }
  }

  /**
   * 데이터 일관성 복구 시도
   * @param {string} customerId - 고객 ID
   * @param {string} inspectionId - 검사 ID
   * @param {Object} options - 복구 옵션
   */
  async attemptRecovery(customerId, inspectionId, options = {}) {
    try {
      this.logger.info('Attempting data consistency recovery', {
        customerId,
        inspectionId
      });

      const recoveryResult = await dataConsistencyService.recoverDataConsistency(
        customerId,
        inspectionId,
        options.recoveryOptions || {}
      );

      if (recoveryResult.success) {
        this.stats.recoveredInspections++;
        this.logger.info('Recovery successful', {
          customerId,
          inspectionId,
          actionsPerformed: recoveryResult.actionsPerformed.length,
          finalStatus: recoveryResult.finalConsistencyStatus
        });
      } else {
        this.stats.failedRecoveries++;
        this.logger.error('Recovery failed', {
          customerId,
          inspectionId,
          error: recoveryResult.error
        });
      }

    } catch (error) {
      this.stats.failedRecoveries++;
      this.logger.error('Recovery attempt failed', {
        customerId,
        inspectionId,
        error: error.message
      });
    }
  }

  /**
   * 모든 고객 ID 조회
   * @returns {Promise<Array<string>>} 고객 ID 목록
   */
  async getAllCustomers() {
    try {
      // 실제 구현에서는 DynamoDB에서 모든 고객 ID를 조회
      // 여기서는 예시로 하드코딩된 값 사용
      const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
      const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
      const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
      
      const client = DynamoDBDocumentClient.from(new DynamoDBClient({
        region: process.env.AWS_REGION || 'us-east-1'
      }));

      const command = new ScanCommand({
        TableName: process.env.AWS_DYNAMODB_INSPECTION_HISTORY_TABLE || 'InspectionHistory',
        ProjectionExpression: 'customerId',
        Select: 'SPECIFIC_ATTRIBUTES'
      });

      const result = await client.send(command);
      const customerIds = [...new Set(result.Items.map(item => item.customerId))];
      
      this.logger.info('Found customers', { count: customerIds.length });
      return customerIds;

    } catch (error) {
      this.logger.error('Failed to get customers', { error: error.message });
      return [];
    }
  }

  /**
   * 요약 보고서 출력
   */
  printSummaryReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 DATA CONSISTENCY VALIDATION REPORT');
    console.log('='.repeat(60));
    console.log(`📋 Total Inspections Checked: ${this.stats.totalInspections}`);
    console.log(`✅ Consistent Inspections: ${this.stats.consistentInspections}`);
    console.log(`⚠️  Inconsistent Inspections: ${this.stats.inconsistentInspections}`);
    console.log(`🔧 Successfully Recovered: ${this.stats.recoveredInspections}`);
    console.log(`❌ Failed Recoveries: ${this.stats.failedRecoveries}`);
    
    const consistencyRate = this.stats.totalInspections > 0 ? 
      ((this.stats.consistentInspections + this.stats.recoveredInspections) / this.stats.totalInspections * 100).toFixed(2) : 0;
    
    console.log(`📈 Overall Consistency Rate: ${consistencyRate}%`);
    console.log('='.repeat(60));

    if (this.stats.inconsistentInspections > this.stats.recoveredInspections) {
      console.log('⚠️  Some inconsistencies remain. Consider manual intervention.');
    } else if (this.stats.inconsistentInspections === 0) {
      console.log('🎉 All inspections are consistent!');
    } else {
      console.log('✅ All inconsistencies have been resolved.');
    }
    console.log('');
  }

  /**
   * 로거 생성
   * @returns {Object} 로거 객체
   */
  createLogger() {
    return {
      debug: (message, meta = {}) => {
        if (process.env.LOG_LEVEL === 'debug') {
          console.log(`[DEBUG] ${message}`, meta);
        }
      },
      info: (message, meta = {}) => {
        console.log(`[INFO] ${message}`, meta);
      },
      warn: (message, meta = {}) => {
        console.warn(`[WARN] ${message}`, meta);
      },
      error: (message, meta = {}) => {
        console.error(`[ERROR] ${message}`, meta);
      }
    };
  }
}

// CLI 실행
async function main() {
  const args = process.argv.slice(2);
  const options = {
    autoRecover: args.includes('--auto-recover'),
    recoveryOptions: {
      assumeRoleArn: process.env.DEFAULT_ASSUME_ROLE_ARN
    }
  };

  if (args.includes('--help')) {
    console.log(`
Usage: node validate-data-consistency.js [options]

Options:
  --auto-recover    Automatically attempt to recover inconsistent data
  --help           Show this help message

Environment Variables:
  LOG_LEVEL                    Set to 'debug' for verbose logging
  DEFAULT_ASSUME_ROLE_ARN     Default ARN for recovery operations
  AWS_REGION                  AWS region (default: us-east-1)

Examples:
  node validate-data-consistency.js
  node validate-data-consistency.js --auto-recover
  LOG_LEVEL=debug node validate-data-consistency.js --auto-recover
    `);
    process.exit(0);
  }

  const validator = new DataConsistencyValidator();
  await validator.validateAllInspections(options);
}

// 스크립트가 직접 실행된 경우에만 main 함수 호출
if (require.main === module) {
  main().catch(error => {
    console.error('Script execution failed:', error);
    process.exit(1);
  });
}

module.exports = DataConsistencyValidator;