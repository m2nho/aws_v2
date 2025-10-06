/**
 * Unused Credentials Checker
 * 미사용 IAM 자격 증명을 검사하는 모듈
 */

const InspectionFinding = require('../../../../models/InspectionFinding');

class UnusedCredentialsChecker {
    constructor(inspector) {
        this.inspector = inspector;
    }

    /**
     * 미사용 자격 증명 검사 실행
     */
    async runAllChecks(users) {
        const activeUsers = users || [];

        // 사용자가 없는 경우
        if (activeUsers.length === 0) {
            const finding = new InspectionFinding({
                resourceId: 'no-iam-users-credentials',
                resourceType: 'IAMUser',
                riskLevel: 'PASS',
                issue: '미사용 자격 증명 검사 - 통과 (사용자 없음)',
                recommendation: 'IAM 사용자 생성 시 정기적인 자격 증명 검토 정책을 수립하세요',
                details: {
                    totalUsers: 0,
                    status: '현재 미사용 자격 증명 관련 위험이 없습니다',
                    bestPractices: [
                        '자격 증명 정기 순환 정책 수립',
                        '90일 이상 미사용 키 자동 비활성화',
                        '액세스 키 사용 모니터링',
                        '최소 권한 원칙 적용'
                    ]
                },
                category: 'COMPLIANCE'
            });

            this.inspector.addFinding(finding);
            return;
        }

        // 각 사용자별 통합 자격 증명 검사만 수행
        for (const user of activeUsers) {
            try {
                this.checkUserCredentialsComprehensive(user);
            } catch (error) {
                this.inspector.recordError(error, {
                    operation: 'runAllChecks',
                    userName: user.UserName
                });
            }
        }

        // 전체 자격 증명 상태 요약은 제거 (개별 사용자 결과로 충분)
        // this.generateCredentialsSummary(activeUsers);
    }

