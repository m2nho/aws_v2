/**
 * Base Inspector Class
 * 모든 AWS 서비스 검사 모듈의 기본 클래스
 * Requirements: 4.1, 4.3, 4.4
 */

const InspectionResult = require('../../models/InspectionResult');
const InspectionFinding = require('../../models/InspectionFinding');
const { v4: uuidv4 } = require('uuid');

class BaseInspector {
  constructor(serviceType, options = {}) {
    this.serviceType = serviceType;
    this.options = {
      timeout: 300000, // 5분 기본 타임아웃
      maxRetries: 3,
      retryDelay: 1000,
      ...options
    };
    this.logger = this.createLogger();
    this.findings = [];
    this.errors = [];
    this.metadata = {
      inspectorVersion: this.getVersion(),
      startTime: null,
      endTime: null,
      resourcesScanned: 0
    };
  }

  /**
   * 검사 실행 메인 메서드 (추상 메서드)
   * 하위 클래스에서 반드시 구현해야 함
   * @param {Object} awsCredentials - AWS 자격 증명
   * @param {Object} inspectionConfig - 검사 설정
   * @returns {Promise<InspectionResult>} 검사 결과
   */
  async inspect(awsCredentials, inspectionConfig) {
    throw new Error('inspect() method must be implemented by subclass');
  }

  /**
   * 개별 항목 검사 실행 템플릿 메서드
   * @param {string} customerId - 고객 ID
   * @param {string} inspectionId - 검사 ID
   * @param {Object} awsCredentials - AWS 자격 증명
   * @param {Object} inspectionConfig - 검사 설정
   * @returns {Promise<InspectionResult>} 검사 결과
   */
  async executeItemInspection(customerId, inspectionId, awsCredentials, inspectionConfig = {}) {
    const inspectionResult = new InspectionResult({
      customerId,
      inspectionId,
      serviceType: this.serviceType,
      status: 'IN_PROGRESS',
      assumeRoleArn: awsCredentials.roleArn,
      metadata: {
        ...this.metadata,
        inspectorVersion: this.getVersion(),
        targetItem: inspectionConfig.targetItem,
        itemName: inspectionConfig.itemName
      }
    });

    try {
      this.logger.info(`Starting ${this.serviceType} item inspection`, {
        customerId,
        inspectionId,
        serviceType: this.serviceType,
        targetItem: inspectionConfig.targetItem
      });

      // 개별 검사 시작 시 findings 배열 초기화
      this.findings = [];
      this.errors = [];
      this.metadata.startTime = Date.now();

      // 사전 검증
      await this.preInspectionValidation(awsCredentials, inspectionConfig);

      // 개별 항목 검사 실행
      const results = await this.performItemInspection(awsCredentials, inspectionConfig);

      // 사후 처리
      await this.postInspectionProcessing(results);

      this.metadata.endTime = Date.now();

      // 검사 결과 완료 처리
      const finalResults = this.buildFinalResults(results);
      inspectionResult.complete(finalResults);

      this.logger.info(`Completed ${this.serviceType} item inspection`, {
        customerId,
        inspectionId,
        targetItem: inspectionConfig.targetItem,
        duration: inspectionResult.duration,
        resourcesScanned: this.metadata.resourcesScanned,
        findingsCount: this.findings.length
      });

      return inspectionResult;

    } catch (error) {
      this.metadata.endTime = Date.now();

      this.logger.error(`Failed ${this.serviceType} item inspection`, {
        customerId,
        inspectionId,
        targetItem: inspectionConfig.targetItem,
        error: error.message,
        stack: error.stack
      });

      inspectionResult.fail(error.message);
      return inspectionResult;
    }
  }

