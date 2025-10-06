/**
 * IAM Inspector Main Module
 * IAM 서비스에 대한 보안 및 모범 사례 검사
 */

const BaseInspector = require('../baseInspector');
const { IAMClient } = require('@aws-sdk/client-iam');
const InspectionFinding = require('../../../models/InspectionFinding');

// 검사 항목별 모듈 import
const RootAccessKeyChecker = require('./checks/rootAccessKeyChecker');
const MfaEnabledChecker = require('./checks/mfaEnabledChecker');
const UnusedCredentialsChecker = require('./checks/unusedCredentialsChecker');
const OverprivilegedPoliciesChecker = require('./checks/overprivilegedPoliciesChecker');
const InlinePoliciesChecker = require('./checks/inlinePoliciesChecker');

// 데이터 수집 모듈
const IAMDataCollector = require('./collectors/iamDataCollector');

class IAMInspector extends BaseInspector {
  constructor(options = {}) {
    super('IAM', options);
    this.iamClient = null;
    this.dataCollector = null;

    // 검사 모듈 클래스들 저장 (인스턴스는 필요할 때 생성)
    this.checkerClasses = {
      rootAccessKey: RootAccessKeyChecker,
      mfaEnabled: MfaEnabledChecker,
      unusedCredentials: UnusedCredentialsChecker,
      overprivilegedPolicies: OverprivilegedPoliciesChecker,
      inlinePolicies: InlinePoliciesChecker
    };
  }

  /**
   * Inspector 버전 반환
   */
  getVersion() {
    return 'iam-inspector-v1.0';
  }

  /**
   * 지원하는 검사 유형 목록 반환
   */
  getSupportedInspectionTypes() {
    return [
      'root-access-key',
      'mfa-enabled',
      'unused-credentials',
      'overprivileged-policies',
      'inline-policies'
    ];
  }

  /**
   * 사전 검증
   */
  async preInspectionValidation(awsCredentials, inspectionConfig) {
    await super.preInspectionValidation(awsCredentials, inspectionConfig);
    await this.initializeIAMResources(awsCredentials);
  }

  /**
   * IAM 리소스 초기화 (클라이언트와 데이터 수집기)
   */
  async initializeIAMResources(awsCredentials) {
    // 이미 초기화된 경우 스킵
    if (this.iamClient && this.dataCollector) {
      return;
    }

    // awsCredentials가 없는 경우 performItemInspection에서 전달받은 것을 사용
    if (!awsCredentials && this.currentCredentials) {
      awsCredentials = this.currentCredentials;
    }

    if (!awsCredentials) {
      throw new Error('AWS credentials not available for IAM initialization');
    }

    // IAM 클라이언트 초기화 (IAM은 글로벌 서비스이므로 리전 불필요)
    this.iamClient = new IAMClient({
      region: 'us-east-1', // IAM은 글로벌 서비스이지만 리전 필요
      credentials: {
        accessKeyId: awsCredentials.accessKeyId,
        secretAccessKey: awsCredentials.secretAccessKey,
        sessionToken: awsCredentials.sessionToken
      }
    });

    // 데이터 수집기 초기화
    this.dataCollector = new IAMDataCollector(this.iamClient, this);

    this.logger.debug('IAM client and data collector initialized successfully');
  }

