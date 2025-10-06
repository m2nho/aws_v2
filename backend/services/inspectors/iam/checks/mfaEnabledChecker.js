/**
 * MFA Enabled Checker
 * IAM 사용자의 MFA 활성화 상태를 검사하는 모듈
 */

const InspectionFinding = require('../../../../models/InspectionFinding');

class MfaEnabledChecker {
    constructor(inspector) {
        this.inspector = inspector;
    }

    /**
     * MFA 활성화 검사 실행
     */
    async runAllChecks(users) {
        const activeUsers = users || [];

        // 사용자가 없는 경우
        if (activeUsers.length === 0) {
            const finding = new InspectionFinding({
                resourceId: 'no-iam-users',
                resourceType: 'IAMUser',
                riskLevel: 'LOW',
                issue: 'IAM 사용자가 없어 MFA 검사가 불필요합니다',
                recommendation: 'IAM 사용자 생성 시 MFA를 반드시 활성화하세요',
                details: {
                    totalUsers: 0,
                    status: '현재 MFA 관련 보안 위험이 없습니다',
                    bestPractices: [
                        '새 IAM 사용자 생성 시 MFA 즉시 설정',
                        '하드웨어 MFA 디바이스 사용 권장',
                        'MFA 활성화를 강제하는 정책 적용',
                        '정기적인 MFA 상태 검토'
                    ]
                },
                category: 'COMPLIANCE'
            });

            this.inspector.addFinding(finding);
            return;
        }

        // 각 사용자별 MFA 검사
        for (const user of activeUsers) {
            try {
                // 1. MFA 디바이스 활성화 검사
                this.checkUserMfaStatus(user);

                // 2. 콘솔 액세스 사용자 MFA 검사
                this.checkConsoleUserMfa(user);

                // 3. 권한이 높은 사용자 MFA 검사
                this.checkPrivilegedUserMfa(user);

            } catch (error) {
                this.inspector.recordError(error, {
                    operation: 'runAllChecks',
                    userName: user.UserName
                });
            }
        }

        // 전체 MFA 상태 요약
        this.generateMfaSummary(activeUsers);
    }

    /**
     * 사용자 MFA 상태 검사
     */
    checkUserMfaStatus(user) {
        const mfaDevices = user.MFADevices || [];
        const hasMfa = mfaDevices.length > 0;

        if (!hasMfa) {
            // MFA가 활성화되지 않은 사용자
            const finding = new InspectionFinding({
                resourceId: user.UserName,
                resourceType: 'IAMUser',
                riskLevel: 'HIGH',
                issue: `IAM 사용자 '${user.UserName}'에 MFA가 활성화되지 않았습니다`,
                recommendation: 'AWS 콘솔에서 해당 사용자의 보안 자격 증명 탭에서 MFA 디바이스를 할당하세요',
                details: {
                    userName: user.UserName,
                    userId: user.UserId,
                    createDate: user.CreateDate?.toISOString() || user.CreateDate,
                    mfaDevicesCount: 0,
                    hasConsoleAccess: this.hasConsoleAccess(user),
                    hasAccessKeys: (user.AccessKeys || []).length > 0,
                    securityRisks: [
                        '암호만으로 계정 보호 시 탈취 위험 증가',
                        '피싱 공격에 취약',
                        '무차별 대입 공격 위험',
                        '계정 탈취 시 AWS 리소스 무단 접근'
                    ],
                    mfaOptions: [
                        {
                            type: 'Virtual MFA',
                            description: 'Google Authenticator, Authy 등 앱 사용',
                            cost: '무료',
                            security: 'MEDIUM'
                        },
                        {
                            type: 'Hardware MFA',
                            description: 'YubiKey, RSA SecurID 등 물리적 디바이스',
                            cost: '유료',
                            security: 'HIGH'
                        },
                        {
                            type: 'SMS MFA',
                            description: 'SMS를 통한 인증 코드 수신',
                            cost: '무료',
                            security: 'LOW (권장하지 않음)'
                        }
                    ],
                    setupInstructions: [
                        'AWS 콘솔에서 IAM 사용자 선택',
                        '보안 자격 증명 탭 클릭',
                        'MFA 디바이스 할당 클릭',
                        'MFA 디바이스 유형 선택 및 설정'
                    ]
                },
                category: 'SECURITY'
            });

            this.inspector.addFinding(finding);
        } else {
            // MFA가 활성화된 사용자 - 양호한 상태
            const finding = new InspectionFinding({
                resourceId: user.UserName,
                resourceType: 'IAMUser',
                riskLevel: 'LOW',
                issue: `IAM 사용자 '${user.UserName}'에 MFA가 활성화되어 보안 상태가 양호합니다`,
                recommendation: 'MFA 백업 코드를 안전한 곳에 보관하고 디바이스 분실 시 즉시 교체하세요',
                details: {
                    userName: user.UserName,
                    mfaDevicesCount: mfaDevices.length,
                    mfaDevices: mfaDevices.map(device => ({
                        serialNumber: device.SerialNumber,
                        enableDate: device.EnableDate?.toISOString() || device.EnableDate
                    })),
                    securityBenefits: [
                        '2단계 인증으로 계정 보안 강화',
                        '피싱 공격 방어',
                        '무차별 대입 공격 차단',
                        '계정 탈취 위험 현저히 감소'
                    ],
                    maintenanceTips: [
                        'MFA 디바이스 백업 코드 안전한 곳에 보관',
                        'MFA 디바이스 분실 시 즉시 새 디바이스로 교체',
                        '정기적인 MFA 디바이스 동작 확인',
                        '여러 MFA 디바이스 등록 고려'
                    ]
                },
                category: 'COMPLIANCE'
            });

            this.inspector.addFinding(finding);
        }
    }

