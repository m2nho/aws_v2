/**
 * Root Access Key Checker
 * 루트 계정 액세스 키 사용을 검사하는 모듈
 */

const InspectionFinding = require('../../../../models/InspectionFinding');
const { GetAccountSummaryCommand } = require('@aws-sdk/client-iam');

class RootAccessKeyChecker {
    constructor(inspector) {
        this.inspector = inspector;
    }

    /**
     * 루트 계정 액세스 키 검사 실행
     */
    async runAllChecks() {
        try {
            // 1. 계정 요약 정보 조회
            await this.checkRootAccessKeyUsage();

            // 2. 루트 계정 보안 권장사항
            await this.checkRootAccountSecurity();

        } catch (error) {
            this.inspector.recordError(error, {
                operation: 'runAllChecks - rootAccessKeyChecker'
            });

            // 오류 발생 시에도 finding 생성
            const finding = new InspectionFinding({
                resourceId: 'root-access-key-check-error',
                resourceType: 'IAMRoot',
                riskLevel: 'HIGH',
                issue: '루트 계정 액세스 키 검사 중 오류가 발생했습니다',
                recommendation: 'IAM 권한을 확인하고 다시 시도하세요',
                details: {
                    error: error.message,
                    timestamp: new Date().toISOString(),
                    troubleshooting: [
                        'IAM 읽기 권한 확인',
                        'AWS 자격 증명 확인',
                        '네트워크 연결 상태 확인',
                        '잠시 후 다시 시도'
                    ]
                },
                category: 'SECURITY'
            });
            
            this.inspector.addFinding(finding);
        }
    }

    /**
     * 루트 계정 액세스 키 사용 검사
     */
    async checkRootAccessKeyUsage() {
        try {
            const command = new GetAccountSummaryCommand({});
            const response = await this.inspector.iamClient.send(command);
            const summaryMap = response.SummaryMap || {};

            // 루트 계정 액세스 키 개수 확인
            const rootAccessKeysPresent = summaryMap.AccountAccessKeysPresent || 0;

            if (rootAccessKeysPresent > 0) {
                // 루트 계정 액세스 키가 존재하는 경우 - CRITICAL
                const finding = new InspectionFinding({
                    resourceId: 'root-account-access-keys',
                    resourceType: 'IAMRoot',
                    riskLevel: 'CRITICAL',
                    issue: `루트 계정에 ${rootAccessKeysPresent}개의 액세스 키가 존재합니다`,
                    recommendation: '루트 계정 액세스 키를 즉시 삭제하고 IAM 사용자를 사용하세요',
                    details: {
                        rootAccessKeysCount: rootAccessKeysPresent,
                        securityRisks: [
                            '루트 계정은 모든 AWS 서비스와 리소스에 대한 완전한 액세스 권한 보유',
                            '액세스 키 노출 시 전체 AWS 계정 탈취 위험',
                            '프로그래밍 방식 액세스로 인한 추적 어려움',
                            '실수로 인한 대규모 리소스 삭제 위험'
                        ],
                        immediateActions: [
                            '루트 계정 액세스 키 즉시 삭제',
                            '루트 계정에 강력한 암호 설정',
                            '루트 계정에 MFA 활성화',
                            '관리자 권한을 가진 IAM 사용자 생성'
                        ],
                        bestPractices: [
                            '루트 계정은 계정 설정 변경 시에만 사용',
                            '일상적인 작업에는 IAM 사용자 사용',
                            '루트 계정 로그인 알림 설정',
                            '정기적인 루트 계정 활동 모니터링'
                        ],
                        complianceImpact: [
                            'AWS Well-Architected Framework 위반',
                            'CIS AWS Foundations Benchmark 위반',
                            'SOC 2, ISO 27001 등 컴플라이언스 요구사항 위반',
                            '보안 감사 시 중대한 취약점으로 분류'
                        ]
                    },
                    category: 'SECURITY'
                });

                this.inspector.addFinding(finding);
            } else {
                // 루트 계정 액세스 키가 없는 경우 - 양호
                const finding = new InspectionFinding({
                    resourceId: 'root-account-no-access-keys',
                    resourceType: 'IAMRoot',
                    riskLevel: 'PASS',
                    issue: '루트 액세스 키 검사 - 통과',
                    recommendation: '현재 상태를 유지하고 루트 계정 보안을 지속적으로 관리하세요',
                    details: {
                        rootAccessKeysCount: 0,
                        status: '루트 계정 액세스 키 보안 정책 준수',
                        continuousSecurityTips: [
                            '루트 계정에 MFA 활성화 확인',
                            '루트 계정 암호 정기 변경',
                            '루트 계정 로그인 모니터링',
                            'CloudTrail을 통한 루트 계정 활동 추적'
                        ],
                        accountSummary: {
                            totalUsers: summaryMap.Users || 0,
                            totalRoles: summaryMap.Roles || 0,
                            totalPolicies: summaryMap.Policies || 0,
                            mfaDevices: summaryMap.MFADevices || 0
                        }
                    },
                    category: 'COMPLIANCE'
                });

                this.inspector.addFinding(finding);
            }

        } catch (error) {
            this.inspector.recordError(error, { operation: 'checkRootAccessKeyUsage' });
            
            // API 호출 실패 시 일반적인 권고사항 제공
            const finding = new InspectionFinding({
                resourceId: 'root-access-key-check-failed',
                resourceType: 'IAMRoot',
                riskLevel: 'MEDIUM',
                issue: '루트 계정 액세스 키 상태를 확인할 수 없습니다',
                recommendation: '수동으로 루트 계정 보안 상태를 확인하세요',
                details: {
                    error: error.message,
                    manualCheckSteps: [
                        'AWS 콘솔에 루트 계정으로 로그인',
                        '보안 자격 증명 페이지 접근',
                        '액세스 키 섹션에서 키 존재 여부 확인',
                        '존재하는 경우 즉시 삭제'
                    ],
                    securityReminders: [
                        '루트 계정 액세스 키는 절대 생성하지 말 것',
                        '루트 계정에 MFA 반드시 활성화',
                        '루트 계정은 응급 상황에만 사용',
                        'IAM 사용자로 일상 업무 수행'
                    ]
                },
                category: 'SECURITY'
            });

            this.inspector.addFinding(finding);
        }
    }