  /**
   * 개별 항목 검사 수행
   */
  async performItemInspection(awsCredentials, inspectionConfig) {
    // 자격 증명을 저장하여 나중에 사용할 수 있도록 함
    this.currentCredentials = awsCredentials;
    
    const targetItem = inspectionConfig.targetItem;
    const results = {
      users: [],
      roles: [],
      policies: [],
      findings: []
    };

    try {
      switch (targetItem) {
        case 'root-access-key':
          await this._inspectRootAccessKey(results);
          break;

        case 'mfa-enabled':
          await this._inspectMfaEnabled(results);
          break;

        case 'unused-credentials':
          await this._inspectUnusedCredentials(results);
          break;

        case 'overprivileged-policies':
          await this._inspectOverprivilegedPolicies(results);
          break;

        case 'inline-policies':
          await this._inspectInlinePolicies(results);
          break;

        default:
          // 알 수 없는 항목인 경우 오류 처리
          await this._inspectUnknownItem(results, targetItem);
          break;
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
      users: [],
      roles: [],
      policies: [],
      findings: []
    };

    try {
      // 1. 데이터 수집
      this.updateProgress('AWS IAM 정보 수집 중', 10);
      const data = await this.dataCollector.collectAllData();

      results.users = data.users;
      results.roles = data.roles;
      results.policies = data.policies;
      this.incrementResourceCount(data.users.length + data.roles.length + data.policies.length);

      // 2. 루트 계정 액세스 키 검사
      this.updateProgress('루트 계정 액세스 키 검사 중', 30);
      const rootAccessKeyChecker = new this.checkerClasses.rootAccessKey(this);
      await rootAccessKeyChecker.runAllChecks();

      // 3. MFA 활성화 검사
      this.updateProgress('MFA 활성화 검사 중', 60);
      const mfaEnabledChecker = new this.checkerClasses.mfaEnabled(this);
      await mfaEnabledChecker.runAllChecks(data.users);

      // 4. 미사용 자격 증명 검사
      this.updateProgress('미사용 자격 증명 검사 중', 90);
      const unusedCredentialsChecker = new this.checkerClasses.unusedCredentials(this);
      await unusedCredentialsChecker.runAllChecks(data.users);

      this.updateProgress('검사 완료', 100);
      results.findings = this.findings;

      return results;

    } catch (error) {
      this.recordError(error, { phase: 'performInspection' });
      throw error;
    }
  }

  // 개별 검사 메서드들
  async _inspectRootAccessKey(results) {
    this.updateProgress('루트 계정 액세스 키 검사 중', 70);
    
    // IAM 클라이언트와 데이터 수집기가 초기화되지 않은 경우 초기화
    if (!this.iamClient || !this.dataCollector) {
      await this.initializeIAMResources();
    }
    
    // 새로운 검사 인스턴스 생성
    const checker = new this.checkerClasses.rootAccessKey(this);
    await checker.runAllChecks();
    
    results.findings = this.findings;
  }

  async _inspectMfaEnabled(results) {
    this.updateProgress('IAM 사용자 조회 중', 30);
    
    // IAM 클라이언트와 데이터 수집기가 초기화되지 않은 경우 초기화
    if (!this.iamClient || !this.dataCollector) {
      await this.initializeIAMResources();
    }
    
    const users = await this.dataCollector.getUsers();
    results.users = users;
    this.incrementResourceCount(users.length);

    this.updateProgress('MFA 활성화 검사 중', 70);
    
    // 새로운 검사 인스턴스 생성
    const checker = new this.checkerClasses.mfaEnabled(this);
    await checker.runAllChecks(users);
    
    results.findings = this.findings;
  }

  async _inspectUnusedCredentials(results) {
    this.updateProgress('IAM 사용자 조회 중', 30);
    
    // IAM 클라이언트와 데이터 수집기가 초기화되지 않은 경우 초기화
    if (!this.iamClient || !this.dataCollector) {
      await this.initializeIAMResources();
    }
    
    const users = await this.dataCollector.getUsers();
    results.users = users;
    this.incrementResourceCount(users.length);

    this.updateProgress('미사용 자격 증명 검사 중', 70);
    
    // 새로운 검사 인스턴스 생성
    const checker = new this.checkerClasses.unusedCredentials(this);
    await checker.runAllChecks(users);
    
    results.findings = this.findings;
  }

  async _inspectNotImplemented(results, targetItem) {
    const finding = new InspectionFinding({
      resourceId: `not-implemented-${targetItem}`,
      resourceType: 'IAMPolicy',
      riskLevel: 'LOW',
      issue: `'${targetItem}' 검사는 아직 구현되지 않았습니다`,
      recommendation: '다른 구현된 검사 항목을 사용하거나 향후 업데이트를 기다려주세요',
      details: {
        requestedItem: targetItem,
        status: 'NOT_IMPLEMENTED',
        availableChecks: [
          'root-access-key: 루트 계정 액세스 키 검사',
          'mfa-enabled: MFA 활성화 검사',
          'unused-credentials: 미사용 자격 증명 검사'
        ],
        plannedFeatures: [
          '과도한 권한 정책 분석',
          '인라인 정책 사용 검토',
          '역할 기반 접근 제어 분석'
        ]
      },
      category: 'COMPLIANCE'
    });

    this.addFinding(finding);
    results.findings = this.findings;
  }

  async _inspectOverprivilegedPolicies(results) {
    this.updateProgress('IAM 데이터 수집 중', 30);
    
    // IAM 클라이언트와 데이터 수집기가 초기화되지 않은 경우 초기화
    if (!this.iamClient || !this.dataCollector) {
      await this.initializeIAMResources();
    }
    
    const data = await this.dataCollector.collectAllData();
    
    results.users = data.users;
    results.roles = data.roles;
    results.policies = data.policies;
    this.incrementResourceCount(data.users.length + data.roles.length + data.policies.length);

    this.updateProgress('과도한 권한 정책 검사 중', 70);
    
    // 새로운 검사 인스턴스 생성
    const checker = new this.checkerClasses.overprivilegedPolicies(this);
    await checker.runAllChecks(data.users, data.roles, data.policies);
    
    results.findings = this.findings;
  }

  async _inspectInlinePolicies(results) {
    this.updateProgress('IAM 데이터 수집 중', 30);
    
    // IAM 클라이언트와 데이터 수집기가 초기화되지 않은 경우 초기화
    if (!this.iamClient || !this.dataCollector) {
      await this.initializeIAMResources();
    }
    
    const data = await this.dataCollector.collectAllData();
    
    results.users = data.users;
    results.roles = data.roles;
    results.policies = data.policies;
    this.incrementResourceCount(data.users.length + data.roles.length + data.policies.length);

    this.updateProgress('인라인 정책 검사 중', 70);
    
    // 새로운 검사 인스턴스 생성
    const checker = new this.checkerClasses.inlinePolicies(this);
    await checker.runAllChecks(data.users, data.roles, data.policies);
    
    results.findings = this.findings;
  }

  async _inspectUnknownItem(results, targetItem) {
    const finding = new InspectionFinding({
      resourceId: `unknown-item-${targetItem}`,
      resourceType: 'IAMGeneral',
      riskLevel: 'LOW',
      issue: `알 수 없는 검사 항목 '${targetItem}'이 요청되었습니다`,
      recommendation: '지원되는 검사 항목 중에서 선택하세요',
      details: {
        requestedItem: targetItem,
        status: 'UNKNOWN_ITEM',
        supportedItems: [
          'root-access-key',
          'mfa-enabled', 
          'unused-credentials',
          'overprivileged-policies',
          'inline-policies'
        ],
        troubleshooting: [
          '검사 항목 이름 확인',
          '지원되는 항목 목록 참조',
          '최신 버전 사용 확인'
        ]
      },
      category: 'COMPLIANCE'
    });

    this.addFinding(finding);
    results.findings = this.findings;
  }

  /**
   * 서비스별 특화 권장사항
   */
  getServiceSpecificRecommendations() {
    const recommendations = [];
    
    if (!this.findings || this.findings.length === 0) {
      return recommendations;
    }

    const riskGroups = InspectionFinding.groupByRiskLevel(this.findings);

    if (riskGroups.CRITICAL && riskGroups.CRITICAL.length > 0) {
      recommendations.push('루트 계정 보안을 즉시 강화하세요.');
      recommendations.push('모든 관리자 계정에 MFA를 활성화하세요.');
    }

    if (riskGroups.HIGH && riskGroups.HIGH.length > 0) {
      recommendations.push('과도한 권한을 가진 정책을 검토하고 최소 권한 원칙을 적용하세요.');
      recommendations.push('사용자 계정의 MFA 활성화를 강제하세요.');
    }

    if (riskGroups.MEDIUM && riskGroups.MEDIUM.length > 0) {
      recommendations.push('미사용 자격 증명을 정기적으로 정리하세요.');
      recommendations.push('인라인 정책을 관리형 정책으로 변환하세요.');
    }

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

    if (this.metadata && this.metadata.usersAnalyzed) {
      completedChecks.push('IAM Users Analysis');
    }
    if (this.metadata && this.metadata.rolesAnalyzed) {
      completedChecks.push('IAM Roles Analysis');
    }
    if (this.metadata && this.metadata.policiesAnalyzed) {
      completedChecks.push('IAM Policies Analysis');
    }

    return completedChecks;
  }
}

module.exports = IAMInspector;