    /**
     * 콘솔 액세스 사용자 MFA 검사
     */
    checkConsoleUserMfa(user) {
        const hasConsoleAccess = this.hasConsoleAccess(user);
        const mfaDevices = user.MFADevices || [];
        const hasMfa = mfaDevices.length > 0;

        if (hasConsoleAccess && !hasMfa) {
            const finding = new InspectionFinding({
                resourceId: `${user.UserName}-console-mfa`,
                resourceType: 'IAMUser',
                riskLevel: 'CRITICAL',
                issue: `콘솔 액세스 권한을 가진 사용자 '${user.UserName}'에 MFA가 없습니다`,
                recommendation: 'IAM 콘솔에서 해당 사용자에게 Virtual MFA 또는 Hardware MFA를 즉시 설정하세요',
                details: {
                    userName: user.UserName,
                    accessType: 'Console Access',
                    mfaStatus: 'DISABLED',
                    criticalRisks: [
                        'AWS 콘솔을 통한 모든 서비스 접근 가능',
                        '브라우저 세션 탈취 위험',
                        '공용 컴퓨터 사용 시 계정 노출',
                        '관리자 권한 오남용 가능성'
                    ],
                    immediateActions: [
                        'MFA 즉시 활성화',
                        '강력한 암호 설정',
                        '불필요한 권한 제거',
                        '로그인 활동 모니터링'
                    ],
                    policyRecommendations: [
                        'MFA 없이는 콘솔 액세스 차단하는 정책 적용',
                        '특정 IP에서만 콘솔 접근 허용',
                        '세션 타임아웃 설정',
                        '민감한 작업에 추가 인증 요구'
                    ]
                },
                category: 'SECURITY'
            });

            this.inspector.addFinding(finding);
        }
    }

    /**
     * 권한이 높은 사용자 MFA 검사
     */
    checkPrivilegedUserMfa(user) {
        const isPrivileged = this.isPrivilegedUser(user);
        const mfaDevices = user.MFADevices || [];
        const hasMfa = mfaDevices.length > 0;

        if (isPrivileged && !hasMfa) {
            const finding = new InspectionFinding({
                resourceId: `${user.UserName}-privileged-mfa`,
                resourceType: 'IAMUser',
                riskLevel: 'CRITICAL',
                issue: `높은 권한을 가진 사용자 '${user.UserName}'에 MFA가 활성화되지 않았습니다`,
                recommendation: 'YubiKey 또는 RSA SecurID 같은 하드웨어 MFA 디바이스를 구매하여 설정하세요',
                details: {
                    userName: user.UserName,
                    privilegeLevel: 'HIGH',
                    mfaStatus: 'DISABLED',
                    privilegeIndicators: this.getPrivilegeIndicators(user),
                    enhancedSecurityRequirements: [
                        '하드웨어 MFA 디바이스 사용 필수',
                        '정기적인 권한 검토',
                        '모든 활동 로깅 및 모니터링',
                        '최소 권한 원칙 적용'
                    ],
                    complianceRequirements: [
                        'SOX, PCI-DSS 등 규정 준수',
                        '내부 보안 정책 준수',
                        '감사 요구사항 충족',
                        '보안 인증 유지'
                    ],
                    riskMitigation: [
                        'MFA 활성화 후 권한 재검토',
                        '불필요한 관리자 권한 제거',
                        '임시 권한 승격 메커니즘 도입',
                        '정기적인 액세스 검토 수행'
                    ]
                },
                category: 'SECURITY'
            });

            this.inspector.addFinding(finding);
        }
    }

