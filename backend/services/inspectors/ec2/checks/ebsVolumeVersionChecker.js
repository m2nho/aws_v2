/**
 * EBS Volume Version Checker
 * EBS 볼륨 타입 및 버전을 검사하는 모듈
 */

const InspectionFinding = require('../../../../models/InspectionFinding');

class EBSVolumeVersionChecker {
  constructor(inspector) {
    this.inspector = inspector;
  }

  /**
   * EBS 볼륨 버전 검사 실행
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
        riskLevel: 'LOW',
        issue: '인스턴스가 없어 EBS 볼륨 버전 검사가 불필요합니다',
        recommendation: '인스턴스 생성 시 최신 EBS 볼륨 타입을 사용하세요',
        details: {
          totalInstances: instances.length,
          activeInstances: activeInstances.length,
          status: '현재 EBS 볼륨 관련 문제가 없습니다',
          recommendedVolumeTypes: ['gp3', 'io2', 'gp2']
        },
        category: 'COMPLIANCE'
      });
      
      this.inspector.addFinding(finding);
      return;
    }

    for (const instance of activeInstances) {
      try {
        // 1. 구형 EBS 볼륨 타입 검사
        this.checkLegacyVolumeTypes(instance);

        // 2. GP2에서 GP3 업그레이드 권장
        this.checkGP2ToGP3Upgrade(instance);

        // 3. 볼륨 성능 최적화 권장
        this.checkVolumePerformanceOptimization(instance);

        // 4. 볼륨 크기 최적화 권장
        this.checkVolumeSizeOptimization(instance);

      } catch (error) {
        this.inspector.recordError(error, {
          operation: 'runAllChecks',
          instanceId: instance.InstanceId
        });
      }
    }
  }

  /**
   * 구형 EBS 볼륨 타입 검사
   */
  checkLegacyVolumeTypes(instance) {
    if (!instance.BlockDeviceMappings) return;

    const legacyVolumes = [];
    
    instance.BlockDeviceMappings.forEach(mapping => {
      if (mapping.Ebs) {
        // 실제로는 DescribeVolumes API를 호출해야 하지만, 여기서는 추정
        // 볼륨 ID 패턴이나 생성 시간으로 추정 가능
        const volumeId = mapping.Ebs.VolumeId;
        
        // 구형 볼륨 타입 추정 (실제로는 API 호출 필요)
        if (this.isLikelyLegacyVolume(mapping, instance)) {
          legacyVolumes.push({
            volumeId: volumeId,
            deviceName: mapping.DeviceName,
            estimatedType: 'gp2 or older'
          });
        }
      }
    });

    if (legacyVolumes.length > 0) {
      const finding = new InspectionFinding({
        resourceId: instance.InstanceId,
        resourceType: 'EC2Instance',
        riskLevel: 'MEDIUM',
        issue: `구형 EBS 볼륨 타입을 사용하고 있을 가능성이 있습니다 (기준: 2년 이상 된 인스턴스)`,
        recommendation: '최신 EBS 볼륨 타입(gp3, io2)으로 업그레이드를 고려하세요',
        details: {
          instanceId: instance.InstanceId,
          detectionCriteria: {
            method: '인스턴스 생성 시간 기반 추정',
            condition: '인스턴스 생성일이 2년 이상 경과',
            limitation: '실제 볼륨 타입은 AWS 콘솔에서 확인 필요'
          },
          instanceName: this.getInstanceName(instance),
          potentialLegacyVolumes: legacyVolumes.length,
          volumes: legacyVolumes,
          modernVolumeTypes: {
            gp3: {
              benefits: ['20% 저렴한 비용', '독립적인 IOPS 설정', '더 나은 성능'],
              useCase: '일반적인 워크로드'
            },
            io2: {
              benefits: ['99.999% 내구성', '높은 IOPS', '일관된 성능'],
              useCase: '고성능 데이터베이스'
            },
            io2_block_express: {
              benefits: ['최고 성능', '64,000 IOPS', '4,000 MB/s 처리량'],
              useCase: '극고성능 워크로드'
            }
          },
          migrationConsiderations: [
            '볼륨 타입 변경은 온라인으로 가능',
            '성능 향상 및 비용 절감 효과',
            '다운타임 없이 업그레이드 가능',
            '백업 후 진행 권장'
          ]
        },
        category: 'PERFORMANCE'
      });

      this.inspector.addFinding(finding);
    }
  }

