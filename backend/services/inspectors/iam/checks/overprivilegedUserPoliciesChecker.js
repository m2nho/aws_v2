/**
 * IAM Overprivileged User Policies Checker
 * 과도한 권한을 가진 IAM 사용자 정책 검사
 */

const InspectionFinding = require('../../../../models/InspectionFinding');
const { 
  ListAttachedUserPoliciesCommand,
  ListUserPoliciesCommand,
  GetUserPolicyCommand
} = require('@aws-sdk/client-iam');

class OverprivilegedUserPoliciesChecker {
  constructor(inspector) {
    this.inspector = inspector;
    this.logger = inspector.logger;
  }

  /**
   * 모든 사용자 과도한 권한 검사 실행
   */
  async runAllChecks(users, policies) {
    try {
      this.logger.debug('Starting overprivileged user policies checks');
      
      await this.checkUserPolicies(users, policies);
      
      this.logger.debug('Completed overprivileged user policies checks');
    } catch (error) {
      this.logger.error('Error in overprivileged user policies checks:', error);
      this.inspector.recordError(error, { 
        phase: 'overprivilegedUserPoliciesCheck',
        context: 'OverprivilegedUserPoliciesChecker.runAllChecks'
      });
      throw error;
    }
  }

  /**
   * 사용자 과도한 권한 정책 검사
   */
  async checkUserPolicies(users, policies) {
    const allUsers = users || [];

    if (allUsers.length === 0) {
      const finding = new InspectionFinding({
        resourceId: 'no-iam-users-policies',
        resourceType: 'IAMUser',
        riskLevel: 'PASS',
        issue: '사용자 과도한 권한 검사 - 통과 (사용자 없음)',
        recommendation: 'IAM 사용자 생성 시 최소 권한 원칙을 적용하세요',
        details: {
          totalUsers: 0,
          status: '현재 사용자 과도한 권한 관련 위험이 없습니다'
        },
        category: 'COMPLIANCE'
      });

      this.inspector.addFinding(finding);
      return;
    }

    // 각 사용자별 정책 검사
    for (const user of allUsers) {
      try {
        // 사용자 관리형 정책 검사
        await this.checkUserAttachedPolicies(user);

        // 사용자 인라인 정책 검사
        await this.checkUserInlinePolicies(user);

        // 관리자 권한 사용자 검사
        await this.checkAdminPrivileges(user);

      } catch (error) {
        this.inspector.recordError(error, {
          operation: 'checkUserPolicies',
          userName: user.UserName
        });
      }
    }

    this.logger.debug(`User policies check completed for ${allUsers.length} users`);
  }