    /**
     * 사용자별 통합 자격 증명 검사
     */
    checkUserCredentialsComprehensive(user) {
        const accessKeys = user.AccessKeys || [];
        const issues = [];
        const keyDetails = [];
        const activeKeys = accessKeys.filter(key => key.status === 'Active');
        
        const details = {
            userName: user.UserName,
            userId: user.UserId,
            createDate: user.CreateDate?.toISOString() || user.CreateDate,
            totalAccessKeys: accessKeys.length,
            activeAccessKeys: activeKeys.length,
            inactiveAccessKeys: accessKeys.length - activeKeys.length
        };

        // 액세스 키가 없는 경우 (콘솔 전용 사용자)
        if (accessKeys.length === 0) {
            const finding = new InspectionFinding({
                resourceId: user.UserName,
                resourceType: 'IAMUser',
                riskLevel: 'PASS',
                issue: '자격 증명 상태 - 통과 (콘솔 전용)',
                recommendation: '콘솔 전용 사용자로 액세스 키 관련 보안 위험이 없습니다.',
                details: {
                    ...details,
                    userType: 'CONSOLE_ONLY',
                    status: '콘솔 전용 사용자',
                    securityLevel: '높음 - 액세스 키 미사용'
                },
                category: 'SECURITY'
            });
            
            this.inspector.addFinding(finding);
            return;
        }

        // 각 액세스 키에 대한 상세 분석
        let oldKeysCount = 0;
        let unusedKeysCount = 0;
        let totalIssueScore = 0;

        accessKeys.forEach(accessKey => {
            const keyDetail = {
                accessKeyId: accessKey.accessKeyId,
                status: accessKey.status,
                createDate: accessKey.createDate?.toISOString() || accessKey.createDate,
                issues: []
            };

            // 1. 오래된 키 검사 (90일 이상)
            const createDate = new Date(accessKey.createDate);
            const daysSinceCreation = Math.floor((Date.now() - createDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysSinceCreation >= 90) {
                oldKeysCount++;
                keyDetail.issues.push(`${daysSinceCreation}일 동안 순환되지 않음`);
                totalIssueScore += daysSinceCreation >= 365 ? 3 : 2; // 1년 이상이면 더 높은 점수
            }

            // 2. 미사용 키 검사
            const lastUsed = accessKey.lastUsed;
            let daysSinceLastUse = 0;
            let isUnused = false;

            if (!lastUsed || !lastUsed.LastUsedDate) {
                // 한 번도 사용되지 않은 키
                daysSinceLastUse = daysSinceCreation;
                isUnused = daysSinceLastUse >= 30;
                keyDetail.lastUsed = 'Never';
            } else {
                const lastUsedDate = new Date(lastUsed.LastUsedDate);
                daysSinceLastUse = Math.floor((Date.now() - lastUsedDate.getTime()) / (1000 * 60 * 60 * 24));
                isUnused = daysSinceLastUse >= 60;
                keyDetail.lastUsed = lastUsed.LastUsedDate?.toISOString() || lastUsed.LastUsedDate;
                keyDetail.lastUsedService = lastUsed.ServiceName || 'N/A';
            }

            if (isUnused) {
                unusedKeysCount++;
                keyDetail.issues.push(`${daysSinceLastUse}일 동안 미사용`);
                totalIssueScore += daysSinceLastUse >= 180 ? 3 : 2; // 6개월 이상이면 더 높은 점수
            }

            keyDetails.push(keyDetail);
        });

        // 3. 중복 키 검사
        if (activeKeys.length > 1) {
            issues.push(`${activeKeys.length}개의 활성 액세스 키 보유 (권장: 1개)`);
            totalIssueScore += 1;
        }

        // 4. 비활성 사용자 검사
        if (activeKeys.length === 0 && accessKeys.length > 0) {
            issues.push('모든 액세스 키가 비활성화됨');
            totalIssueScore += 2;
        }

        // 전체 문제 요약
        if (oldKeysCount > 0) {
            issues.push(`${oldKeysCount}개의 오래된 키 (90일 이상)`);
        }
        if (unusedKeysCount > 0) {
            issues.push(`${unusedKeysCount}개의 미사용 키`);
        }

        // 위험도 결정 (점수 기반)
        let riskLevel = 'PASS';
        let status = '자격 증명 상태 양호';
        let recommendation = '현재 상태를 유지하고 정기적인 검토를 계속하세요.';

        if (totalIssueScore > 0) {
            if (totalIssueScore >= 6) {
                riskLevel = 'HIGH';
                status = '즉시 조치 필요';
                recommendation = '심각한 자격 증명 문제가 발견되었습니다. 즉시 키 순환 및 정리 작업을 수행하세요.';
            } else if (totalIssueScore >= 3) {
                riskLevel = 'MEDIUM';
                status = '개선 필요';
                recommendation = '자격 증명 관리 문제가 발견되었습니다. 가능한 빨리 문제를 해결하세요.';
            } else {
                riskLevel = 'LOW';
                status = '경미한 문제';
                recommendation = '일부 자격 증명 문제가 있습니다. 시간이 될 때 정리하세요.';
            }
        }

        // 결과 생성
        const finding = new InspectionFinding({
            resourceId: user.UserName,
            resourceType: 'IAMUser',
            riskLevel: riskLevel,
            issue: issues.length > 0 ? 
                `자격 증명 상태 - ${status}: ${issues.join(', ')}` : 
                '자격 증명 상태 - 통과',
            recommendation: recommendation,
            details: {
                ...details,
                status: status,
                issueScore: totalIssueScore,
                keyDetails: keyDetails,
                summary: {
                    oldKeysCount: oldKeysCount,
                    unusedKeysCount: unusedKeysCount,
                    multipleActiveKeys: activeKeys.length > 1,
                    allKeysInactive: activeKeys.length === 0 && accessKeys.length > 0
                },
                actionItems: [
                    oldKeysCount > 0 ? `${oldKeysCount}개의 오래된 액세스 키 순환` : null,
                    unusedKeysCount > 0 ? `${unusedKeysCount}개의 미사용 액세스 키 삭제` : null,
                    activeKeys.length > 1 ? '중복 액세스 키 정리 (1개만 유지)' : null,
                    activeKeys.length === 0 && accessKeys.length > 0 ? '비활성 사용자 검토 및 정리' : null
                ].filter(Boolean),
                bestPractices: [
                    '액세스 키는 90일마다 순환',
                    '미사용 키는 즉시 삭제',
                    '사용자당 최대 1개의 활성 키 유지',
                    '정기적인 키 사용 모니터링'
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
        
        if (!findings || findings.length === 0) {
            return recommendations;
        }

        const highRiskFindings = findings.filter(f => f.riskLevel === 'HIGH');
        const mediumRiskFindings = findings.filter(f => f.riskLevel === 'MEDIUM');
        
        if (highRiskFindings.length > 0) {
            recommendations.push('즉시 자격 증명 정리 작업을 수행하세요.');
            recommendations.push('오래된 액세스 키를 우선적으로 순환하세요.');
        }
        
        if (mediumRiskFindings.length > 0) {
            recommendations.push('자격 증명 관리 프로세스를 개선하세요.');
            recommendations.push('정기적인 액세스 키 검토를 수행하세요.');
        }
        
        recommendations.push('자동화된 키 관리 시스템 도입을 고려하세요.');
        
        return recommendations;
    }
}

module.exports = UnusedCredentialsChecker;