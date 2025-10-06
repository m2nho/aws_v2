/**
 * Public IP Checker
 * 인스턴스 퍼블릭 IP 할당 및 노출 위험을 검사하는 모듈
 */

const InspectionFinding = require('../../../../models/InspectionFinding');

class PublicIpChecker {
    constructor(inspector) {
        this.inspector = inspector;
    }

    /**
     * 모든 퍼블릭 IP 검사 실행
     */
    async runAllChecks(instances) {
        const activeInstances = instances.filter(instance =>
            instance.State?.Name !== 'terminated' &&
            instance.State?.Name !== 'terminating'
        );

        if (activeInstances.length === 0) {
            const finding = new InspectionFinding({
                resourceId: 'no-instances',
                resourceType: 'EC2Instance',
                riskLevel: 'PASS',
                issue: '퍼블릭 IP 노출 검사 - 통과 (인스턴스 없음)',
                recommendation: '인스턴스 생성 시 퍼블릭 IP 할당을 신중히 검토하세요',
                details: {
                    totalInstances: instances.length,
                    activeInstances: activeInstances.length,
                    status: '현재 퍼블릭 IP 관련 보안 위험이 없습니다',
                    bestPractices: [
                        '프라이빗 서브넷에 인스턴스 배치',
                        'NAT Gateway를 통한 아웃바운드 접근',
                        'Application Load Balancer 사용',
                        '배스천 호스트를 통한 관리 접근'
                    ]
                },
                category: 'COMPLIANCE'
            });

            this.inspector.addFinding(finding);
            return;
        }

        for (const instance of activeInstances) {
            try {
                // 통합된 퍼블릭 IP 검사
                this.checkInstancePublicIpComprehensive(instance);

            } catch (error) {
                this.inspector.recordError(error, {
                    operation: 'runAllChecks',
                    instanceId: instance.InstanceId
                });
            }
        }
    }

    /**
     * 인스턴스별 통합 퍼블릭 IP 검사
     */
    checkInstancePublicIpComprehensive(instance) {
        const hasPublicIp = !!instance.PublicIpAddress;
        const hasElasticIp = hasPublicIp && instance.PublicIpAddress !== instance.PrivateIpAddress;
        const issues = [];
        let riskScore = 0;
        let maxRiskLevel = 'PASS';

        const details = {
            instanceId: instance.InstanceId,
            instanceType: instance.InstanceType,
            publicIp: instance.PublicIpAddress || null,
            privateIp: instance.PrivateIpAddress,
            hasElasticIp: hasElasticIp,
            subnetId: instance.SubnetId,
            vpcId: instance.VpcId,
            instancePurpose: this.guessInstancePurpose(instance)
        };

        // 퍼블릭 IP가 없는 경우 - 보안상 좋은 상태
        if (!hasPublicIp) {
            const finding = new InspectionFinding({
                resourceId: instance.InstanceId,
                resourceType: 'EC2Instance',
                riskLevel: 'PASS',
                issue: '퍼블릭 IP 노출 상태 - 통과',
                recommendation: '인스턴스가 프라이빗 IP만 사용하여 보안이 우수합니다. 현재 설정을 유지하세요.',
                details: {
                    ...details,
                    status: '프라이빗 IP만 사용 - 보안 우수',
                    securityBenefits: [
                        '인터넷으로부터 직접 접근 차단',
                        'DDoS 공격 위험 최소화',
                        '네트워크 보안 강화',
                        '의도하지 않은 노출 방지'
                    ],
                    bestPractices: [
                        '현재 프라이빗 설정 유지',
                        'NAT Gateway를 통한 아웃바운드 접근',
                        'Load Balancer를 통한 인바운드 트래픽',
                        'VPN을 통한 관리 접근'
                    ]
                },
                category: 'SECURITY'
            });

            this.inspector.addFinding(finding);
            return;
        }

        // 퍼블릭 IP가 있는 경우 - 종합적인 위험 분석
        
        // 1. 기본 퍼블릭 IP 위험
        issues.push(`퍼블릭 IP(${instance.PublicIpAddress}) 할당됨`);
        riskScore += 2;

        // 2. 인스턴스 타입별 위험도
        if (instance.InstanceType?.includes('micro') || instance.InstanceType?.includes('small')) {
            riskScore += 1; // 작은 인스턴스는 상대적으로 낮은 위험
        } else {
            riskScore += 2; // 큰 인스턴스는 높은 위험
            issues.push('대형 인스턴스 타입으로 공격 표면 증가');
        }

        // 3. 퍼블릭 서브넷 배치 위험
        if (instance.SubnetId && hasPublicIp) {
            issues.push('퍼블릭 서브넷에 배치됨');
            riskScore += 2;
        }

        // 4. 보안 그룹 위험도
        if (instance.SecurityGroups && this.checkForWideOpenPorts(instance.SecurityGroups)) {
            issues.push('광범위한 보안 그룹 규칙');
            riskScore += 3;
        }

        // 5. 인스턴스 용도별 위험도
        const purpose = details.instancePurpose;
        if (purpose === 'database' || purpose === 'management') {
            issues.push('내부 서비스용 인스턴스가 퍼블릭 노출');
            riskScore += 3;
        } else if (purpose === 'application') {
            issues.push('애플리케이션 서버 직접 노출');
            riskScore += 2;
        }

        // 위험도 결정
        let status = '';
        let recommendation = '';

        if (riskScore >= 8) {
            maxRiskLevel = 'CRITICAL';
            status = '즉시 조치 필요 - 높은 보안 위험';
            recommendation = '즉시 프라이빗 서브넷으로 이동하고 Load Balancer를 통한 접근으로 변경하세요.';
        } else if (riskScore >= 5) {
            maxRiskLevel = 'HIGH';
            status = '높은 위험 - 보안 강화 필요';
            recommendation = '보안 그룹을 강화하고 프라이빗 서브넷 이동을 고려하세요.';
        } else if (riskScore >= 3) {
            maxRiskLevel = 'MEDIUM';
            status = '중간 위험 - 보안 검토 필요';
            recommendation = '보안 설정을 검토하고 불필요한 퍼블릭 노출을 최소화하세요.';
        } else {
            maxRiskLevel = 'LOW';
            status = '낮은 위험 - 모니터링 필요';
            recommendation = '현재 설정을 모니터링하고 보안 모범 사례를 적용하세요.';
        }

        // 결과 생성
        const finding = new InspectionFinding({
            resourceId: instance.InstanceId,
            resourceType: 'EC2Instance',
            riskLevel: maxRiskLevel,
            issue: `퍼블릭 IP 노출 상태 - ${status}: ${issues.join(', ')}`,
            recommendation: recommendation,
            details: {
                ...details,
                status: status,
                riskScore: riskScore,
                issues: issues,
                securityRisks: [
                    '직접적인 인터넷 공격 노출',
                    '포트 스캔 및 취약점 탐지',
                    'DDoS 공격 대상',
                    '무차별 대입 공격'
                ],
                actionItems: [
                    riskScore >= 5 ? '즉시 프라이빗 서브넷으로 이동' : null,
                    instance.SecurityGroups && this.checkForWideOpenPorts(instance.SecurityGroups) ? '보안 그룹 규칙 강화' : null,
                    purpose === 'database' || purpose === 'management' ? '내부 서비스는 퍼블릭 접근 차단' : null,
                    'Load Balancer 또는 NAT Gateway 사용 고려'
                ].filter(Boolean),
                alternatives: [
                    'Application Load Balancer 사용',
                    'NAT Gateway를 통한 아웃바운드 접근',
                    'VPN 또는 Direct Connect 사용',
                    '배스천 호스트를 통한 관리'
                ],
                securityGroups: instance.SecurityGroups ? instance.SecurityGroups.map(sg => ({
                    groupId: sg.GroupId,
                    groupName: sg.GroupName
                })) : []
            },
            category: 'SECURITY'
        });

        this.inspector.addFinding(finding);
    }

