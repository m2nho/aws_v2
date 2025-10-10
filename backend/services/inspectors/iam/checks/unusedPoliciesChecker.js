/**
 * IAM Unused Policies Checker
 * 사용되지 않는 IAM 정책 검사
 */

const InspectionFinding = require('../../../../models/InspectionFinding');

class UnusedPoliciesChecker {
  constructor(inspector) {
    this.inspector = inspector;
    this.logger = inspector.logger;
  }

  /**
   * 모든 미사용 정책 검사 실행
   */
  async runAllChecks(users, roles, policies) {
    try {
      this.logger.debug('Starting unused policies checks');
      
      await this.checkUnusedPolicies(users, roles, policies);
      
      this.logger.debug('Completed unused policies checks');
    } catch (error) {
      this.logger.error('Error in unused policies checks:', error);
      this.inspector.recordError(error, { 
        phase: 'unusedPoliciesCheck',
        context: 'UnusedPoliciesChecker.runAllChecks'
      });
      throw error;
    }
  }

  /**
   * 미사용 정책 검사
   */
  async checkUnusedPolicies(users, roles, policies) {
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

      this.inspector.addFinding(finding);
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

      this.inspector.addFinding(finding);
      return;
    }

    // 연결된 정책들 수집
    const attachedPolicyArns = new Set();

    // 사용자에게 연결된 정책들
    if (users && Array.isArray(users)) {
      users.forEach(user => {
        if (user.AttachedManagedPolicies) {
          user.AttachedManagedPolicies.forEach(policy => {
            attachedPolicyArns.add(policy.PolicyArn);
          });
        }
      });
    }

    // 역할에게 연결된 정책들
    if (roles && Array.isArray(roles)) {
      roles.forEach(role => {
        if (role.AttachedManagedPolicies) {
          role.AttachedManagedPolicies.forEach(policy => {
            attachedPolicyArns.add(policy.PolicyArn);
          });
        }
      });
    }

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
        riskLevel = 'MEDIUM';
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
          status: '미사용 정책'
        },
        category: 'COST'
      });

      this.inspector.addFinding(finding);
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
          status: '모든 정책이 활발히 사용 중'
        },
        category: 'COMPLIANCE'
      });

      this.inspector.addFinding(finding);
    }

    this.logger.debug(`Unused policies check completed. Found ${unusedPolicies.length} unused policies out of ${customerManagedPolicies.length} customer managed policies`);
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

  /**
   * 검사별 권장사항 반환
   */
  getRecommendations(findings) {
    const recommendations = [];
    
    const unusedPolicyFindings = findings.filter(f => 
      f.resourceType === 'IAMPolicy' && 
      f.details && 
      f.details.status === '미사용 정책'
    );

    if (unusedPolicyFindings.length > 0) {
      recommendations.push('미사용 정책을 정기적으로 검토하고 삭제하여 계정을 정리하세요.');
      recommendations.push('정책 생성 시 명확한 명명 규칙과 사용 목적을 문서화하세요.');
      
      if (unusedPolicyFindings.length > 5) {
        recommendations.push('대량의 미사용 정책이 발견되었습니다. 정책 관리 프로세스를 개선하세요.');
      }
    }

    return recommendations;
  }
}

module.exports = UnusedPoliciesChecker;