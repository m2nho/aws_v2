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
      'overprivileged-user-policies',
      'overprivileged-role-policies',
      'inline-policies',
      'unused-policies'
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

        case 'overprivileged-user-policies':
          await this._inspectOverprivilegedUserPolicies(results);
          break;

        case 'overprivileged-role-policies':
          await this._inspectOverprivilegedRolePolicies(results);
          break;

        case 'inline-policies':
          await this._inspectInlinePolicies(results);
          break;

        case 'unused-policies':
          await this._inspectUnusedPolicies(results);
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

  async _inspectOverprivilegedUserPolicies(results) {
    this.updateProgress('IAM 사용자 데이터 수집 중', 30);

    // IAM 클라이언트와 데이터 수집기가 초기화되지 않은 경우 초기화
    if (!this.iamClient || !this.dataCollector) {
      await this.initializeIAMResources();
    }

    const data = await this.dataCollector.collectAllData();

    results.users = data.users;
    results.policies = data.policies;
    this.incrementResourceCount(data.users.length + data.policies.length);

    this.updateProgress('사용자 과도한 권한 정책 검사 중', 70);

    // 새로운 검사 인스턴스 생성 - 사용자만 검사
    const checker = new this.checkerClasses.overprivilegedPolicies(this);
    await checker.runUserChecks(data.users, data.policies);

    results.findings = this.findings;
  }

  async _inspectOverprivilegedRolePolicies(results) {
    this.updateProgress('IAM 역할 데이터 수집 중', 30);

    // IAM 클라이언트와 데이터 수집기가 초기화되지 않은 경우 초기화
    if (!this.iamClient || !this.dataCollector) {
      await this.initializeIAMResources();
    }

    const data = await this.dataCollector.collectAllData();

    results.roles = data.roles;
    results.policies = data.policies;
    this.incrementResourceCount(data.roles.length + data.policies.length);

    this.updateProgress('역할 과도한 권한 정책 검사 중', 70);

    // 새로운 검사 인스턴스 생성 - 역할만 검사
    const checker = new this.checkerClasses.overprivilegedPolicies(this);
    await checker.runRoleChecks(data.roles, data.policies);

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

  async _inspectUnusedPolicies(results) {
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

    this.updateProgress('사용되지 않는 정책 검사 중', 70);

    // 사용되지 않는 정책 검사 수행
    this.checkUnusedPolicies(data.users, data.roles, data.policies);

    results.findings = this.findings;
  }

  checkUnusedPolicies(users, roles, policies) {
    if (!policies || policies.length === 0) {
      const finding = new InspectionFinding({
        resourceId: 'no-policies',
        resourceType: 'IAMPolicy',
        riskLevel: 'PASS',
        issue: '사용되지 않는 정책 검사 - 통과 (정책 없음)',
        recommendation: '정책 생성 시 명확한 명명 규칙과 사용 목적을 문서화하세요',
        details: {
          totalPolicies: 0,
          status: '현재 사용되지 않는 정책 관련 위험이 없습니다'
        },
        category: 'COMPLIANCE'
      });

      this.addFinding(finding);
      return;
    }

    // 사용자 관리형 정책만 검사 (AWS 관리형 정책 제외)
    const customerManagedPolicies = policies.filter(policy =>
      !policy.Arn.includes('aws:policy/')
    );

    if (customerManagedPolicies.length === 0) {
      const finding = new InspectionFinding({
        resourceId: 'no-customer-policies',
        resourceType: 'IAMPolicy',
        riskLevel: 'PASS',
        issue: '사용되지 않는 정책 검사 - 통과 (고객 관리형 정책 없음)',
        recommendation: '고객 관리형 정책 생성 시 정기적인 사용 현황 검토를 계획하세요',
        details: {
          totalPolicies: policies.length,
          customerManagedPolicies: 0,
          awsManagedPolicies: policies.length,
          status: '고객 관리형 정책이 없어 미사용 정책 위험이 없습니다'
        },
        category: 'COMPLIANCE'
      });

      this.addFinding(finding);
      return;
    }

    // 연결된 정책들 수집
    const attachedPolicyArns = new Set();

    // 사용자에게 연결된 정책들
    users.forEach(user => {
      if (user.AttachedManagedPolicies) {
        user.AttachedManagedPolicies.forEach(policy => {
          attachedPolicyArns.add(policy.PolicyArn);
        });
      }
    });

    // 역할에게 연결된 정책들
    roles.forEach(role => {
      if (role.AttachedManagedPolicies) {
        role.AttachedManagedPolicies.forEach(policy => {
          attachedPolicyArns.add(policy.PolicyArn);
        });
      }
    });

    // 사용되지 않는 정책들 찾기
    const unusedPolicies = customerManagedPolicies.filter(policy =>
      !attachedPolicyArns.has(policy.Arn)
    );

    // 각 사용되지 않는 정책에 대한 결과 생성
    unusedPolicies.forEach(policy => {
      const createDate = new Date(policy.CreateDate);
      const daysSinceCreation = Math.floor((Date.now() - createDate.getTime()) / (1000 * 60 * 60 * 24));

      let riskLevel = 'LOW';
      if (daysSinceCreation >= 90) {
        riskLevel = 'MEDIUM'; // 90일 이상 미사용
      }

      const finding = new InspectionFinding({
        resourceId: policy.PolicyName,
        resourceType: 'IAMPolicy',
        riskLevel: riskLevel,
        issue: `정책 '${policy.PolicyName}'이 ${daysSinceCreation}일 동안 사용되지 않고 있습니다`,
        recommendation: '사용하지 않는 정책을 삭제하여 계정을 정리하고 관리 복잡성을 줄이세요',
        details: {
          policyName: policy.PolicyName,
          policyArn: policy.Arn,
          createDate: this.formatDate(policy.CreateDate),
          updateDate: this.formatDate(policy.UpdateDate),
          daysSinceCreation: daysSinceCreation,
          attachmentCount: 0,
          status: '미사용 정책',
          cleanupBenefits: [
            '계정 정리 및 관리 단순화',
            '의도치 않은 정책 연결 방지',
            '보안 위험 감소',
            '정책 관리 효율성 향상'
          ],
          deletionSteps: [
            '정책 사용 여부 최종 확인',
            '정책 내용 백업 (필요시)',
            'IAM 콘솔에서 정책 삭제',
            '정책 삭제 로그 기록'
          ],
          precautions: [
            '삭제 전 정책 내용 검토',
            '향후 사용 가능성 확인',
            '관련 팀과 삭제 계획 협의',
            '백업 및 복구 계획 수립'
          ]
        },
        category: 'COST'
      });

      this.addFinding(finding);
    });

    // 사용되지 않는 정책이 없는 경우
    if (unusedPolicies.length === 0) {
      const finding = new InspectionFinding({
        resourceId: 'all-policies-used',
        resourceType: 'IAMPolicy',
        riskLevel: 'PASS',
        issue: '사용되지 않는 정책 검사 - 통과',
        recommendation: '모든 고객 관리형 정책이 사용되고 있습니다. 정기적인 정책 사용 현황 검토를 계속하세요.',
        details: {
          totalPolicies: policies.length,
          customerManagedPolicies: customerManagedPolicies.length,
          awsManagedPolicies: policies.length - customerManagedPolicies.length,
          unusedPolicies: 0,
          status: '모든 정책이 활발히 사용 중',
          managementTips: [
            '새 정책 생성 시 명확한 목적 정의',
            '정기적인 정책 사용 현황 검토',
            '정책 명명 규칙 준수',
            '정책 생성 시 태그 활용'
          ]
        },
        category: 'COMPLIANCE'
      });

      this.addFinding(finding);
    }
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
          'overprivileged-user-policies',
          'overprivileged-role-policies',
          'inline-policies',
          'unused-policies',
          'unused-policies'
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
  /**
   * 날짜를 안전하게 ISO 문자열로 변환
   */
  formatDate(date) {
    if (!date) return null;
    if (typeof date === 'string') return date;
    if (date instanceof Date) return date.toISOString();
    if (typeof date.toISOString === 'function') return date.toISOString();
    return date.toString();
  }
}

module.exports = IAMInspector;