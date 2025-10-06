/**
 * Inline Policies Checker
 * IAM 인라인 정책 사용을 검사하는 모듈
 */

const InspectionFinding = require('../../../../models/InspectionFinding');
const { 
  ListUserPoliciesCommand,
  ListRolePoliciesCommand,
  GetUserPolicyCommand,
  GetRolePolicyCommand
} = require('@aws-sdk/client-iam');

class InlinePoliciesChecker {
    constructor(inspector) {
        this.inspector = inspector;
    }

    /**
     * 인라인 정책 검사 실행
     */
    async runAllChecks(users, roles, policies) {
        const allUsers = users || [];
        const allRoles = roles || [];

        // 리소스가 없는 경우
        if (allUsers.length === 0 && allRoles.length === 0) {
            const finding = new InspectionFinding({
                resourceId: 'no-iam-resources',
                resourceType: 'IAMGeneral',
                riskLevel: 'LOW',
                issue: 'IAM 사용자 및 역할이 없습니다',
                description: '검사할 IAM 사용자나 역할이 없어 인라인 정책 검사를 수행할 수 없습니다.',
                recommendation: 'IAM 사용자나 역할이 생성된 후 다시 검사를 실행하세요.',
                category: 'COMPLIANCE'
            });
            this.inspector.addFinding(finding);
            return;
        }

        // 사용자 인라인 정책 검사
        await this.checkUserInlinePolicies(allUsers);

        // 역할 인라인 정책 검사
        await this.checkRoleInlinePolicies(allRoles);
    }

    /**
     * 사용자 인라인 정책 검사
     */
    async checkUserInlinePolicies(users) {
        for (const user of users) {
            try {
                const listPoliciesResponse = await this.inspector.iamClient.send(
                    new ListUserPoliciesCommand({ UserName: user.UserName })
                );

                const inlinePolicies = listPoliciesResponse.PolicyNames || [];

                if (inlinePolicies.length > 0) {
                    // 각 인라인 정책 분석
                    for (const policyName of inlinePolicies) {
                        await this.analyzeUserInlinePolicy(user, policyName);
                    }

                    // 인라인 정책 사용에 대한 일반적인 권고
                    const finding = new InspectionFinding({
                        resourceId: user.UserName,
                        resourceType: 'IAMUser',
                        riskLevel: 'MEDIUM',
                        issue: '사용자에 인라인 정책 사용',
                        description: `IAM 사용자 '${user.UserName}'이 ${inlinePolicies.length}개의 인라인 정책을 사용하고 있습니다.`,
                        recommendation: '인라인 정책 대신 관리형 정책을 사용하는 것을 권장합니다. 관리형 정책은 재사용 가능하고, 버전 관리가 되며, 중앙 집중식 관리가 가능합니다.',
                        details: {
                            userName: user.UserName,
                            inlinePolicyCount: inlinePolicies.length,
                            inlinePolicyNames: inlinePolicies,
                            risks: [
                                '정책 재사용 불가',
                                '버전 관리 어려움',
                                '중앙 집중식 관리 불가',
                                '정책 변경 추적 어려움'
                            ],
                            recommendations: [
                                '인라인 정책을 관리형 정책으로 변환',
                                '유사한 권한을 가진 정책들을 통합',
                                '정책 명명 규칙 적용',
                                '정기적인 정책 검토 수행'
                            ]
                        },
                        category: 'COMPLIANCE'
                    });
                    this.inspector.addFinding(finding);
                }

            } catch (error) {
                console.warn(`사용자 ${user.UserName}의 인라인 정책을 확인할 수 없습니다:`, error.message);
            }
        }
    }

    /**
     * 역할 인라인 정책 검사
     */
    async checkRoleInlinePolicies(roles) {
        for (const role of roles) {
            try {
                const listPoliciesResponse = await this.inspector.iamClient.send(
                    new ListRolePoliciesCommand({ RoleName: role.RoleName })
                );

                const inlinePolicies = listPoliciesResponse.PolicyNames || [];

                if (inlinePolicies.length > 0) {
                    // 각 인라인 정책 분석
                    for (const policyName of inlinePolicies) {
                        await this.analyzeRoleInlinePolicy(role, policyName);
                    }

                    // 인라인 정책 사용에 대한 일반적인 권고
                    const finding = new InspectionFinding({
                        resourceId: role.RoleName,
                        resourceType: 'IAMRole',
                        riskLevel: 'MEDIUM',
                        issue: '역할에 인라인 정책 사용',
                        description: `IAM 역할 '${role.RoleName}'이 ${inlinePolicies.length}개의 인라인 정책을 사용하고 있습니다.`,
                        recommendation: '인라인 정책 대신 관리형 정책을 사용하는 것을 권장합니다. 특히 역할의 경우 여러 서비스에서 재사용될 가능성이 높으므로 관리형 정책이 더 적합합니다.',
                        details: {
                            roleName: role.RoleName,
                            inlinePolicyCount: inlinePolicies.length,
                            inlinePolicyNames: inlinePolicies,
                            risks: [
                                '정책 재사용 불가',
                                '역할 간 일관성 부족',
                                '정책 변경 시 영향 범위 파악 어려움',
                                '감사 및 컴플라이언스 검토 복잡성'
                            ],
                            recommendations: [
                                '인라인 정책을 관리형 정책으로 변환',
                                '역할별 표준 정책 세트 정의',
                                '정책 템플릿 활용',
                                '자동화된 정책 배포 고려'
                            ]
                        },
                        category: 'COMPLIANCE'
                    });
                    this.inspector.addFinding(finding);
                }

            } catch (error) {
                console.warn(`역할 ${role.RoleName}의 인라인 정책을 확인할 수 없습니다:`, error.message);
            }
        }
    }

