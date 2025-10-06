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
                riskLevel: 'PASS',
                issue: 'MFA 검사 - 통과 (IAM 사용자 없음)',
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

        // 각 사용자별 통합 MFA 검사
        for (const user of activeUsers) {
            try {
                // 통합된 MFA 검사
                this.checkUserMfaComprehensive(user);

            } catch (error) {
                this.inspector.recordError(error, {
                    operation: 'runAllChecks',
                    userName: user.UserName
                });
            }
        }
    }

    /**
     * 사용자별 통합 MFA 검사
     */
    checkUserMfaComprehensive(user) {
        const mfaDevices = user.MFADevices || [];
        const hasMfa = mfaDevices.length > 0;
        const hasConsoleAccess = this.hasConsoleAccess(user);
        const isPrivilegedUser = this.isPrivilegedUser(user);
        
        const issues = [];
        const riskFactors = [];
        let riskScore = 0;
        let maxRiskLevel = 'PASS';

        // MFA 상태 분석
        if (!hasMfa) {
            issues.push('MFA 미활성화');
            riskScore += 50;
            maxRiskLevel = 'HIGH';

            // 추가 위험 요소 분석
            if (hasConsoleAccess) {
                issues.push('콘솔 액세스 권한 보유');
                riskFactors.push('콘솔 로그인 시 MFA 없이 접근 가능');
                riskScore += 30;
                maxRiskLevel = 'CRITICAL';
            }

            if (isPrivilegedUser) {
                issues.push('높은 권한 보유');
                riskFactors.push('관리자 권한으로 MFA 없이 접근 가능');
                riskScore += 20;
                maxRiskLevel = 'CRITICAL';
            }
        }

        // 결과 결정
        let status = '';
        let recommendation = '';

        if (hasMfa) {
            status = 'MFA 활성화됨';
            recommendation = 'MFA가 활성화되어 있습니다. 백업 코드를 안전한 곳에 보관하세요.';
            maxRiskLevel = 'PASS';
        } else {
            if (maxRiskLevel === 'CRITICAL') {
                status = '즉시 조치 필요 - 높은 위험';
                recommendation = '콘솔 액세스 또는 높은 권한을 가진 사용자에게 즉시 MFA를 설정하세요.';
            } else {
                status = 'MFA 설정 필요';
                recommendation = 'AWS 콘솔에서 해당 사용자의 보안 자격 증명 탭에서 MFA 디바이스를 할당하세요.';
            }
        }

        // 통합된 결과 생성
        const finding = new InspectionFinding({
            resourceId: user.UserName,
            resourceType: 'IAMUser',
            riskLevel: maxRiskLevel,
            issue: issues.length > 0 ? 
                `MFA 상태 - ${status}: ${issues.join(', ')}` : 
                `MFA 상태 - ${status}`,
            recommendation: recommendation,
            details: {
                userName: user.UserName,
                mfaStatus: hasMfa ? 'ENABLED' : 'DISABLED',
                mfaDevicesCount: mfaDevices.length,
                hasConsoleAccess: hasConsoleAccess,
                isPrivilegedUser: isPrivilegedUser,
                riskScore: riskScore,
                status: status,
                issues: issues,
                riskFactors: riskFactors,
                mfaDevices: hasMfa ? mfaDevices.map(device => ({
                    serialNumber: device.SerialNumber,
                    enableDate: device.EnableDate?.toISOString() || device.EnableDate
                })) : [],
                actionItems: !hasMfa ? [
                    'IAM 콘솔에서 MFA 디바이스 설정',
                    hasConsoleAccess ? '콘솔 액세스 보안 강화 우선' : null,
                    isPrivilegedUser ? '관리자 권한 보안 강화 우선' : null
                ].filter(Boolean) : [
                    'MFA 백업 코드 안전한 곳에 보관',
                    '디바이스 분실 시 즉시 교체',
                    '정기적인 디바이스 동작 확인'
                ],
                securityLevel: hasMfa ? '높음' : (maxRiskLevel === 'CRITICAL' ? '매우 낮음' : '낮음')
            },
            category: 'SECURITY'
        });

        this.inspector.addFinding(finding);
    }

    /**
     * 사용자 MFA 상태 검사 (개별 함수 - 더 이상 사용하지 않음)
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
                riskLevel: 'PASS',
                issue: `MFA 상태 - 활성화됨`,
                recommendation: 'MFA가 활성화되어 있습니다. 백업 코드를 안전한 곳에 보관하세요.',
                details: {
                    userName: user.UserName,
                    mfaStatus: 'ENABLED',
                    mfaDevicesCount: mfaDevices.length,
                    mfaDevices: mfaDevices.map(device => ({
                        serialNumber: device.SerialNumber,
                        enableDate: device.EnableDate?.toISOString() || device.EnableDate
                    })),
                    securityLevel: '높음',
                    actionItems: [
                        'MFA 백업 코드 안전한 곳에 보관',
                        '디바이스 분실 시 즉시 교체',
                        '정기적인 디바이스 동작 확인'
                    ]
                },
                category: 'COMPLIANCE'
            });

            this.inspector.addFinding(finding);
        }
    }

    /**
     * 콘솔 액세스 사용자 MFA 검사 (개별 함수 - 더 이상 사용하지 않음)
     */
    checkConsoleUserMfa_deprecated(user) {
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
     * 권한이 높은 사용자 MFA 검사 (개별 함수 - 더 이상 사용하지 않음)
     */
    checkPrivilegedUserMfa_deprecated(user) {
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
     * 전체 MFA 상태 요약 (더 이상 사용하지 않음)
     */
    generateMfaSummary_deprecated(users) {
        const totalUsers = users.length;
        const usersWithMfa = users.filter(user => (user.MFADevices || []).length > 0).length;
        const usersWithoutMfa = totalUsers - usersWithMfa;
        const mfaComplianceRate = totalUsers > 0 ? Math.round((usersWithMfa / totalUsers) * 100) : 100;

        let riskLevel = 'LOW';
        let issue = '';
        let recommendation = '';

        if (usersWithoutMfa === 0) {
            riskLevel = 'PASS';
            issue = `IAM MFA 검사 - 모두 통과 (${totalUsers}명 사용자)`;
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

        // 전체 요약 결과는 제거 - 개별 사용자 결과만 표시
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