  /**
   * 검사 실행 템플릿 메서드
   * 공통 검사 플로우를 정의하고 하위 클래스의 구체적인 검사 로직을 호출
   * @param {string} customerId - 고객 ID
   * @param {string} inspectionId - 검사 ID (이미 생성된 ID 사용)
   * @param {Object} awsCredentials - AWS 자격 증명
   * @param {Object} inspectionConfig - 검사 설정
   * @returns {Promise<InspectionResult>} 검사 결과
   */
  async executeInspection(customerId, inspectionId, awsCredentials, inspectionConfig = {}) {
    const inspectionResult = new InspectionResult({
      customerId,
      inspectionId, // 전달받은 inspectionId 사용
      serviceType: this.serviceType,
      status: 'IN_PROGRESS',
      assumeRoleArn: awsCredentials.roleArn,
      metadata: {
        ...this.metadata,
        inspectorVersion: this.getVersion()
      }
    });

    try {
      this.logger.info(`Starting ${this.serviceType} inspection`, {
        customerId,
        inspectionId,
        serviceType: this.serviceType
      });

      // 전체 검사 시작 시 findings 배열 초기화
      this.findings = [];
      this.errors = [];
      this.metadata.startTime = Date.now();

      // 사전 검증
      await this.preInspectionValidation(awsCredentials, inspectionConfig);

      // 실제 검사 실행
      const results = await this.performInspection(awsCredentials, inspectionConfig);

      // 사후 처리
      await this.postInspectionProcessing(results);

      this.metadata.endTime = Date.now();

      // 검사 결과 완료 처리
      const finalResults = this.buildFinalResults(results);
      inspectionResult.complete(finalResults);

      this.logger.info(`Completed ${this.serviceType} inspection`, {
        customerId,
        inspectionId,
        duration: inspectionResult.duration,
        resourcesScanned: this.metadata.resourcesScanned,
        findingsCount: this.findings.length
      });

      return inspectionResult;

    } catch (error) {
      this.metadata.endTime = Date.now();

      this.logger.error(`Failed ${this.serviceType} inspection`, {
        customerId,
        inspectionId,
        error: error.message,
        stack: error.stack
      });

      // 부분 결과라도 반환하도록 처리
      const partialResults = this.buildPartialResults(error);
      inspectionResult.fail(error.message);
      inspectionResult.results = partialResults;

      return inspectionResult;
    }
  }

  /**
   * 사전 검증 (하위 클래스에서 오버라이드 가능)
   * @param {Object} awsCredentials - AWS 자격 증명
   * @param {Object} inspectionConfig - 검사 설정
   */
  async preInspectionValidation(awsCredentials, inspectionConfig) {
    // AWS 자격 증명 검증
    if (!awsCredentials || !awsCredentials.accessKeyId || !awsCredentials.secretAccessKey) {
      throw new Error('Invalid AWS credentials provided');
    }

    // 기본 검증 로직
    this.logger.debug('Pre-inspection validation completed');
  }

  /**
   * 실제 검사 수행 (하위 클래스에서 구현)
   * @param {Object} awsCredentials - AWS 자격 증명
   * @param {Object} inspectionConfig - 검사 설정
   * @returns {Promise<Object>} 검사 원시 결과
   */
  async performInspection(awsCredentials, inspectionConfig) {
    throw new Error('performInspection() method must be implemented by subclass');
  }

  /**
   * 개별 항목 검사 수행 (추상 메서드)
   * 하위 클래스에서 구현 가능 (선택사항)
   * @param {Object} awsCredentials - AWS 자격 증명
   * @param {Object} inspectionConfig - 검사 설정
   * @returns {Promise<Object>} 검사 원시 결과
   */
  async performItemInspection(awsCredentials, inspectionConfig) {
    // 기본적으로 전체 검사로 폴백
    return this.performInspection(awsCredentials, inspectionConfig);
  }

  /**
   * 사후 처리 (하위 클래스에서 오버라이드 가능)
   * @param {Object} results - 검사 원시 결과
   */
  async postInspectionProcessing(results) {
    // 기본 사후 처리 로직
    this.logger.debug('Post-inspection processing completed');
  }

  /**
   * 최종 검사 결과 구성
   * @param {Object} rawResults - 원시 검사 결과
   * @returns {Object} 표준화된 검사 결과
   */
  buildFinalResults(rawResults) {
    const summary = InspectionFinding.generateSummary(this.findings);

    return {
      summary: {
        totalResources: this.metadata.resourcesScanned,
        highRiskIssues: summary.highRiskIssues,
        mediumRiskIssues: summary.mediumRiskIssues,
        lowRiskIssues: summary.lowRiskIssues,
        criticalIssues: summary.criticalIssues,
        score: this.calculateOverallScore(summary),
        categories: summary.categories
      },
      findings: this.findings.map(finding => finding.toApiResponse()),
      metadata: {
        ...this.metadata,
        duration: this.metadata.endTime - this.metadata.startTime,
        errorsEncountered: this.errors.length
      },
      recommendations: this.generateRecommendations()
    };
  }

