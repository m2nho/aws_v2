/**
 * IAM Overprivileged Role Policies Checker
 * 과도한 권한을 가진 IAM 역할 정책 검사
 */

const InspectionFinding = require('../../../../models/InspectionFinding');
const { 
  ListAttachedRolePoliciesCommand,
  GetPolicyCommand,
  GetPolicyVersionCommand
} = require('@aws-sdk/client-iam');

class OverprivilegedRolePoliciesChecker {
  constructor(inspector) {
    this.inspector = inspector;
    this.logger = inspector.logger;
  }

  /**
   * 모든 역할 과도한 권한 검사 실행
   */
  async runAllChecks(roles, policies) {
    try {
      this.logger.debug('Starting overprivileged role policies checks');
      
      await this.checkRolePolicies(roles, policies);
      
      this.logger.debug('Completed overprivileged role policies checks');
    } catch (error) {
      this.logger.error('Error in overprivileged role policies checks:', error);
      this.inspector.recordError(error, { 
        phase: 'overprivilegedRolePoliciesCheck',
        context: 'OverprivilegedRolePoliciesChecker.runAllChecks'
      });
      throw error;
    }
  }

  /**
   * 역할 과도한 권한 정책 검사
   */
  async checkRolePolicies(roles, policies) {
    const allRoles = roles || [];

    if (allRoles.length === 0) {
      const finding = new InspectionFinding({
        resourceId: 'no-iam-roles-policies',
        resourceType: 'IAMRole',
        riskLevel: 'PASS',
        issue: '역할 과도한 권한 검사 - 통과 (역할 없음)',
        recommendation: 'IAM 역할 생성 시 최소 권한 원칙을 적용하세요',
        details: {
          totalRoles: 0,
          status: '현재 역할 과도한 권한 관련 위험이 없습니다'
        },
        category: 'COMPLIANCE'
      });

      this.inspector.addFinding(finding);
      return;
    }

    // 각 역할별 정책 검사
    for (const role of allRoles) {
      try {
        // 역할 관리형 정책 검사
        await this.checkRoleAttachedPolicies(role);

        // 서비스 역할 권한 검사
        await this.checkServiceRolePrivileges(role);

      } catch (error) {
        this.inspector.recordError(error, {
          operation: 'checkRolePolicies',
          roleName: role.RoleName
        });
      }
    }

    this.logger.debug(`Role policies check completed for ${allRoles.length} roles`);
  }

  /**
   * 역할 연결된 관리형 정책 검사
   */
  async checkRoleAttachedPolicies(role) {
    try {
      const command = new ListAttachedRolePoliciesCommand({
        RoleName: role.RoleName
      });
      const response = await this.inspector.iamClient.send(command);
      const attachedPolicies = response.AttachedPolicies || [];

      // 위험한 정책들 확인
      const dangerousPolicies = attachedPolicies.filter(policy => 
        this.isDangerousPolicy(policy.PolicyName)
      );

      if (dangerousPolicies.length > 0) {
        const finding = new InspectionFinding({
          resourceId: `${role.RoleName}-dangerous-policies`,
          resourceType: 'IAMRole',
          riskLevel: 'HIGH',
          issue: `역할 '${role.RoleName}'에 위험한 정책 연결: ${dangerousPolicies.map(p => `${p.PolicyName} (${this.getPolicyRiskReason(p.PolicyName)})`).join(', ')}`,
          recommendation: `위험한 정책들을 제거하고 필요한 최소 권한만 부여하세요: ${dangerousPolicies.map(p => p.PolicyName).join(', ')}`,
          details: {
            roleName: role.RoleName,
            dangerousPolicies: dangerousPolicies.map(policy => ({
              policyName: policy.PolicyName,
              policyArn: policy.PolicyArn,
              riskLevel: this.getPolicyRiskLevel(policy.PolicyName),
              reason: this.getPolicyRiskReason(policy.PolicyName)
            })),
            roleType: this.getRoleType(role),
            trustPolicy: role.AssumeRolePolicyDocument ? 'Present' : 'Missing',
            totalAttachedPolicies: attachedPolicies.length,
            securityConcerns: [
              '과도한 권한으로 인한 보안 위험',
              '역할 탈취 시 광범위한 피해',
              '서비스 간 권한 남용',
              '컴플라이언스 위반'
            ],
            remediationSteps: [
              'IAM 콘솔에서 역할 정책 검토',
              '위험한 정책 분리',
              '서비스별 최소 권한 정책 생성',
              '정기적인 역할 권한 검토'
            ]
          },
          category: 'SECURITY'
        });

        this.inspector.addFinding(finding);
      }

      // 너무 많은 정책이 연결된 경우
      if (attachedPolicies.length > 10) {
        const finding = new InspectionFinding({
          resourceId: `${role.RoleName}-too-many-policies`,
          resourceType: 'IAMRole',
          riskLevel: 'MEDIUM',
          issue: `역할 '${role.RoleName}'에 ${attachedPolicies.length}개의 정책이 연결되어 관리가 복잡합니다`,
          recommendation: '유사한 권한을 가진 정책들을 통합하거나 역할을 분리하세요',
          details: {
            roleName: role.RoleName,
            attachedPoliciesCount: attachedPolicies.length,
            attachedPolicies: attachedPolicies.map(policy => policy.PolicyName),
            managementIssues: [
              '권한 추적 어려움',
              '정책 변경 시 영향 분석 복잡',
              '감사 및 컴플라이언스 검토 어려움',
              '권한 중복 가능성'
            ],
            bestPractices: [
              '역할별 명확한 책임 분리',
              '서비스별 전용 역할 사용',
              '정책 통합 및 단순화',
              '정기적인 권한 정리'
            ]
          },
          category: 'SECURITY'
        });

        this.inspector.addFinding(finding);
      }

    } catch (error) {
      this.inspector.recordError(error, { 
        operation: 'checkRoleAttachedPolicies', 
        roleName: role.RoleName 
      });
    }
  }