  /**
   * 사용자 연결된 관리형 정책 검사
   */
  async checkUserAttachedPolicies(user) {
    try {
      const command = new ListAttachedUserPoliciesCommand({
        UserName: user.UserName
      });
      const response = await this.inspector.iamClient.send(command);
      const attachedPolicies = response.AttachedPolicies || [];

      // 위험한 정책들 확인
      const dangerousPolicies = attachedPolicies.filter(policy => 
        this.isDangerousPolicy(policy.PolicyName)
      );

      if (dangerousPolicies.length > 0) {
        const finding = new InspectionFinding({
          resourceId: `${user.UserName}-dangerous-policies`,
          resourceType: 'IAMUser',
          riskLevel: 'HIGH',
          issue: `사용자 '${user.UserName}'에 위험한 정책 연결: ${dangerousPolicies.map(p => `${p.PolicyName} (${this.getPolicyRiskReason(p.PolicyName)})`).join(', ')}`,
          recommendation: `위험한 정책들을 제거하고 필요한 최소 권한만 부여하세요: ${dangerousPolicies.map(p => p.PolicyName).join(', ')}`,
          details: {
            userName: user.UserName,
            dangerousPolicies: dangerousPolicies.map(policy => ({
              policyName: policy.PolicyName,
              policyArn: policy.PolicyArn,
              riskLevel: this.getPolicyRiskLevel(policy.PolicyName),
              reason: this.getPolicyRiskReason(policy.PolicyName)
            })),
            totalAttachedPolicies: attachedPolicies.length,
            securityRisks: [
              '과도한 권한으로 인한 보안 위험 증가',
              '실수로 인한 리소스 삭제 가능성',
              '권한 남용 위험',
              '컴플라이언스 위반 가능성'
            ],
            remediationSteps: [
              'IAM 콘솔에서 사용자 정책 검토',
              '위험한 정책 분리',
              '필요한 권한만 포함하는 커스텀 정책 생성',
              '정기적인 권한 검토 수행'
            ]
          },
          category: 'SECURITY'
        });

        this.inspector.addFinding(finding);
      }

      // 너무 많은 정책이 연결된 경우
      if (attachedPolicies.length > 5) {
        const finding = new InspectionFinding({
          resourceId: `${user.UserName}-too-many-policies`,
          resourceType: 'IAMUser',
          riskLevel: 'MEDIUM',
          issue: `사용자 '${user.UserName}'에 ${attachedPolicies.length}개의 정책이 연결되어 관리가 복잡합니다`,
          recommendation: '유사한 권한을 가진 정책들을 통합하거나 IAM 그룹을 사용하세요',
          details: {
            userName: user.UserName,
            attachedPoliciesCount: attachedPolicies.length,
            attachedPolicies: attachedPolicies.map(policy => policy.PolicyName),
            managementIssues: [
              '권한 추적 어려움',
              '정책 변경 시 영향 분석 복잡',
              '감사 및 컴플라이언스 검토 어려움',
              '권한 중복 가능성'
            ],
            bestPractices: [
              'IAM 그룹을 통한 권한 관리',
              '역할 기반 접근 제어 사용',
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
        operation: 'checkUserAttachedPolicies', 
        userName: user.UserName 
      });
    }
  }

  /**
   * 사용자 인라인 정책 검사
   */
  async checkUserInlinePolicies(user) {
    try {
      const command = new ListUserPoliciesCommand({
        UserName: user.UserName
      });
      const response = await this.inspector.iamClient.send(command);
      const inlinePolicies = response.PolicyNames || [];

      if (inlinePolicies.length > 0) {
        // 각 인라인 정책의 내용 검사
        for (const policyName of inlinePolicies) {
          try {
            const policyCommand = new GetUserPolicyCommand({
              UserName: user.UserName,
              PolicyName: policyName
            });
            const policyResponse = await this.inspector.iamClient.send(policyCommand);
            const policyDocument = JSON.parse(decodeURIComponent(policyResponse.PolicyDocument));

            // 위험한 권한 확인
            const dangerousActions = this.findDangerousActions(policyDocument);
            
            if (dangerousActions.length > 0) {
              const finding = new InspectionFinding({
                resourceId: `${user.UserName}-inline-${policyName}`,
                resourceType: 'IAMUser',
                riskLevel: 'HIGH',
                issue: `사용자 '${user.UserName}'의 인라인 정책 '${policyName}'에 위험한 권한이 포함되어 있습니다`,
                recommendation: '위험한 권한을 제거하거나 더 제한적인 조건을 추가하세요',
                details: {
                  userName: user.UserName,
                  policyName: policyName,
                  dangerousActions: dangerousActions,
                  policyType: 'INLINE',
                  riskFactors: [
                    '광범위한 권한 부여',
                    '리소스 제한 없음',
                    '조건부 접근 제어 부족',
                    '권한 남용 가능성'
                  ],
                  securityImprovements: [
                    '최소 권한 원칙 적용',
                    '리소스별 권한 제한',
                    '조건부 접근 제어 추가',
                    '관리형 정책으로 전환'
                  ]
                },
                category: 'SECURITY'
              });

              this.inspector.addFinding(finding);
            }
          } catch (policyError) {
            this.logger.error(`인라인 정책 ${policyName} 분석 실패:`, policyError);
          }
        }
      }

    } catch (error) {
      this.inspector.recordError(error, { 
        operation: 'checkUserInlinePolicies', 
        userName: user.UserName 
      });
    }
  }

  /**
   * 관리자 권한 사용자 검사
   */
  async checkAdminPrivileges(user) {
    const userName = user.UserName.toLowerCase();
    const isAdminUser = this.isAdminUser(userName);

    if (isAdminUser) {
      const finding = new InspectionFinding({
        resourceId: `${user.UserName}-admin-privileges`,
        resourceType: 'IAMUser',
        riskLevel: 'MEDIUM',
        issue: `관리자 권한을 가진 사용자 '${user.UserName}'의 권한 검토가 필요합니다`,
        recommendation: '관리자 권한 사용자는 MFA를 활성화하고 정기적으로 권한을 검토하세요',
        details: {
          userName: user.UserName,
          adminIndicators: this.getAdminIndicators(userName),
          securityRequirements: [
            'MFA 필수 활성화',
            '강력한 암호 정책',
            '정기적인 권한 검토',
            '활동 로그 모니터링'
          ],
          bestPractices: [
            '일상 업무용 별도 계정 사용',
            '관리자 권한은 필요시에만 사용',
            '권한 승격 메커니즘 도입',
            '정기적인 액세스 검토'
          ],
          complianceChecks: [
            'MFA 활성화 상태 확인',
            '최근 로그인 활동 검토',
            '연결된 정책 검토',
            '권한 사용 패턴 분석'
          ]
        },
        category: 'SECURITY'
      });

      this.inspector.addFinding(finding);
    }
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
      'AmazonRDSFullAccess'
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
   * 관리자 사용자 여부 확인
   */
  isAdminUser(userName) {
    const adminKeywords = ['admin', 'root', 'super', 'master', 'manager', 'owner'];
    return adminKeywords.some(keyword => userName.includes(keyword));
  }

  /**
   * 관리자 지표 반환
   */
  getAdminIndicators(userName) {
    const indicators = [];
    if (userName.includes('admin')) indicators.push('관리자 계정명');
    if (userName.includes('root')) indicators.push('루트 권한 계정명');
    if (userName.includes('super')) indicators.push('슈퍼유저 계정명');
    if (userName.includes('master')) indicators.push('마스터 계정명');
    
    return indicators.length > 0 ? indicators : ['일반적인 관리자 패턴'];
  }

  /**
   * 위험한 액션 찾기
   */
  findDangerousActions(policyDocument) {
    const dangerousActions = [];
    const statements = policyDocument.Statement || [];

    statements.forEach(statement => {
      if (statement.Effect === 'Allow') {
        const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
        actions.forEach(action => {
          if (action === '*' || action.includes('*')) {
            dangerousActions.push({
              action: action,
              reason: '와일드카드 권한',
              severity: 'HIGH'
            });
          }
          if (action.includes('Delete') || action.includes('Terminate')) {
            dangerousActions.push({
              action: action,
              reason: '삭제/종료 권한',
              severity: 'MEDIUM'
            });
          }
        });
      }
    });

    return dangerousActions;
  }

  /**
   * 검사별 권장사항 반환
   */
  getRecommendations(findings) {
    const recommendations = [];
    
    const userPolicyFindings = findings.filter(f => 
      f.resourceType === 'IAMUser' && 
      (f.issue.includes('정책') || f.issue.includes('권한'))
    );

    if (userPolicyFindings.length > 0) {
      const highRiskFindings = userPolicyFindings.filter(f => f.riskLevel === 'HIGH');
      if (highRiskFindings.length > 0) {
        recommendations.push('위험한 사용자 정책을 제거하고 최소 권한 원칙을 적용하세요.');
        recommendations.push('관리자 권한 사용자는 MFA를 활성화하고 정기적으로 검토하세요.');
      }

      const adminFindings = userPolicyFindings.filter(f => 
        f.issue.includes('관리자') || f.issue.includes('admin')
      );
      if (adminFindings.length > 0) {
        recommendations.push('역할 기반 접근 제어를 도입하여 사용자 권한 관리를 개선하세요.');
      }

      const policyCountFindings = userPolicyFindings.filter(f => 
        f.issue.includes('많은 정책') || f.issue.includes('복잡')
      );
      if (policyCountFindings.length > 0) {
        recommendations.push('IAM 그룹을 사용하여 사용자 권한 관리를 단순화하세요.');
      }
    }

    return recommendations;
  }
}

module.exports = OverprivilegedUserPoliciesChecker;