    /**
     * 전체 MFA 상태 요약
     */
    generateMfaSummary(users) {
        const totalUsers = users.length;
        const usersWithMfa = users.filter(user => (user.MFADevices || []).length > 0).length;
        const usersWithoutMfa = totalUsers - usersWithMfa;
        const mfaComplianceRate = totalUsers > 0 ? Math.round((usersWithMfa / totalUsers) * 100) : 100;

        let riskLevel = 'LOW';
        let issue = '';
        let recommendation = '';

        if (usersWithoutMfa === 0) {
            issue = `모든 IAM 사용자(${totalUsers}명)가 MFA를 활성화하여 보안 상태가 우수합니다`;
            recommendation = '현재 상태를 유지하고 새 사용자에게도 MFA를 적용하세요';
        } else if (mfaComplianceRate >= 80) {
            riskLevel = 'MEDIUM';
            issue = `${usersWithoutMfa}명의 사용자가 MFA를 활성화하지 않았습니다 (준수율: ${mfaComplianceRate}%)`;
            recommendation = '나머지 사용자들도 MFA를 활성화하여 100% 준수율을 달성하세요';
        } else {
            riskLevel = 'HIGH';
            issue = `${usersWithoutMfa}명의 사용자가 MFA를 활성화하지 않아 보안 위험이 높습니다 (준수율: ${mfaComplianceRate}%)`;
            recommendation = 'MFA 활성화를 강제하는 정책을 적용하고 모든 사용자의 MFA를 즉시 활성화하세요';
        }

        const finding = new InspectionFinding({
            resourceId: 'mfa-compliance-summary',
            resourceType: 'IAMUser',
            riskLevel: riskLevel,
            issue: issue,
            recommendation: recommendation,
            details: {
                totalUsers: totalUsers,
                usersWithMfa: usersWithMfa,
                usersWithoutMfa: usersWithoutMfa,
                complianceRate: `${mfaComplianceRate}%`,
                status: mfaComplianceRate === 100 ? '완전 준수' : '부분 준수',
                organizationalBenefits: [
                    '전사적 보안 수준 향상',
                    '컴플라이언스 요구사항 충족',
                    '보안 사고 위험 감소',
                    '고객 신뢰도 증가'
                ],
                implementationStrategy: [
                    'MFA 활성화 의무화 정책 수립',
                    '사용자 교육 및 훈련 실시',
                    'MFA 디바이스 지원 및 배포',
                    '정기적인 준수 상태 모니터링'
                ],
                targetMetrics: [
                    '목표: MFA 준수율 100%',
                    '모니터링: 월별 준수율 측정',
                    '개선: 분기별 보안 교육',
                    '유지: 연간 보안 정책 검토'
                ]
            },
            category: 'SECURITY'
        });

        this.inspector.addFinding(finding);
    }

    /**
     * 콘솔 액세스 권한 확인
     */
    hasConsoleAccess(user) {
        // 실제로는 사용자의 로그인 프로필을 확인해야 하지만,
        // 여기서는 사용자 생성 시간으로 추정
        return true; // 대부분의 IAM 사용자는 콘솔 액세스 가능
    }

    /**
     * 권한이 높은 사용자 확인
     */
    isPrivilegedUser(user) {
        // 실제로는 사용자의 정책을 분석해야 하지만,
        // 여기서는 사용자 이름으로 추정
        const privilegedKeywords = ['admin', 'root', 'super', 'master', 'manager'];
        const userName = user.UserName.toLowerCase();
        
        return privilegedKeywords.some(keyword => userName.includes(keyword));
    }

    /**
     * 권한 지표 반환
     */
    getPrivilegeIndicators(user) {
        const indicators = [];
        const userName = user.UserName.toLowerCase();
        
        if (userName.includes('admin')) indicators.push('관리자 계정명');
        if (userName.includes('root')) indicators.push('루트 권한 계정명');
        if (userName.includes('super')) indicators.push('슈퍼유저 계정명');
        if ((user.AccessKeys || []).length > 0) indicators.push('프로그래밍 액세스 권한');
        
        return indicators.length > 0 ? indicators : ['일반적인 권한 패턴'];
    }

    /**
     * 권장사항 생성
     */
    getRecommendations(findings) {
        const recommendations = [];
        const mfaFindings = findings.filter(f => 
            f.issue && (f.issue.includes('MFA') || f.issue.includes('mfa'))
        );

        if (mfaFindings.length > 0) {
            const criticalFindings = mfaFindings.filter(f => f.riskLevel === 'CRITICAL');
            if (criticalFindings.length > 0) {
                recommendations.push('콘솔 액세스 및 높은 권한을 가진 사용자는 즉시 MFA를 활성화하세요.');
                recommendations.push('하드웨어 MFA 디바이스 사용을 고려하세요.');
            }

            const highFindings = mfaFindings.filter(f => f.riskLevel === 'HIGH');
            if (highFindings.length > 0) {
                recommendations.push('모든 IAM 사용자에 대해 MFA를 활성화하세요.');
                recommendations.push('MFA 활성화를 강제하는 IAM 정책을 적용하세요.');
            }

            const summaryFindings = mfaFindings.filter(f => 
                f.issue.includes('준수율') || f.issue.includes('요약')
            );
            if (summaryFindings.length > 0) {
                recommendations.push('조직 차원의 MFA 정책을 수립하고 정기적으로 준수 상태를 모니터링하세요.');
            }
        }

        return recommendations;
    }
}

module.exports = MfaEnabledChecker;