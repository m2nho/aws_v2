/**
 * EC2 Inspector Main Module
 * EC2 서비스에 대한 보안 및 모범 사례 검사
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

const BaseInspector = require('../baseInspector');
const { EC2Client } = require('@aws-sdk/client-ec2');

// 검사 항목별 모듈 import
const SecurityGroupChecker = require('./checks/securityGroupChecker');
const InstanceSecurityChecker = require('./checks/instanceSecurityChecker');
const NetworkAccessChecker = require('./checks/networkAccessChecker');
const MetadataChecker = require('./checks/metadataChecker');
const KeyPairChecker = require('./checks/keyPairChecker');

// 데이터 수집 모듈
const EC2DataCollector = require('./collectors/ec2DataCollector');

class EC2Inspector extends BaseInspector {
  constructor(options = {}) {
    super('EC2', options);
    this.ec2Client = null;
    this.dataCollector = null;

    // 검사 모듈들 초기화
    this.checkers = {
      securityGroup: new SecurityGroupChecker(this),
      instanceSecurity: new InstanceSecurityChecker(this),
      networkAccess: new NetworkAccessChecker(this),
      metadata: new MetadataChecker(this),
      keyPair: new KeyPairChecker(this)
    };
  }

  /**
   * Inspector 버전 반환
   */
  getVersion() {
    return 'ec2-inspector-v2.0';
  }

  /**
   * 지원하는 검사 유형 목록 반환
   */
  getSupportedInspectionTypes() {
    return [
      'security-groups',
      'instance-security',
      'network-configuration',
      'access-control',
      'metadata-service',
      'key-management'
    ];
  }

  /**
   * 사전 검증
   */
  async preInspectionValidation(awsCredentials, inspectionConfig) {
    await super.preInspectionValidation(awsCredentials, inspectionConfig);

    // EC2 클라이언트 초기화
    this.ec2Client = new EC2Client({
      region: awsCredentials.region || 'us-east-1',
      credentials: {
        accessKeyId: awsCredentials.accessKeyId,
        secretAccessKey: awsCredentials.secretAccessKey,
        sessionToken: awsCredentials.sessionToken
      }
    });

    // 데이터 수집기 초기화
    this.dataCollector = new EC2DataCollector(this.ec2Client, this);

    this.logger.debug('EC2 client and data collector initialized successfully');
  }

  /**
   * 개별 항목 검사 수행
   */
  async performItemInspection(awsCredentials, inspectionConfig) {
    const targetItem = inspectionConfig.targetItem;
    const results = {
      securityGroups: [],
      instances: [],
      findings: []
    };

    try {
      switch (targetItem) {
        case 'security_groups':
          await this._inspectSecurityGroups(results);
          break;

        case 'security_group_management':
          await this._inspectSecurityGroupManagement(results);
          break;

        case 'key_pairs':
          await this._inspectKeyPairs(results);
          break;

        case 'instance_metadata':
          await this._inspectInstanceMetadata(results);
          break;

        case 'public_access':
          await this._inspectPublicAccess(results);
          break;

        case 'network_access':
          await this._inspectNetworkAccess(results);
          break;

        default:
          // 알 수 없는 항목인 경우 전체 검사로 폴백
          return this.performInspection(awsCredentials, inspectionConfig);
      }

      this.updateProgress('분석 완료 중', 95);
      results.findings = this.findings;
      return results;

    } catch (error) {
      this.recordError(error, { targetItem });
      throw error;
    }
  }

  /**
   * 전체 검사 수행
   */
  async performInspection(awsCredentials, inspectionConfig) {
    const results = {
      securityGroups: [],
      instances: [],
      findings: []
    };

    try {
      // 1. 데이터 수집
      this.updateProgress('AWS 리소스 정보 수집 중', 10);
      const data = await this.dataCollector.collectAllData();

      results.securityGroups = data.securityGroups;
      results.instances = data.instances;
      this.incrementResourceCount(data.securityGroups.length + data.instances.length);

      // 2. 보안 그룹 검사
      this.updateProgress('보안 그룹 분석 중', 25);
      await this.checkers.securityGroup.runAllChecks(data.securityGroups);

      // 3. 인스턴스 보안 검사
      this.updateProgress('인스턴스 보안 분석 중', 45);
      await this.checkers.instanceSecurity.runAllChecks(data.instances);

      // 4. 메타데이터 서비스 검사
      this.updateProgress('메타데이터 서비스 분석 중', 65);
      await this.checkers.metadata.runAllChecks(data.instances);

      // 5. 네트워크 접근성 검사
      this.updateProgress('네트워크 접근성 분석 중', 80);
      await this.checkers.networkAccess.runAllChecks(data.instances, data.securityGroups);

      // 6. 키 페어 검사
      this.updateProgress('키 페어 분석 중', 90);
      await this.checkers.keyPair.runAllChecks(data.instances);

      this.updateProgress('검사 완료', 100);
      results.findings = this.findings;

      return results;

    } catch (error) {
      this.recordError(error, { phase: 'performInspection' });
      throw error;
    }
  }

  // 개별 검사 메서드들
  async _inspectSecurityGroups(results) {
    this.updateProgress('보안 그룹 조회 중', 20);
    const securityGroups = await this.dataCollector.getSecurityGroups();
    results.securityGroups = securityGroups;
    this.incrementResourceCount(securityGroups.length);

    this.updateProgress('보안 그룹 규칙 분석 중', 60);
    await this.checkers.securityGroup.checkSecurityRules(securityGroups);
  }

  async _inspectSecurityGroupManagement(results) {
    this.updateProgress('보안 그룹 조회 중', 20);
    const securityGroups = await this.dataCollector.getSecurityGroups();
    results.securityGroups = securityGroups;
    this.incrementResourceCount(securityGroups.length);

    this.updateProgress('보안 그룹 관리 상태 분석 중', 60);
    await this.checkers.securityGroup.checkManagementStatus(securityGroups);
  }

  async _inspectKeyPairs(results) {
    console.log('🔍 [EC2Inspector] Starting key pairs inspection');
    this.updateProgress('인스턴스 조회 중', 30);
    const instances = await this.dataCollector.getEC2Instances();
    results.instances = instances;
    this.incrementResourceCount(instances.length);
    console.log('🔍 [EC2Inspector] Found instances:', instances.length);

    this.updateProgress('키 페어 분석 중', 70);
    console.log('🔍 [EC2Inspector] Before keyPair check, findings count:', this.findings.length);
    await this.checkers.keyPair.runAllChecks(instances);
    console.log('🔍 [EC2Inspector] After keyPair check, findings count:', this.findings.length);
  }

  async _inspectInstanceMetadata(results) {
    console.log('🔍 [EC2Inspector] Starting instance metadata inspection');
    this.updateProgress('EC2 인스턴스 조회 중', 30);
    const instances = await this.dataCollector.getEC2Instances();
    results.instances = instances;
    this.incrementResourceCount(instances.length);
    console.log('🔍 [EC2Inspector] Found instances:', instances.length);

    this.updateProgress('인스턴스 메타데이터 분석 중', 70);
    console.log('🔍 [EC2Inspector] Before metadata check, findings count:', this.findings.length);
    await this.checkers.metadata.runAllChecks(instances);
    console.log('🔍 [EC2Inspector] After metadata check, findings count:', this.findings.length);
  }

  async _inspectPublicAccess(results) {
    this.updateProgress('리소스 조회 중', 25);
    const [securityGroups, instances] = await Promise.all([
      this.dataCollector.getSecurityGroups(),
      this.dataCollector.getEC2Instances()
    ]);

    results.securityGroups = securityGroups;
    results.instances = instances;
    this.incrementResourceCount(securityGroups.length + instances.length);

    this.updateProgress('퍼블릭 접근 분석 중', 75);
    await this.checkers.networkAccess.checkPublicAccess(instances, securityGroups);
  }

  async _inspectNetworkAccess(results) {
    this.updateProgress('네트워크 구성 조회 중', 30);
    const [securityGroups, instances] = await Promise.all([
      this.dataCollector.getSecurityGroups(),
      this.dataCollector.getEC2Instances()
    ]);

    results.securityGroups = securityGroups;
    results.instances = instances;
    this.incrementResourceCount(securityGroups.length + instances.length);

    this.updateProgress('네트워크 접근 분석 중', 80);
    await this.checkers.networkAccess.runAllChecks(instances, securityGroups);
  }

  /**
   * 서비스별 특화 권장사항
   */
  getServiceSpecificRecommendations() {
    const recommendations = [];

    // 각 검사 모듈에서 권장사항 수집
    Object.values(this.checkers).forEach(checker => {
      if (checker.getRecommendations) {
        recommendations.push(...checker.getRecommendations(this.findings));
      }
    });

    return recommendations;
  }

  /**
   * 부분적 결과 반환
   */
  getPartialResults() {
    if (this.findings.length === 0) {
      return null;
    }

    const summary = {
      totalResources: this.resourceCount,
      criticalIssues: this.findings.filter(f => f.riskLevel === 'CRITICAL').length,
      highRiskIssues: this.findings.filter(f => f.riskLevel === 'HIGH').length,
      mediumRiskIssues: this.findings.filter(f => f.riskLevel === 'MEDIUM').length,
      lowRiskIssues: this.findings.filter(f => f.riskLevel === 'LOW').length,
      overallScore: this.calculateOverallScore(),
      partial: true,
      completedChecks: this.getCompletedChecks()
    };

    return {
      summary,
      findings: this.findings.map(f => f.toApiResponse ? f.toApiResponse() : f),
      recommendations: this.getServiceSpecificRecommendations(),
      metadata: {
        partial: true,
        completedAt: Date.now(),
        resourcesScanned: this.resourceCount,
        checksCompleted: this.getCompletedChecks().length
      }
    };
  }

  /**
   * 완료된 검사 항목들 반환
   */
  getCompletedChecks() {
    const completedChecks = [];

    if (this.metadata && this.metadata.securityGroupsAnalyzed) {
      completedChecks.push('Security Groups Analysis');
    }
    if (this.metadata && this.metadata.instancesAnalyzed) {
      completedChecks.push('EC2 Instances Analysis');
    }
    if (this.metadata && this.metadata.networkAnalyzed) {
      completedChecks.push('Network Configuration Analysis');
    }

    return completedChecks;
  }
}

module.exports = EC2Inspector;