    /**
     * 루트 계정 보안 권장사항
     */
    async checkRootAccountSecurity() {
        const finding = new InspectionFinding({
            resourceId: 'root-account-security-recommendations',
            resourceType: 'IAMRoot',
            riskLevel: 'MEDIUM',
            issue: '루트 계정에 MFA가 활성화되지 않았거나 추가 보안 설정이 필요합니다',
            recommendation: '루트 계정에 하드웨어 MFA를 활성화하고 CloudTrail 로깅을 설정하세요',
            details: {
                securityChecklist: [
                    {
                        item: '강력한 암호 설정',
                        description: '최소 14자 이상, 복합 문자 사용',
                        priority: 'HIGH'
                    },
                    {
                        item: 'MFA 활성화',
                        description: '하드웨어 MFA 디바이스 권장',
                        priority: 'CRITICAL'
                    },
                    {
                        item: '연락처 정보 업데이트',
                        description: '대체 연락처 및 보안 연락처 설정',
                        priority: 'MEDIUM'
                    },
                    {
                        item: 'CloudTrail 활성화',
                        description: '루트 계정 활동 로깅 및 모니터링',
                        priority: 'HIGH'
                    },
                    {
                        item: '결제 정보 보호',
                        description: 'IAM 사용자의 결제 정보 접근 제한',
                        priority: 'MEDIUM'
                    }
                ],
                monitoringRecommendations: [
                    'CloudWatch를 통한 루트 계정 로그인 알림 설정',
                    'AWS Config를 통한 루트 계정 액세스 키 생성 모니터링',
                    'AWS Security Hub를 통한 종합적인 보안 상태 관리',
                    '정기적인 보안 검토 및 감사 수행'
                ],
                emergencyProcedures: [
                    '루트 계정 탈취 의심 시 즉시 AWS Support 연락',
                    '의심스러운 활동 발견 시 액세스 키 즉시 비활성화',
                    '암호 변경 및 MFA 재설정',
                    '모든 IAM 사용자 및 역할 검토'
                ]
            },
            category: 'SECURITY'
        });

        this.inspector.addFinding(finding);
    }

    /**
     * 권장사항 생성
     */
    getRecommendations(findings) {
        const recommendations = [];
        const rootFindings = findings.filter(f => 
            f.resourceType === 'IAMRoot'
        );

        if (rootFindings.length > 0) {
            const criticalFindings = rootFindings.filter(f => f.riskLevel === 'CRITICAL');
            if (criticalFindings.length > 0) {
                recommendations.push('루트 계정 액세스 키를 즉시 삭제하세요.');
                recommendations.push('루트 계정에 MFA를 활성화하고 강력한 암호를 설정하세요.');
            }

            const securityFindings = rootFindings.filter(f => 
                f.issue.includes('보안') || f.issue.includes('권장')
            );
            if (securityFindings.length > 0) {
                recommendations.push('루트 계정 보안 모범 사례를 적용하세요.');
                recommendations.push('CloudTrail을 활성화하여 루트 계정 활동을 모니터링하세요.');
            }
        }

        return recommendations;
    }
}

module.exports = RootAccessKeyChecker;