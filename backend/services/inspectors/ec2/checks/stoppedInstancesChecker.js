const InspectionFinding = require('../../../../models/InspectionFinding');

class StoppedInstancesChecker {
    constructor(inspector) {
        this.inspector = inspector;
    }

    async runAllChecks(instances) {
        // 다른 검사 모듈과 동일한 패턴 사용
        const activeInstances = instances.filter(instance =>
            instance.State?.Name !== 'terminated' &&
            instance.State?.Name !== 'terminating'
        );

        // 1. 인스턴스가 없는 경우
        if (activeInstances.length === 0) {
            const finding = new InspectionFinding({
                resourceId: 'no-instances',
                resourceType: 'EC2Instance',
                riskLevel: 'LOW',
                issue: '인스턴스가 없어 중지된 인스턴스 검사가 불필요합니다',
                recommendation: '향후 인스턴스 사용 시 비용 최적화를 위해 정기적으로 사용량을 검토하세요',
                details: {
                    totalInstances: instances.length,
                    activeInstances: activeInstances.length,
                    status: '현재 비용 최적화 관련 위험이 없습니다',
                    bestPractices: [
                        '인스턴스 사용 후 불필요시 즉시 종료',
                        '정기적인 인스턴스 사용량 검토',
                        'Auto Scaling 활용으로 자동 관리',
                        '스케줄링을 통한 자동 시작/중지'
                    ]
                },
                category: 'COST_OPTIMIZATION'
            });

            this.inspector.addFinding(finding);
            return;
        }

        // 2. 중지된 인스턴스 검사
        for (const instance of activeInstances) {
            try {
                // 1. 중지된 인스턴스 검사
                this.checkStoppedInstances(instance);

                // 2. 장기간 중지된 인스턴스 검사
                this.checkLongTermStoppedInstances(instance);

            } catch (error) {
                this.inspector.recordError(error, {
                    operation: 'runAllChecks',
                    instanceId: instance.InstanceId
                });
            }
        }
    }