  /**
   * 부분 결과 구성 (오류 발생 시)
   * @param {Error} error - 발생한 오류
   * @returns {Object} 부분 검사 결과
   */
  buildPartialResults(error) {
    const summary = InspectionFinding.generateSummary(this.findings);

    return {
      summary: {
        totalResources: this.metadata.resourcesScanned,
        highRiskIssues: summary.highRiskIssues,
        mediumRiskIssues: summary.mediumRiskIssues,
        lowRiskIssues: summary.lowRiskIssues,
        criticalIssues: summary.criticalIssues,
        score: 0, // 오류 시 점수는 0
        categories: summary.categories
      },
      findings: this.findings.map(finding => finding.toApiResponse()),
      error: {
        message: error.message,
        type: error.constructor.name,
        timestamp: Date.now()
      },
      metadata: {
        ...this.metadata,
        duration: this.metadata.endTime - this.metadata.startTime,
        errorsEncountered: this.errors.length,
        partialResults: true
      },
      recommendations: this.generateRecommendations()
    };
  }

  /**
   * Finding 추가
   * @param {InspectionFinding} finding - 검사 결과 항목
   */
  addFinding(finding) {
    if (!(finding instanceof InspectionFinding)) {
      throw new Error('Finding must be an instance of InspectionFinding');
    }

    const validation = finding.validate();
    if (!validation.isValid) {
      throw new Error(`Invalid finding: ${validation.errors.join(', ')}`);
    }

    this.findings.push(finding);
    this.logger.debug('Finding added', {
      resourceId: finding.resourceId,
      riskLevel: finding.riskLevel,
      issue: finding.issue
    });
  }

  /**
   * 오류 기록
   * @param {Error} error - 오류 객체
   * @param {Object} context - 추가 컨텍스트 정보
   */
  recordError(error, context = {}) {
    const errorRecord = {
      message: error.message,
      type: error.constructor.name,
      timestamp: Date.now(),
      context
    };

    this.errors.push(errorRecord);
    this.logger.error('Error recorded during inspection', errorRecord);
  }

  /**
   * 전체 점수 계산
   * @param {Object} summary - 검사 요약
   * @returns {number} 전체 점수 (0-100)
   */
  calculateOverallScore(summary) {
    if (summary.totalFindings === 0) {
      return 100; // 문제가 없으면 만점
    }

    // 위험도별 가중치
    const weights = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1
    };

    const totalWeightedIssues =
      (summary.criticalIssues * weights.critical) +
      (summary.highRiskIssues * weights.high) +
      (summary.mediumRiskIssues * weights.medium) +
      (summary.lowRiskIssues * weights.low);

    // 리소스 대비 가중 이슈 비율로 점수 계산
    const maxPossibleScore = this.metadata.resourcesScanned * weights.critical;
    const score = Math.max(0, 100 - Math.round((totalWeightedIssues / maxPossibleScore) * 100));