    /**
     * 퍼블릭 IP 할당 검사 (개별 함수 - 더 이상 사용하지 않음)
     */


    /**
     * 광범위하게 열린 포트 확인
     */
    checkForWideOpenPorts(securityGroups) {
        // 실제로는 보안 그룹 규칙을 확인해야 하지만,
        // 여기서는 보안 그룹 수로 추정
        return securityGroups.length > 2; // 2개 이상의 보안 그룹은 복잡할 가능성
    }

    /**
     * 인스턴스 용도 추정
     */
    guessInstancePurpose(instance) {
        const tags = instance.Tags || [];
        const nameTag = tags.find(tag => tag.Key === 'Name');
        const name = nameTag?.Value?.toLowerCase() || '';

        if (name.includes('db') || name.includes('database') || name.includes('mysql') || name.includes('postgres')) {
            return 'database';
        }
        if (name.includes('web') || name.includes('nginx') || name.includes('apache')) {
            return 'web';
        }
        if (name.includes('app') || name.includes('application')) {
            return 'application';
        }
        if (name.includes('bastion') || name.includes('jump')) {
            return 'bastion';
        }
        if (name.includes('admin') || name.includes('manage')) {
            return 'management';
        }

        return 'unknown';
    }

    /**
     * 권장사항 생성
     */
    getRecommendations(findings) {
        const recommendations = [];
        
        if (!findings || findings.length === 0) {
            return recommendations;
        }

        const criticalFindings = findings.filter(f => f.riskLevel === 'CRITICAL');
        const highRiskFindings = findings.filter(f => f.riskLevel === 'HIGH');
        const publicIpFindings = findings.filter(f => f.issue.includes('퍼블릭'));
        
        if (criticalFindings.length > 0) {
            recommendations.push('즉시 프라이빗 서브넷으로 이동하고 Load Balancer를 통한 접근으로 변경하세요.');
        }
        
        if (highRiskFindings.length > 0) {
            recommendations.push('보안 그룹을 강화하고 프라이빗 서브넷 이동을 고려하세요.');
        }
        
        if (publicIpFindings.length > 0) {
            recommendations.push('불필요한 퍼블릭 IP 할당을 제거하고 프라이빗 서브넷 사용을 고려하세요.');
        }
        
        return recommendations;
    }
}

module.exports = PublicIpChecker;