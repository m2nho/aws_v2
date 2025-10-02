/**
 * Example Inspector Implementation
 * BaseInspector 사용법을 보여주는 예제 Inspector
 * 실제 프로덕션에서는 사용하지 않음
 */

const BaseInspector = require('./baseInspector');
const InspectionFinding = require('../../models/InspectionFinding');

class ExampleInspector extends BaseInspector {
  constructor(serviceType, options = {}) {
    super(serviceType || 'Example', options);
  }

  /**
   * 실제 검사 수행 (예제 구현)
   * @param {Object} awsCredentials - AWS 자격 증명
   * @param {Object} inspectionConfig - 검사 설정
   * @returns {Promise<Object>} 검사 원시 결과
   */
  async performInspection(awsCredentials, inspectionConfig) {
    this.logger.info('Starting example inspection');

    // 1단계: 리소스 목록 조회 시뮬레이션
    this.updateProgress('Fetching resources', 10);
    const resources = await this.simulateResourceFetch();

    // 2단계: 각 리소스 분석
    this.updateProgress('Analyzing resources', 30);
    for (let i = 0; i < resources.length; i++) {
      const resource = resources[i];
      this.incrementResourceCount();
      
      // 리소스 분석 시뮬레이션
      await this.analyzeResource(resource);
      
      // 진행률 업데이트
      const progress = 30 + Math.round((i + 1) / resources.length * 60);
      this.updateProgress(`Analyzing resource ${i + 1}/${resources.length}`, progress);
    }

    // 3단계: 결과 정리
    this.updateProgress('Finalizing results', 95);
    
    this.logger.info('Example inspection completed', {
      resourcesAnalyzed: resources.length,
      findingsGenerated: this.findings.length
    });

    return {
      resourcesAnalyzed: resources.length,
      analysisComplete: true
    };
  }

  /**
   * 리소스 목록 조회 시뮬레이션
   * @returns {Promise<Array>} 모의 리소스 목록
   */
  async simulateResourceFetch() {
    // API 호출 시뮬레이션
    await this.sleep(100);
    
    return [
      { id: 'resource-1', type: 'ExampleType', config: { secure: false } },
      { id: 'resource-2', type: 'ExampleType', config: { secure: true } },
      { id: 'resource-3', type: 'ExampleType', config: { secure: false, deprecated: true } },
      { id: 'resource-4', type: 'ExampleType', config: { secure: true } },
      { id: 'resource-5', type: 'ExampleType', config: { secure: false, publicAccess: true } }
    ];
  }

  /**
   * 개별 리소스 분석
   * @param {Object} resource - 분석할 리소스
   */
  async analyzeResource(resource) {
    try {
      // 보안 설정 검사
      if (!resource.config.secure) {
        const riskLevel = resource.config.publicAccess ? 'CRITICAL' : 'HIGH';
        
        const finding = new InspectionFinding({
          resourceId: resource.id,
          resourceType: resource.type,
          riskLevel,
          issue: '리소스가 안전하지 않은 설정으로 구성되어 있습니다',
          recommendation: '보안 설정을 활성화하시기 바랍니다',
          details: {
            resourceConfig: resource.config,
            securityIssues: ['insecure_configuration']
          },
          category: 'SECURITY'
        });

        this.addFinding(finding);
      }

      // 사용 중단 예정 기능 검사
      if (resource.config.deprecated) {
        const finding = new InspectionFinding({
          resourceId: resource.id,
          resourceType: resource.type,
          riskLevel: 'MEDIUM',
          issue: '사용 중단 예정인 기능을 사용하고 있습니다',
          recommendation: '최신 기능으로 마이그레이션하시기 바랍니다',
          details: {
            deprecatedFeatures: ['legacy_api']
          },
          category: 'COMPLIANCE'
        });

        this.addFinding(finding);
      }

      // 분석 지연 시뮬레이션
      await this.sleep(50);

    } catch (error) {
      this.recordError(error, { resourceId: resource.id });
    }
  }

  /**
   * 사전 검증 (오버라이드 예제)
   * @param {Object} awsCredentials - AWS 자격 증명
   * @param {Object} inspectionConfig - 검사 설정
   */
  async preInspectionValidation(awsCredentials, inspectionConfig) {
    await super.preInspectionValidation(awsCredentials, inspectionConfig);
    
    // 예제별 추가 검증
    if (inspectionConfig.exampleMode && inspectionConfig.exampleMode !== 'demo') {
      throw new Error('Invalid example mode specified');
    }

    this.logger.debug('Example inspector pre-validation completed');
  }

  /**
   * Inspector 버전 반환
   * @returns {string} 버전 정보
   */
  getVersion() {
    return 'example-inspector-v1.0';
  }

  /**
   * 지원하는 검사 유형 목록
   * @returns {Array<string>} 검사 유형 목록
   */
  getSupportedInspectionTypes() {
    return [
      'security-check',
      'compliance-check',
      'configuration-review'
    ];
  }

  /**
   * 서비스별 특화 권장사항
   * @returns {Array<string>} 권장사항 목록
   */
  getServiceSpecificRecommendations() {
    const recommendations = [];
    
    const securityFindings = this.findings.filter(f => f.category === 'SECURITY');
    const complianceFindings = this.findings.filter(f => f.category === 'COMPLIANCE');

    if (securityFindings.length > 0) {
      recommendations.push('보안 설정을 정기적으로 검토하고 업데이트하시기 바랍니다.');
    }

    if (complianceFindings.length > 0) {
      recommendations.push('규정 준수를 위해 사용 중단 예정 기능들을 최신 버전으로 교체하시기 바랍니다.');
    }

    if (this.metadata.resourcesScanned > 10) {
      recommendations.push('리소스 수가 많으므로 자동화된 모니터링 도구 사용을 고려하시기 바랍니다.');
    }

    return recommendations;
  }
}

module.exports = ExampleInspector;