  /**
   * 서비스 역할 권한 검사
   */
  async checkServiceRolePrivileges(role) {
    const isServiceRole = role.RoleName.includes('service') || 
                         role.RoleName.includes('lambda') || 
                         role.RoleName.includes('ec2') ||
                         role.RoleName.includes('ecs') ||
                         role.RoleName.includes('rds');

    if (isServiceRole) {
      const finding = new InspectionFinding({
        resourceId: `${role.RoleName}-service-role`,
        resourceType: 'IAMRole',
        riskLevel: 'LOW',
        issue: `서비스 역할 '${role.RoleName}'의 권한 검토가 권장됩니다`,
        recommendation: '서비스 역할이 필요한 최소 권한만 가지고 있는지 정기적으로 검토하세요',
        details: {
          roleName: role.RoleName,
          roleType: 'SERVICE_ROLE',
          createDate: this.formatDate(role.CreateDate),
          serviceRoleBestPractices: [
            '서비스별 전용 역할 사용',
            '최소 권한 원칙 적용',
            '리소스별 권한 제한',
            '정기적인 권한 검토'
          ],
          monitoringRecommendations: [
            'CloudTrail을 통한 역할 사용 추적',
            '비정상적인 API 호출 모니터링',
            '권한 사용 패턴 분석',
            '정기적인 액세스 검토'
          ],
          securityConsiderations: [
            '역할 신뢰 정책 검토',
            '외부 ID 사용 검토',
            '조건부 접근 제어 적용',
            '세션 지속 시간 제한'
          ]
        },
        category: 'COMPLIANCE'
      });

      this.inspector.addFinding(finding);
    }

    // 크로스 계정 역할 검사
    if (role.AssumeRolePolicyDocument) {
      try {
        const trustPolicy = JSON.parse(decodeURIComponent(role.AssumeRolePolicyDocument));
        const hasCrossAccountAccess = this.checkCrossAccountAccess(trustPolicy);
        
        if (hasCrossAccountAccess) {
          const finding = new InspectionFinding({
            resourceId: `${role.RoleName}-cross-account`,
            resourceType: 'IAMRole',
            riskLevel: 'MEDIUM',
            issue: `역할 '${role.RoleName}'이 크로스 계정 액세스를 허용합니다`,
            recommendation: '크로스 계정 액세스가 필요한지 검토하고 외부 ID를 사용하세요',
            details: {
              roleName: role.RoleName,
              crossAccountAccess: true,
              securityRisks: [
                '외부 계정의 무단 액세스',
                '권한 남용 가능성',
                '감사 추적 복잡성',
                '컴플라이언스 위험'
              ],
              securityMeasures: [
                '외부 ID 사용 필수',
                '조건부 접근 제어 적용',
                'MFA 요구 조건 추가',
                '정기적인 신뢰 관계 검토'
              ]
            },
            category: 'SECURITY'
          });

          this.inspector.addFinding(finding);
        }
      } catch (error) {
        this.logger.error(`역할 ${role.RoleName}의 신뢰 정책 분석 실패:`, error);
      }
    }
  }