    /**
     * 중지된 기간 계산 (대략적)
     */
    calculateStoppedDuration(instance) {
        const now = new Date();
        const launchTime = new Date(instance.LaunchTime);
        
        // StateTransitionReason에서 중지 시간 추출 시도
        const stateReason = instance.StateTransitionReason || '';
        const timeMatch = stateReason.match(/\((\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
        
        let stoppedTime;
        if (timeMatch) {
            stoppedTime = new Date(timeMatch[1] + ' UTC');
        } else {
            // 정확한 중지 시간을 알 수 없는 경우 런치 시간 기준으로 추정
            stoppedTime = launchTime;
        }
        
        const diffTime = Math.abs(now - stoppedTime);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // 일 단위
    }

    /**
     * 월 예상 비용 계산
     */
    estimateMonthlyCost(instanceType) {
        // 대략적인 월 비용 (실제 비용은 리전별로 다름)
        const hourlyCosts = {
            't3.micro': 0.0104,
            't3.small': 0.0208,
            't3.medium': 0.0416,
            't3.large': 0.0832,
            't3.xlarge': 0.1664,
            'm5.large': 0.096,
            'm5.xlarge': 0.192,
            'm5.2xlarge': 0.384,
            'c5.large': 0.085,
            'c5.xlarge': 0.17,
            'r5.large': 0.126,
            'r5.xlarge': 0.252
        };

        const hourlyCost = hourlyCosts[instanceType] || 0.1;
        const monthlyCost = hourlyCost * 24 * 30;
        
        return `$${monthlyCost.toFixed(2)}`;
    }

    /**
     * 잠재적 절약 비용 계산
     */
    calculatePotentialSavings(instance, stoppedDays) {
        const instanceType = instance.InstanceType;
        const hourlyCosts = {
            't3.micro': 0.0104,
            't3.small': 0.0208,
            't3.medium': 0.0416,
            't3.large': 0.0832,
            't3.xlarge': 0.1664,
            'm5.large': 0.096,
            'm5.xlarge': 0.192,
            'm5.2xlarge': 0.384,
            'c5.large': 0.085,
            'c5.xlarge': 0.17,
            'r5.large': 0.126,
            'r5.xlarge': 0.252
        };

        const hourlyCost = hourlyCosts[instanceType] || 0.1;
        const totalSavings = hourlyCost * 24 * stoppedDays;
        
        return `$${totalSavings.toFixed(2)} (${stoppedDays}일간)`;
    }

    /**
     * EBS 볼륨 정보 추출
     */
    getEBSVolumeInfo(instance) {
        const volumes = [];
        
        if (instance.BlockDeviceMappings) {
            instance.BlockDeviceMappings.forEach(mapping => {
                if (mapping.Ebs) {
                    volumes.push({
                        deviceName: mapping.DeviceName,
                        volumeId: mapping.Ebs.VolumeId,
                        status: mapping.Ebs.Status,
                        deleteOnTermination: mapping.Ebs.DeleteOnTermination
                    });
                }
            });
        }
        
        return volumes;
    }

    /**
     * 중지 기간에 따른 권장사항 생성
     */
    getRecommendationByDuration(days, instanceName) {
        if (days >= 180) {
            return `${instanceName} 인스턴스가 ${days}일간 중지되어 있습니다. 장기간 사용하지 않는 경우 AMI를 생성한 후 인스턴스를 종료하여 EBS 볼륨 비용을 절약하세요.`;
        } else if (days >= 90) {
            return `${instanceName} 인스턴스가 ${days}일간 중지되어 있습니다. 계속 사용할 계획이 없다면 종료를 고려하세요. 필요시 스냅샷을 생성하여 데이터를 보존할 수 있습니다.`;
        } else if (days >= 30) {
            return `${instanceName} 인스턴스가 ${days}일간 중지되어 있습니다. 사용 계획을 검토하고 불필요한 경우 종료하여 비용을 절약하세요.`;
        }
        
        return '장기간 중지된 인스턴스의 사용 계획을 검토하세요.';
    }

    /**
     * 중지된 인스턴스 검사
     */
    checkStoppedInstances(instance) {
        if (instance.State?.Name === 'stopped') {
            const instanceName = this.getInstanceName(instance);
            const stoppedDuration = this.calculateStoppedDuration(instance);
            
            const finding = new InspectionFinding({
                resourceId: instance.InstanceId,
                resourceType: 'EC2Instance',
                riskLevel: 'LOW',
                issue: `인스턴스가 중지된 상태입니다 (${stoppedDuration}일)`,
                recommendation: '사용 계획을 검토하고 불필요한 경우 종료를 고려하세요',
                details: {
                    instanceId: instance.InstanceId,
                    instanceName: instanceName,
                    instanceType: instance.InstanceType,
                    state: instance.State.Name,
                    stoppedDuration: `${stoppedDuration}일`,
                    estimatedMonthlyCost: this.estimateMonthlyCost(instance.InstanceType),
                    costOptimizationTips: [
                        '30일 이상 중지 시 종료 고려',
                        'AMI 생성 후 종료',
                        'EBS 볼륨 비용도 발생함',
                        '정기적인 사용 계획 검토'
                    ]
                },
                category: 'COST_OPTIMIZATION'
            });

            this.inspector.addFinding(finding);
        }
    }

    /**
     * 장기간 중지된 인스턴스 검사
     */
    checkLongTermStoppedInstances(instance) {
        if (instance.State?.Name === 'stopped') {
            const stoppedDuration = this.calculateStoppedDuration(instance);
            
            if (stoppedDuration >= 30) {
                const instanceName = this.getInstanceName(instance);
                const monthlyCost = this.estimateMonthlyCost(instance.InstanceType);
                const potentialSavings = this.calculatePotentialSavings(instance, stoppedDuration);
                
                const finding = new InspectionFinding({
                    resourceId: instance.InstanceId,
                    resourceType: 'EC2Instance',
                    riskLevel: stoppedDuration >= 90 ? 'HIGH' : 'MEDIUM',
                    issue: `인스턴스가 ${stoppedDuration}일 동안 장기간 중지된 상태입니다`,
                    recommendation: this.getRecommendationByDuration(stoppedDuration, instanceName),
                    details: {
                        instanceId: instance.InstanceId,
                        instanceName: instanceName,
                        instanceType: instance.InstanceType,
                        state: instance.State.Name,
                        stateReason: instance.StateReason?.Message || 'N/A',
                        launchTime: instance.LaunchTime,
                        platform: instance.Platform || 'Linux/Unix',
                        availabilityZone: instance.Placement?.AvailabilityZone,
                        stoppedDuration: `${stoppedDuration}일`,
                        estimatedMonthlyCost: monthlyCost,
                        potentialSavings: potentialSavings,
                        ebsVolumes: this.getEBSVolumeInfo(instance),
                        costOptimizationOptions: [
                            '인스턴스 종료 (EBS 볼륨 유지 가능)',
                            'AMI 생성 후 인스턴스 종료',
                            '스냅샷 생성 후 볼륨 삭제',
                            '필요시 Reserved Instance 해지'
                        ],
                        considerations: [
                            '중지된 인스턴스도 EBS 볼륨 비용 발생',
                            'Elastic IP 연결 시 추가 비용',
                            '재시작 시 퍼블릭 IP 변경 가능성',
                            '데이터 백업 확인 필요'
                        ]
                    },
                    category: 'COST_OPTIMIZATION'
                });

                this.inspector.addFinding(finding);
            }
        }
    }

    /**
     * 인스턴스 이름 추출
     */
    getInstanceName(instance) {
        const nameTag = instance.Tags?.find(tag => tag.Key === 'Name');
        return nameTag?.Value || 'Unnamed';
    }



    /**
     * 권장사항 생성
     */
    getRecommendations(findings) {
        const recommendations = [];
        const stoppedFindings = findings.filter(f => 
            f.issue && (f.issue.includes('중지된') || f.issue.includes('stopped'))
        );

        if (stoppedFindings.length > 0) {
            const longTermFindings = stoppedFindings.filter(f => 
                f.riskLevel === 'HIGH' || f.riskLevel === 'MEDIUM'
            );
            
            if (longTermFindings.length > 0) {
                recommendations.push('장기간 중지된 인스턴스를 정리하여 비용을 절감하세요.');
                recommendations.push('AMI 생성 후 불필요한 인스턴스를 종료하는 것을 고려하세요.');
            }

            const shortTermFindings = stoppedFindings.filter(f => 
                f.issue.includes('30일 미만')
            );
            if (shortTermFindings.length > 0) {
                recommendations.push('중지된 인스턴스의 사용 계획을 정기적으로 검토하세요.');
            }
        }

        return recommendations;
    }
}

module.exports = StoppedInstancesChecker;