    /**
     * 사용자 인라인 정책 상세 분석
     */
    async analyzeUserInlinePolicy(user, policyName) {
        try {
            const policyResponse = await this.inspector.iamClient.send(
                new GetUserPolicyCommand({ 
                    UserName: user.UserName, 
                    PolicyName: policyName 
                })
            );

            const policyDocument = JSON.parse(decodeURIComponent(policyResponse.PolicyDocument));
            const analysis = this.analyzePolicyDocument(policyDocument);

            if (analysis.hasHighRiskPermissions) {
                const finding = new InspectionFinding({
                    resourceId: `${user.UserName}-${policyName}`,
                    resourceType: 'IAMUserPolicy',
                    riskLevel: 'HIGH',
                    issue: '위험한 권한을 가진 인라인 정책',
                    description: `사용자 '${user.UserName}'의 인라인 정책 '${policyName}'이 위험한 권한을 포함하고 있습니다.`,
                    recommendation: '이 정책을 관리형 정책으로 변환하고, 권한을 최소한으로 제한하세요. 특히 관리자 권한이나 보안 관련 권한은 신중하게 검토해야 합니다.',
                    details: {
                        userName: user.UserName,
                        policyName: policyName,
                        riskFactors: analysis.riskFactors,
                        dangerousActions: analysis.dangerousActions,
                        recommendations: [
                            '최소 권한 원칙 적용',
                            '관리형 정책으로 변환',
                            '정기적인 권한 검토',
                            '조건부 액세스 적용'
                        ]
                    },
                    category: 'SECURITY'
                });
                this.inspector.addFinding(finding);
            }

        } catch (error) {
            console.warn(`사용자 ${user.UserName}의 인라인 정책 ${policyName}을 분석할 수 없습니다:`, error.message);
        }
    }

    /**
     * 역할 인라인 정책 상세 분석
     */
    async analyzeRoleInlinePolicy(role, policyName) {
        try {
            const policyResponse = await this.inspector.iamClient.send(
                new GetRolePolicyCommand({ 
                    RoleName: role.RoleName, 
                    PolicyName: policyName 
                })
            );

            const policyDocument = JSON.parse(decodeURIComponent(policyResponse.PolicyDocument));
            const analysis = this.analyzePolicyDocument(policyDocument);

            if (analysis.hasHighRiskPermissions) {
                const finding = new InspectionFinding({
                    resourceId: `${role.RoleName}-${policyName}`,
                    resourceType: 'IAMRolePolicy',
                    riskLevel: 'HIGH',
                    issue: '위험한 권한을 가진 인라인 정책',
                    description: `역할 '${role.RoleName}'의 인라인 정책 '${policyName}'이 위험한 권한을 포함하고 있습니다.`,
                    recommendation: '이 정책을 관리형 정책으로 변환하고, 권한을 최소한으로 제한하세요. 역할의 경우 여러 서비스에서 사용될 수 있으므로 더욱 신중한 권한 관리가 필요합니다.',
                    details: {
                        roleName: role.RoleName,
                        policyName: policyName,
                        riskFactors: analysis.riskFactors,
                        dangerousActions: analysis.dangerousActions,
                        recommendations: [
                            '역할별 최소 권한 적용',
                            '관리형 정책으로 변환',
                            '신뢰 관계 검토',
                            '임시 자격 증명 활용'
                        ]
                    },
                    category: 'SECURITY'
                });
                this.inspector.addFinding(finding);
            }

        } catch (error) {
            console.warn(`역할 ${role.RoleName}의 인라인 정책 ${policyName}을 분석할 수 없습니다:`, error.message);
        }
    }

    /**
     * 정책 문서 분석
     */
    analyzePolicyDocument(policyDocument) {
        const analysis = {
            hasHighRiskPermissions: false,
            riskFactors: [],
            dangerousActions: []
        };

        if (!policyDocument.Statement || !Array.isArray(policyDocument.Statement)) {
            return analysis;
        }

        for (const statement of policyDocument.Statement) {
            if (statement.Effect !== 'Allow') continue;

            const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
            
            for (const action of actions) {
                // 위험한 액션 패턴 검사
                if (this.isDangerousAction(action)) {
                    analysis.hasHighRiskPermissions = true;
                    analysis.dangerousActions.push(action);
                }
            }

            // 리소스 제한 검사
            if (statement.Resource === '*') {
                analysis.riskFactors.push('모든 리소스에 대한 액세스 허용');
            }

            // 조건 없는 광범위한 권한 검사
            if (!statement.Condition && actions.some(action => action.includes('*'))) {
                analysis.riskFactors.push('조건 없는 와일드카드 권한');
            }
        }

        return analysis;
    }

    /**
     * 위험한 액션인지 확인
     */
    isDangerousAction(action) {
        const dangerousPatterns = [
            '*',
            'iam:*',
            'sts:AssumeRole',
            'iam:CreateRole',
            'iam:DeleteRole',
            'iam:AttachRolePolicy',
            'iam:DetachRolePolicy',
            'iam:PutRolePolicy',
            'iam:DeleteRolePolicy',
            'iam:CreateUser',
            'iam:DeleteUser',
            'iam:CreateAccessKey',
            'iam:DeleteAccessKey',
            'iam:AttachUserPolicy',
            'iam:DetachUserPolicy',
            'iam:PutUserPolicy',
            'iam:DeleteUserPolicy',
            'ec2:*',
            's3:*',
            'rds:*'
        ];

        return dangerousPatterns.some(pattern => {
            if (pattern.includes('*')) {
                const regex = new RegExp(pattern.replace(/\*/g, '.*'));
                return regex.test(action);
            }
            return action === pattern;
        });
    }
}

module.exports = InlinePoliciesChecker;