  /**
   * 크로스 계정 액세스 확인
   */
  checkCrossAccountAccess(trustPolicy) {
    const statements = trustPolicy.Statement || [];
    
    return statements.some(statement => {
      if (statement.Effect === 'Allow' && statement.Principal) {
        if (statement.Principal.AWS) {
          const principals = Array.isArray(statement.Principal.AWS) 
            ? statement.Principal.AWS 
            : [statement.Principal.AWS];
          
          return principals.some(principal => 
            typeof principal === 'string' && 
            principal.includes('arn:aws:iam::') && 
            !principal.includes('root')
          );
        }
      }
      return false;
    });
  }

  /**
   * 위험한 정책 여부 확인
   */
  isDangerousPolicy(policyName) {
    const dangerousPolicies = [
      'AdministratorAccess',
      'PowerUserAccess',
      'IAMFullAccess',
      'AmazonS3FullAccess',
      'AmazonEC2FullAccess',
      'AmazonRDSFullAccess',
      'AmazonVPCFullAccess'
    ];

    return dangerousPolicies.some(dangerous => 
      policyName.includes(dangerous)
    );
  }

  /**
   * 정책 위험도 반환
   */
  getPolicyRiskLevel(policyName) {
    if (policyName.includes('AdministratorAccess')) return 'CRITICAL';
    if (policyName.includes('PowerUserAccess')) return 'HIGH';
    if (policyName.includes('FullAccess')) return 'HIGH';
    return 'MEDIUM';
  }

  /**
   * 정책 위험 이유 반환
   */
  getPolicyRiskReason(policyName) {
    if (policyName.includes('AdministratorAccess')) {
      return '모든 AWS 서비스와 리소스에 대한 완전한 액세스 권한';
    }
    if (policyName.includes('PowerUserAccess')) {
      return 'IAM을 제외한 모든 AWS 서비스에 대한 완전한 액세스 권한';
    }
    if (policyName.includes('FullAccess')) {
      return '특정 서비스에 대한 완전한 액세스 권한';
    }
    return '광범위한 권한 부여';
  }

  /**
   * 역할 타입 반환
   */
  getRoleType(role) {
    const roleName = role.RoleName.toLowerCase();
    if (roleName.includes('service')) return 'SERVICE_ROLE';
    if (roleName.includes('lambda')) return 'LAMBDA_EXECUTION_ROLE';
    if (roleName.includes('ec2')) return 'EC2_INSTANCE_ROLE';
    if (roleName.includes('ecs')) return 'ECS_TASK_ROLE';
    if (roleName.includes('rds')) return 'RDS_SERVICE_ROLE';
    return 'CUSTOM_ROLE';
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
    
    const rolePolicyFindings = findings.filter(f => 
      f.resourceType === 'IAMRole' && 
      (f.issue.includes('정책') || f.issue.includes('권한'))
    );

    if (rolePolicyFindings.length > 0) {
      const highRiskFindings = rolePolicyFindings.filter(f => f.riskLevel === 'HIGH');
      if (highRiskFindings.length > 0) {
        recommendations.push('위험한 역할 정책을 제거하고 최소 권한 원칙을 적용하세요.');
        recommendations.push('서비스별 전용 역할을 사용하여 권한을 분리하세요.');
      }

      const serviceRoleFindings = rolePolicyFindings.filter(f => 
        f.issue.includes('서비스 역할') || f.details?.roleType?.includes('SERVICE')
      );
      if (serviceRoleFindings.length > 0) {
        recommendations.push('서비스 역할의 권한을 정기적으로 검토하고 최소화하세요.');
      }

      const crossAccountFindings = rolePolicyFindings.filter(f => 
        f.issue.includes('크로스 계정') || f.details?.crossAccountAccess
      );
      if (crossAccountFindings.length > 0) {
        recommendations.push('크로스 계정 역할에 외부 ID와 조건부 접근 제어를 적용하세요.');
      }
    }

    return recommendations;
  }
}

module.exports = OverprivilegedRolePoliciesChecker;