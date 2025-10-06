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
                riskLevel: 'LOW',
                issue: 'IAM 사용자가 없어 미사용 자격 증명 검사가 불필요합니다',
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

        // 각 사용자별 자격 증명 검사
        for (const user of activeUsers) {
            try {
                // 1. 오래된 액세스 키 검사
                this.checkOldAccessKeys(user);

                // 2. 미사용 액세스 키 검사
                this.checkUnusedAccessKeys(user);

                // 3. 비활성 사용자 검사
                this.checkInactiveUsers(user);

                // 4. 중복 액세스 키 검사
                this.checkMultipleAccessKeys(user);

            } catch (error) {
                this.inspector.recordError(error, {
                    operation: 'runAllChecks',
                    userName: user.UserName
                });
            }
        }

        // 전체 자격 증명 상태 요약
        this.generateCredentialsSummary(activeUsers);
    }

    /**
     * 오래된 액세스 키 검사
     */
    checkOldAccessKeys(user) {
        const accessKeys = user.AccessKeys || [];
        const ninetyDaysAgo = new Date(Date.now() - (90 * 24 * 60 * 60 * 1000));

        accessKeys.forEach(accessKey => {
            const createDate = new Date(accessKey.createDate);
            const daysSinceCreation = Math.floor((Date.now() - createDate.getTime()) / (1000 * 60 * 60 * 24));

            if (daysSinceCreation >= 90) {
                const finding = new InspectionFinding({
                    resourceId: `${user.UserName}-old-key-${accessKey.accessKeyId}`,
                    resourceType: 'IAMAccessKey',
                    riskLevel: daysSinceCreation >= 365 ? 'HIGH' : 'MEDIUM',
                    issue: `사용자 '${user.UserName}'의 액세스 키가 ${daysSinceCreation}일 동안 순환되지 않았습니다`,
                    recommendation: 'IAM 콘솔에서 새 액세스 키를 생성하고 애플리케이션 업데이트 후 기존 키를 삭제하세요',
                    details: {
                        userName: user.UserName,
                        accessKeyId: accessKey.accessKeyId,
                        createDate: accessKey.createDate?.toISOString() || accessKey.createDate,
                        daysSinceCreation: daysSinceCreation,
                        status: accessKey.status,
                        securityRisks: [
                            '장기간 사용된 키는 노출 위험 증가',
                            '키 탈취 시 장기간 악용 가능',
                            '로그 분석을 통한 패턴 노출',
                            '내부자 위협 증가'
                        ],
                        rotationBenefits: [
                            '키 노출 위험 최소화',
                            '보안 사고 영향 범위 제한',
                            '컴플라이언스 요구사항 충족',
                            '보안 모범 사례 준수'
                        ],
                        rotationSteps: [
                            '새 액세스 키 생성',
                            '애플리케이션에서 새 키로 업데이트',
                            '새 키 동작 확인',
                            '기존 키 비활성화 후 삭제'
                        ],
                        automationOptions: [
                            'AWS Secrets Manager 사용',
                            'AWS Systems Manager Parameter Store',
                            'CI/CD 파이프라인 통합',
                            '자동 순환 스크립트 구현'
                        ]
                    },
                    category: 'SECURITY'
                });

                this.inspector.addFinding(finding);
            }
        });
    }

    /**
     * 미사용 액세스 키 검사
     */
    checkUnusedAccessKeys(user) {
        const accessKeys = user.AccessKeys || [];
        const sixtyDaysAgo = new Date(Date.now() - (60 * 24 * 60 * 60 * 1000));

        accessKeys.forEach(accessKey => {
            const lastUsed = accessKey.lastUsed;
            let isUnused = false;
            let daysSinceLastUse = 0;

            if (!lastUsed || !lastUsed.LastUsedDate) {
                // 한 번도 사용되지 않은 키
                const createDate = new Date(accessKey.createDate);
                daysSinceLastUse = Math.floor((Date.now() - createDate.getTime()) / (1000 * 60 * 60 * 24));
                isUnused = daysSinceLastUse >= 30; // 30일 이상 미사용
            } else {
                const lastUsedDate = new Date(lastUsed.LastUsedDate);
                daysSinceLastUse = Math.floor((Date.now() - lastUsedDate.getTime()) / (1000 * 60 * 60 * 24));
                isUnused = daysSinceLastUse >= 60; // 60일 이상 미사용
            }

            if (isUnused) {
                const finding = new InspectionFinding({
                    resourceId: `${user.UserName}-unused-key-${accessKey.accessKeyId}`,
                    resourceType: 'IAMAccessKey',
                    riskLevel: daysSinceLastUse >= 180 ? 'HIGH' : 'MEDIUM',
                    issue: `사용자 '${user.UserName}'의 액세스 키가 ${daysSinceLastUse}일 동안 사용되지 않았습니다`,
                    recommendation: 'IAM 콘솔에서 해당 액세스 키를 먼저 비활성화하고 7일 후 완전 삭제하세요',
                    details: {
                        userName: user.UserName,
                        accessKeyId: accessKey.accessKeyId,
                        createDate: accessKey.createDate?.toISOString() || accessKey.createDate,
                        lastUsedDate: lastUsed?.LastUsedDate?.toISOString() || lastUsed?.LastUsedDate || 'Never',
                        lastUsedService: lastUsed?.ServiceName || 'N/A',
                        lastUsedRegion: lastUsed?.Region || 'N/A',
                        daysSinceLastUse: daysSinceLastUse,
                        status: accessKey.status,
                        unusedKeyRisks: [
                            '불필요한 공격 표면 증가',
                            '키 탈취 시 악용 가능',
                            '권한 남용 위험',
                            '컴플라이언스 위반 가능성'
                        ],
                        cleanupBenefits: [
                            '공격 표면 축소',
                            '보안 위험 감소',
                            '관리 복잡성 감소',
                            '감사 효율성 향상'
                        ],
                        cleanupSteps: [
                            '키 사용 여부 최종 확인',
                            '관련 애플리케이션 영향 분석',
                            '키 비활성화 (즉시 삭제 대신)',
                            '일정 기간 후 완전 삭제'
                        ],
                        monitoringTips: [
                            'CloudTrail을 통한 키 사용 추적',
                            '정기적인 액세스 키 감사',
                            '자동화된 미사용 키 탐지',
                            '키 사용 패턴 분석'
                        ]
                    },
                    category: 'SECURITY'
                });

                this.inspector.addFinding(finding);
            }
        });
    }

    /**
     * 비활성 사용자 검사
     */
    checkInactiveUsers(user) {
        const accessKeys = user.AccessKeys || [];
        const hasActiveKeys = accessKeys.some(key => key.status === 'Active');
        
        if (!hasActiveKeys && accessKeys.length > 0) {
            // 모든 액세스 키가 비활성화된 사용자
            const finding = new InspectionFinding({
                resourceId: `${user.UserName}-inactive-user`,
                resourceType: 'IAMUser',
                riskLevel: 'MEDIUM',
                issue: `사용자 '${user.UserName}'의 모든 액세스 키가 비활성화되어 있습니다`,
                recommendation: '사용자의 정책과 그룹을 확인한 후 IAM 콘솔에서 사용자를 삭제하세요',
                details: {
                    userName: user.UserName,
                    userId: user.UserId,
                    createDate: user.CreateDate?.toISOString() || user.CreateDate,
                    totalAccessKeys: accessKeys.length,
                    activeAccessKeys: 0,
                    inactiveAccessKeys: accessKeys.length,
                    userStatus: 'INACTIVE',
                    inactiveUserRisks: [
                        '불필요한 계정 유지',
                        '향후 실수로 활성화 가능성',
                        '감사 복잡성 증가',
                        '관리 오버헤드'
                    ],
                    cleanupConsiderations: [
                        '사용자 권한 및 정책 검토',
                        '연결된 리소스 확인',
                        '그룹 멤버십 검토',
                        '백업 및 로그 보존'
                    ],
                    deletionSteps: [
                        '사용자 활동 이력 검토',
                        '연결된 정책 및 그룹 확인',
                        '관련 팀과 삭제 계획 협의',
                        '사용자 삭제 실행'
                    ],
                    alternativeActions: [
                        '사용자 일시 비활성화',
                        '권한 최소화',
                        '정기 검토 대상으로 분류',
                        '자동화된 정리 프로세스 적용'
                    ]
                },
                category: 'COST_OPTIMIZATION'
            });

            this.inspector.addFinding(finding);
        }
    }

    /**
     * 중복 액세스 키 검사
     */
    checkMultipleAccessKeys(user) {
        const accessKeys = user.AccessKeys || [];
        const activeKeys = accessKeys.filter(key => key.status === 'Active');

        if (activeKeys.length > 1) {
            const finding = new InspectionFinding({
                resourceId: `${user.UserName}-multiple-keys`,
                resourceType: 'IAMUser',
                riskLevel: 'MEDIUM',
                issue: `사용자 '${user.UserName}'가 ${activeKeys.length}개의 활성 액세스 키를 보유하고 있습니다`,
                recommendation: '사용하지 않는 액세스 키를 IAM 콘솔에서 삭제하고 사용자당 1개의 키만 유지하세요',
                details: {
                    userName: user.UserName,
                    totalAccessKeys: accessKeys.length,
                    activeAccessKeys: activeKeys.length,
                    accessKeyDetails: activeKeys.map(key => ({
                        accessKeyId: key.accessKeyId,
                        createDate: key.createDate?.toISOString() || key.createDate,
                        lastUsed: key.lastUsed?.LastUsedDate?.toISOString() || key.lastUsed?.LastUsedDate || 'Never',
                        lastUsedService: key.lastUsed?.ServiceName || 'N/A'
                    })),
                    multipleKeyRisks: [
                        '관리 복잡성 증가',
                        '키 노출 위험 증가',
                        '사용 추적 어려움',
                        '순환 관리 복잡성'
                    ],
                    bestPractices: [
                        '사용자당 최대 1개의 활성 키 유지',
                        '키 순환 시에만 임시로 2개 사용',
                        '각 키의 사용 목적 명확히 구분',
                        '정기적인 키 사용 검토'
                    ],
                    consolidationSteps: [
                        '각 키의 사용 목적 파악',
                        '주요 키 선택',
                        '애플리케이션을 주요 키로 통합',
                        '불필요한 키 삭제'
                    ],
                    keyManagementTips: [
                        '키 사용 목적 태그 지정',
                        '키별 사용 모니터링',
                        '자동화된 키 순환 구현',
                        '키 사용 정책 수립'
                    ]
                },
                category: 'SECURITY'
            });

            this.inspector.addFinding(finding);
        }
    }

    /**
     * 전체 자격 증명 상태 요약
     */
    generateCredentialsSummary(users) {
        const totalUsers = users.length;
        const usersWithAccessKeys = users.filter(user => (user.AccessKeys || []).length > 0).length;
        const totalAccessKeys = users.reduce((sum, user) => sum + (user.AccessKeys || []).length, 0);
        const activeAccessKeys = users.reduce((sum, user) => 
            sum + (user.AccessKeys || []).filter(key => key.status === 'Active').length, 0);

        // 오래된 키 계산
        const oldKeys = users.reduce((count, user) => {
            return count + (user.AccessKeys || []).filter(key => {
                const createDate = new Date(key.createDate);
                const daysSinceCreation = Math.floor((Date.now() - createDate.getTime()) / (1000 * 60 * 60 * 24));
                return daysSinceCreation >= 90;
            }).length;
        }, 0);

        // 미사용 키 계산
        const unusedKeys = users.reduce((count, user) => {
            return count + (user.AccessKeys || []).filter(key => {
                const lastUsed = key.lastUsed;
                if (!lastUsed || !lastUsed.LastUsedDate) {
                    const createDate = new Date(key.createDate);
                    const daysSinceCreation = Math.floor((Date.now() - createDate.getTime()) / (1000 * 60 * 60 * 24));
                    return daysSinceCreation >= 30;
                } else {
                    const lastUsedDate = new Date(lastUsed.LastUsedDate);
                    const daysSinceLastUse = Math.floor((Date.now() - lastUsedDate.getTime()) / (1000 * 60 * 60 * 24));
                    return daysSinceLastUse >= 60;
                }
            }).length;
        }, 0);

        let riskLevel = 'LOW';
        let issue = '';
        let recommendation = '';

        if (oldKeys === 0 && unusedKeys === 0) {
            issue = `모든 액세스 키가 적절히 관리되고 있어 자격 증명 보안 상태가 우수합니다`;
            recommendation = '현재 상태를 유지하고 정기적인 검토를 계속하세요';
        } else if (oldKeys > 0 || unusedKeys > 0) {
            const totalProblematicKeys = oldKeys + unusedKeys;
            const problemRate = Math.round((totalProblematicKeys / Math.max(totalAccessKeys, 1)) * 100);
            
            if (problemRate >= 50) {
                riskLevel = 'HIGH';
                issue = `${totalProblematicKeys}개의 문제가 있는 액세스 키가 발견되었습니다 (전체의 ${problemRate}%)`;
                recommendation = '즉시 자격 증명 정리 작업을 수행하고 관리 정책을 강화하세요';
            } else if (problemRate >= 20) {
                riskLevel = 'MEDIUM';
                issue = `${totalProblematicKeys}개의 문제가 있는 액세스 키가 발견되었습니다 (전체의 ${problemRate}%)`;
                recommendation = '문제가 있는 액세스 키를 정리하고 정기적인 관리 프로세스를 수립하세요';
            } else {
                riskLevel = 'LOW';
                issue = `소수의 문제가 있는 액세스 키(${totalProblematicKeys}개)가 발견되었습니다`;
                recommendation = '문제가 있는 키를 정리하고 현재 관리 수준을 유지하세요';
            }
        }

        const finding = new InspectionFinding({
            resourceId: 'credentials-management-summary',
            resourceType: 'IAMUser',
            riskLevel: riskLevel,
            issue: issue,
            recommendation: recommendation,
            details: {
                totalUsers: totalUsers,
                usersWithAccessKeys: usersWithAccessKeys,
                totalAccessKeys: totalAccessKeys,
                activeAccessKeys: activeAccessKeys,
                inactiveAccessKeys: totalAccessKeys - activeAccessKeys,
                oldKeys: oldKeys,
                unusedKeys: unusedKeys,
                credentialsHealthScore: Math.max(0, 100 - Math.round(((oldKeys + unusedKeys) / Math.max(totalAccessKeys, 1)) * 100)),
                managementMetrics: {
                    keyRotationCompliance: Math.round(((totalAccessKeys - oldKeys) / Math.max(totalAccessKeys, 1)) * 100) + '%',
                    keyUtilizationRate: Math.round(((totalAccessKeys - unusedKeys) / Math.max(totalAccessKeys, 1)) * 100) + '%',
                    averageKeyAge: this.calculateAverageKeyAge(users) + '일'
                },
                improvementAreas: [
                    oldKeys > 0 ? `${oldKeys}개의 오래된 키 순환 필요` : null,
                    unusedKeys > 0 ? `${unusedKeys}개의 미사용 키 정리 필요` : null,
                    '자동화된 키 관리 프로세스 도입',
                    '정기적인 자격 증명 감사 수행'
                ].filter(Boolean),
                organizationalBenefits: [
                    '보안 위험 감소',
                    '컴플라이언스 준수',
                    '관리 효율성 향상',
                    '운영 비용 절감'
                ]
            },
            category: 'SECURITY'
        });

        this.inspector.addFinding(finding);
    }

    /**
     * 평균 키 나이 계산
     */
    calculateAverageKeyAge(users) {
        const allKeys = users.reduce((keys, user) => {
            return keys.concat(user.AccessKeys || []);
        }, []);

        if (allKeys.length === 0) return 0;

        const totalAge = allKeys.reduce((sum, key) => {
            const createDate = new Date(key.createDate);
            const age = Math.floor((Date.now() - createDate.getTime()) / (1000 * 60 * 60 * 24));
            return sum + age;
        }, 0);

        return Math.round(totalAge / allKeys.length);
    }

    /**
     * 권장사항 생성
     */
    getRecommendations(findings) {
        const recommendations = [];
        const credentialFindings = findings.filter(f => 
            f.issue && (f.issue.includes('액세스 키') || f.issue.includes('자격 증명'))
        );

        if (credentialFindings.length > 0) {
            const oldKeyFindings = credentialFindings.filter(f => 
                f.issue.includes('순환') || f.issue.includes('오래된')
            );
            if (oldKeyFindings.length > 0) {
                recommendations.push('90일 이상 된 액세스 키를 순환하세요.');
                recommendations.push('자동화된 키 순환 프로세스를 구현하세요.');
            }

            const unusedKeyFindings = credentialFindings.filter(f => 
                f.issue.includes('미사용') || f.issue.includes('사용되지 않')
            );
            if (unusedKeyFindings.length > 0) {
                recommendations.push('미사용 액세스 키를 정리하세요.');
                recommendations.push('정기적인 액세스 키 사용 검토를 수행하세요.');
            }

            const multipleKeyFindings = credentialFindings.filter(f => 
                f.issue.includes('중복') || f.issue.includes('여러')
            );
            if (multipleKeyFindings.length > 0) {
                recommendations.push('사용자당 최소한의 액세스 키만 유지하세요.');
            }

            const summaryFindings = credentialFindings.filter(f => 
                f.issue.includes('요약') || f.issue.includes('전체')
            );
            if (summaryFindings.length > 0) {
                recommendations.push('조직 차원의 자격 증명 관리 정책을 수립하고 정기적으로 검토하세요.');
            }
        }

        return recommendations;
    }
}

module.exports = UnusedCredentialsChecker;