  /**
   * GP2에서 GP3 업그레이드 권장
   */
  checkGP2ToGP3Upgrade(instance) {
    if (!instance.BlockDeviceMappings) return;

    const volumesForUpgrade = instance.BlockDeviceMappings.filter(mapping => 
      mapping.Ebs && mapping.Ebs.VolumeSize >= 100 // 100GB 이상의 볼륨
    );

    if (volumesForUpgrade.length > 0) {
      const finding = new InspectionFinding({
        resourceId: instance.InstanceId,
        resourceType: 'EC2Instance',
        riskLevel: 'LOW',
        issue: `GP3 볼륨 타입으로 업그레이드하여 비용을 절감할 수 있습니다 (기준: 100GB 이상 볼륨)`,
        recommendation: '100GB 이상의 볼륨을 GP3로 업그레이드하여 비용을 절감하세요',
        details: {
          instanceId: instance.InstanceId,
          instanceName: this.getInstanceName(instance),
          upgradeableVolumes: volumesForUpgrade.length,
          volumes: volumesForUpgrade.map(mapping => ({
            volumeId: mapping.Ebs.VolumeId,
            deviceName: mapping.DeviceName,
            size: mapping.Ebs.VolumeSize,
            estimatedMonthlySavings: this.calculateGP3Savings(mapping.Ebs.VolumeSize)
          })),
          gp3Benefits: [
            '기본 성능: 3,000 IOPS, 125 MB/s',
            'GP2 대비 20% 비용 절감',
            '독립적인 IOPS 및 처리량 설정',
            '더 예측 가능한 성능'
          ],
          upgradeProcess: [
            'AWS 콘솔에서 볼륨 선택',
            '볼륨 수정 → 볼륨 타입 변경',
            'GP3 선택 및 성능 설정',
            '변경 사항 적용 (온라인 진행)'
          ],
          totalEstimatedSavings: `월 약 $${volumesForUpgrade.reduce((sum, mapping) => 
            sum + this.calculateGP3Savings(mapping.Ebs.VolumeSize), 0).toFixed(2)} 절감 가능`
        },
        category: 'COST_OPTIMIZATION'
      });

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 볼륨 성능 최적화 권장
   */
  checkVolumePerformanceOptimization(instance) {
    const instanceType = instance.InstanceType;
    const isHighPerformanceInstance = this.isHighPerformanceInstanceType(instanceType);

    if (isHighPerformanceInstance && instance.BlockDeviceMappings) {
      const finding = new InspectionFinding({
        resourceId: instance.InstanceId,
        resourceType: 'EC2Instance',
        riskLevel: 'LOW',
        issue: `고성능 인스턴스(${instanceType})에서 EBS 볼륨 성능 최적화가 필요할 수 있습니다 (기준: c5.large 이상, m5.xlarge 이상, r5.xlarge 이상)`,
        recommendation: '인스턴스 타입에 맞는 EBS 볼륨 성능을 설정하세요',
        details: {
          instanceId: instance.InstanceId,
          instanceType: instanceType,
          instanceName: this.getInstanceName(instance),
          volumeCount: instance.BlockDeviceMappings.length,
          performanceRecommendations: {
            'c5.large이상': 'GP3 3,000+ IOPS 권장',
            'm5.xlarge이상': 'GP3 또는 IO2 고려',
            'r5.2xlarge이상': 'IO2 또는 IO2 Block Express 고려',
            'database워크로드': 'IO2 16,000+ IOPS 권장'
          },
          optimizationTips: [
            'EBS 최적화 인스턴스 사용',
            '적절한 IOPS 설정',
            '처리량 요구사항 고려',
            'Multi-Attach 볼륨 고려 (필요시)'
          ],
          monitoringMetrics: [
            'VolumeReadOps/VolumeWriteOps',
            'VolumeThroughputPercentage',
            'VolumeQueueLength',
            'BurstBalance (GP2의 경우)'
          ]
        },
        category: 'PERFORMANCE'
      });

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 볼륨 크기 최적화 권장
   */
  checkVolumeSizeOptimization(instance) {
    if (!instance.BlockDeviceMappings) return;

    const largeVolumes = instance.BlockDeviceMappings.filter(mapping => 
      mapping.Ebs && mapping.Ebs.VolumeSize >= 1000 // 1TB 이상
    );

    if (largeVolumes.length > 0) {
      const finding = new InspectionFinding({
        resourceId: instance.InstanceId,
        resourceType: 'EC2Instance',
        riskLevel: 'LOW',
        issue: `대용량 EBS 볼륨(${largeVolumes.length}개)에 대한 최적화가 필요할 수 있습니다 (기준: 1TB 이상 볼륨)`,
        recommendation: '대용량 볼륨의 사용률을 모니터링하고 필요시 크기를 조정하세요',
        details: {
          instanceId: instance.InstanceId,
          instanceName: this.getInstanceName(instance),
          largeVolumes: largeVolumes.length,
          volumes: largeVolumes.map(mapping => ({
            volumeId: mapping.Ebs.VolumeId,
            deviceName: mapping.DeviceName,
            size: `${mapping.Ebs.VolumeSize}GB`,
            estimatedMonthlyCost: `$${(mapping.Ebs.VolumeSize * 0.1).toFixed(2)}`
          })),
          optimizationStrategies: [
            '볼륨 사용률 모니터링',
            '데이터 압축 고려',
            '아카이브 데이터 S3 이동',
            '볼륨 크기 축소 (가능한 경우)'
          ],
          costConsiderations: [
            'GP3: $0.08/GB/월',
            'GP2: $0.10/GB/월',
            'IO2: $0.125/GB/월',
            '사용하지 않는 공간도 비용 발생'
          ],
          monitoringTools: [
            'CloudWatch 메트릭',
            'AWS Cost Explorer',
            'EC2 인스턴스 내 df 명령어',
            'AWS Systems Manager'
          ]
        },
        category: 'COST_OPTIMIZATION'
      });

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 구형 볼륨 여부 추정
   */
  isLikelyLegacyVolume(mapping, instance) {
    // 실제로는 DescribeVolumes API를 호출해야 하지만,
    // 여기서는 인스턴스 생성 시간과 볼륨 크기로 추정
    const launchTime = new Date(instance.LaunchTime);
    const twoYearsAgo = new Date(Date.now() - (2 * 365 * 24 * 60 * 60 * 1000));
    
    // 2년 이상 된 인스턴스는 구형 볼륨일 가능성이 높음
    return launchTime < twoYearsAgo;
  }

  /**
   * 고성능 인스턴스 타입 확인
   */
  isHighPerformanceInstanceType(instanceType) {
    const highPerformancePatterns = [
      /^c5\.(large|xlarge|2xlarge|4xlarge|9xlarge|12xlarge|18xlarge|24xlarge)$/,
      /^c5n\./,
      /^m5\.(xlarge|2xlarge|4xlarge|8xlarge|12xlarge|16xlarge|24xlarge)$/,
      /^r5\.(xlarge|2xlarge|4xlarge|8xlarge|12xlarge|16xlarge|24xlarge)$/,
      /^i3\./,
      /^x1\./,
      /^z1d\./
    ];

    return highPerformancePatterns.some(pattern => pattern.test(instanceType));
  }

  /**
   * GP3 절약 비용 계산
   */
  calculateGP3Savings(volumeSize) {
    // GP2: $0.10/GB/월, GP3: $0.08/GB/월
    const gp2Cost = volumeSize * 0.10;
    const gp3Cost = volumeSize * 0.08;
    return Math.max(0, gp2Cost - gp3Cost);
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
    const volumeFindings = findings.filter(f => 
      f.issue.includes('볼륨') || f.issue.includes('EBS') || f.issue.includes('GP')
    );

    if (volumeFindings.length > 0) {
      recommendations.push('EBS 볼륨 타입을 최신 버전으로 업그레이드하여 성능과 비용을 최적화하세요.');
      
      const upgradeFindings = volumeFindings.filter(f => 
        f.issue.includes('GP3') || f.issue.includes('업그레이드')
      );
      if (upgradeFindings.length > 0) {
        recommendations.push('GP2 볼륨을 GP3로 업그레이드하여 비용을 절감하세요.');
      }

      const performanceFindings = volumeFindings.filter(f => 
        f.issue.includes('성능') || f.issue.includes('고성능')
      );
      if (performanceFindings.length > 0) {
        recommendations.push('고성능 인스턴스에 맞는 EBS 볼륨 성능을 설정하세요.');
      }
    }

    return recommendations;
  }
}

module.exports = EBSVolumeVersionChecker;