    return Math.min(100, score);
  }

  /**
   * 권장사항 생성
   * @returns {Array<string>} 권장사항 목록
   */
  generateRecommendations() {
    const recommendations = [];
    const riskGroups = InspectionFinding.groupByRiskLevel(this.findings);

    if (riskGroups.CRITICAL && riskGroups.CRITICAL.length > 0) {
      recommendations.push('즉시 조치가 필요한 심각한 보안 문제가 발견되었습니다.');
    }

    if (riskGroups.HIGH && riskGroups.HIGH.length > 0) {
      recommendations.push('높은 위험도의 문제들을 우선적으로 해결하시기 바랍니다.');
    }

    if (riskGroups.MEDIUM && riskGroups.MEDIUM.length > 0) {
      recommendations.push('중간 위험도 문제들도 계획적으로 개선하시기 바랍니다.');
    }

    // 서비스별 특화 권장사항은 하위 클래스에서 추가
    const serviceSpecificRecommendations = this.getServiceSpecificRecommendations();
    recommendations.push(...serviceSpecificRecommendations);

    return recommendations;
  }

  /**
   * 서비스별 특화 권장사항 (하위 클래스에서 오버라이드)
   * @returns {Array<string>} 서비스별 권장사항
   */
  getServiceSpecificRecommendations() {
    return [];
  }

  /**
   * 재시도 로직이 포함된 AWS API 호출
   * @param {Function} apiCall - AWS API 호출 함수
   * @param {string} operationName - 작업 이름 (로깅용)
   * @returns {Promise<any>} API 호출 결과
   */
  async retryableApiCall(apiCall, operationName) {
    let lastError;

    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      try {
        this.logger.debug(`Attempting ${operationName}`, { attempt });
        const result = await apiCall();
        return result;
      } catch (error) {
        lastError = error;

        if (attempt === this.options.maxRetries) {
          this.logger.error(`Failed ${operationName} after ${attempt} attempts`, {
            error: error.message
          });
          break;
        }

        // 재시도 가능한 오류인지 확인
        if (this.isRetryableError(error)) {
          this.logger.warn(`Retrying ${operationName} after error`, {
            attempt,
            error: error.message,
            retryDelay: this.options.retryDelay
          });

          await this.sleep(this.options.retryDelay * attempt);
        } else {
          // 재시도 불가능한 오류는 즉시 throw
          throw error;
        }
      }
    }

    throw lastError;
  }

  /**
   * 재시도 가능한 오류인지 판단
   * @param {Error} error - 오류 객체
   * @returns {boolean} 재시도 가능 여부
   */
  isRetryableError(error) {
    const retryableErrorCodes = [
      'Throttling',
      'ThrottlingException',
      'RequestLimitExceeded',
      'ServiceUnavailable',
      'InternalServerError',
      'NetworkingError'
    ];

    return retryableErrorCodes.some(code =>
      error.code === code || (error.message && error.message.includes(code))
    );
  }

  /**
   * 지연 함수
   * @param {number} ms - 지연 시간 (밀리초)
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
        console.warn(`[WARN] [${this.serviceType}Inspector] ${message}`, meta);
      },
      error: (message, meta = {}) => {
        console.error(`[ERROR] [${this.serviceType}Inspector] ${message}`, meta);
      }
    };
  }

  /**
   * Inspector 버전 반환 (하위 클래스에서 오버라이드)
   * @returns {string} 버전 정보
   */
  getVersion() {
    return 'base-inspector-v1.0';
  }

  /**
   * 지원하는 검사 유형 목록 반환 (하위 클래스에서 구현)
   * @returns {Array<string>} 검사 유형 목록
   */
  getSupportedInspectionTypes() {
    return [];
  }

  /**
   * Inspector 정보 반환
   * @returns {Object} Inspector 정보
   */
  getInspectorInfo() {
    return {
      serviceType: this.serviceType,
      version: this.getVersion(),
      supportedInspectionTypes: this.getSupportedInspectionTypes(),
      options: this.options
    };
  }

  /**
   * 리소스 카운트 증가
   * @param {number} count - 증가할 카운트 (기본값: 1)
   */
  incrementResourceCount(count = 1) {
    this.metadata.resourcesScanned += count;
  }

  /**
   * 진행 상황 업데이트 (향상된 버전)
   * @param {string} currentStep - 현재 진행 단계
   * @param {number} progress - 진행률 (0-100)
   * @param {Object} additionalData - 추가 진행률 데이터
   */
  updateProgress(currentStep, progress, additionalData = {}) {
    // 메타데이터 업데이트
    this.metadata.currentStep = currentStep;
    this.metadata.progress = progress;
    this.metadata.lastUpdated = Date.now();

    // 추가 데이터 병합
    if (additionalData.resourcesProcessed !== undefined) {
      this.metadata.resourcesProcessed = additionalData.resourcesProcessed;
    }
    if (additionalData.totalResources !== undefined) {
      this.metadata.totalResources = additionalData.totalResources;
    }
    if (additionalData.stepDetails) {
      this.metadata.stepDetails = additionalData.stepDetails;
    }

    this.logger.info('Inspection progress update', {
      currentStep,
      progress: `${progress}%`,
      resourcesScanned: this.metadata.resourcesScanned,
      resourcesProcessed: this.metadata.resourcesProcessed,
      totalResources: this.metadata.totalResources,
      stepDetails: additionalData.stepDetails
    });

    // 진행률 콜백이 설정된 경우 호출
    if (this.progressCallback) {
      this.progressCallback({
        currentStep,
        progress,
        resourcesScanned: this.metadata.resourcesScanned,
        ...additionalData
      });
    }
  }

  /**
   * 진행률 콜백 설정
   * @param {Function} callback - 진행률 업데이트 콜백 함수
   */
  setProgressCallback(callback) {
    this.progressCallback = callback;
  }
}

module.exports = BaseInspector;