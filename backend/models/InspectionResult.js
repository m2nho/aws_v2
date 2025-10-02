/**
 * Inspection Result Data Model
 * 검사 결과 데이터 모델 인터페이스 정의
 * Requirements: 1.1, 2.3, 5.1
 */

class InspectionResult {
  constructor({
    customerId,
    inspectionId,
    serviceType,
    status = 'PENDING',
    startTime = Date.now(),
    endTime = null,
    duration = null,
    results = null,
    assumeRoleArn,
    metadata = {}
  }) {
    this.customerId = customerId;
    this.inspectionId = inspectionId;
    this.serviceType = serviceType;
    this.status = status;
    this.startTime = startTime;
    this.endTime = endTime;
    this.duration = duration;
    this.results = results;
    this.assumeRoleArn = assumeRoleArn;
    this.metadata = {
      version: '1.0',
      ...metadata
    };
  }

  /**
   * 검사 완료 시 호출되는 메서드
   * @param {Object} results - 검사 결과 객체
   */
  complete(results) {
    this.endTime = Date.now();
    this.duration = this.endTime - this.startTime;
    this.status = 'COMPLETED';
    this.results = results;
  }

  /**
   * 검사 실패 시 호출되는 메서드
   * @param {string} errorMessage - 오류 메시지
   */
  fail(errorMessage) {
    this.endTime = Date.now();
    this.duration = this.endTime - this.startTime;
    this.status = 'FAILED';
    this.results = {
      error: errorMessage,
      summary: {
        totalResources: 0,
        highRiskIssues: 0,
        mediumRiskIssues: 0,
        lowRiskIssues: 0,
        score: 0
      },
      findings: []
    };
  }

  /**
   * DynamoDB 저장을 위한 객체 변환
   * @returns {Object} DynamoDB 저장 형식
   */
  toDynamoDBItem() {
    return {
      customerId: this.customerId,
      inspectionId: this.inspectionId,
      serviceType: this.serviceType,
      status: this.status,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.duration,
      results: this.results ? JSON.stringify(this.results) : null,
      assumeRoleArn: this.assumeRoleArn,
      metadata: JSON.stringify(this.metadata)
    };
  }

  /**
   * DynamoDB 아이템에서 객체 생성
   * @param {Object} item - DynamoDB 아이템
   * @returns {InspectionResult} InspectionResult 인스턴스
   */
  static fromDynamoDBItem(item) {
    return new InspectionResult({
      customerId: item.customerId,
      inspectionId: item.inspectionId,
      serviceType: item.serviceType,
      status: item.status,
      startTime: item.startTime,
      endTime: item.endTime,
      duration: item.duration,
      results: item.results ? JSON.parse(item.results) : null,
      assumeRoleArn: item.assumeRoleArn,
      metadata: item.metadata ? JSON.parse(item.metadata) : {}
    });
  }

  /**
   * 검사 결과 유효성 검증
   * @returns {Object} 유효성 검증 결과
   */
  validate() {
    const errors = [];

    if (!this.customerId) {
      errors.push('customerId is required');
    }

    if (!this.inspectionId) {
      errors.push('inspectionId is required');
    }

    if (!this.serviceType) {
      errors.push('serviceType is required');
    }

    if (!this.assumeRoleArn) {
      errors.push('assumeRoleArn is required');
    }

    const validStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'];
    if (!validStatuses.includes(this.status)) {
      errors.push(`status must be one of: ${validStatuses.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

module.exports = InspectionResult;