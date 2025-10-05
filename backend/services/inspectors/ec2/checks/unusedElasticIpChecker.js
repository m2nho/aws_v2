/**
 * Unused Elastic IP Checker
 * 미사용 Elastic IP를 검사하는 모듈
 */

const InspectionFinding = require('../../../../models/InspectionFinding');

class UnusedElasticIpChecker {
  constructor(inspector) {
    this.inspector = inspector;
  }

  /**
   * 미사용 Elastic IP 검사 실행
   */
  async runAllChecks(instances) {
    try {
      // 1. 연결되지 않은 Elastic IP 추정 검사
      this.checkPotentialUnusedElasticIps(instances);

      // 2. 중지된 인스턴스의 Elastic IP 검사
      this.checkElasticIpsOnStoppedInstances(instances);

    } catch (error) {
      this.inspector.recordError(error, {
        operation: 'runAllChecks'
      });
    }
  }

  /**
   * 연결되지 않은 Elastic IP 추정 검사
   */
  checkPotentialUnusedElasticIps(instances) {
    // 실제로는 EC2 DescribeAddresses API를 호출해야 하지만,
    // 여기서는 인스턴스 정보로 추정
    
    const instancesWithStaticIp = instances.filter(instance => {
      // 퍼블릭 IP가 있고 프라이빗 IP와 다른 경우 (Elastic IP 추정)
      return instance.PublicIpAddress && 
             instance.PublicIpAddress !== instance.PrivateIpAddress &&
             instance.State?.Name === 'running';
    });

    const stoppedInstancesWithPotentialEip = instances.filter(instance => {
      return instance.State?.Name === 'stopped' && 
             instance.PublicIpAddress; // 중지된 상태에서도 퍼블릭 IP가 있으면 EIP일 가능성
    });

    if (stoppedInstancesWithPotentialEip.length > 0) {
      const finding = new InspectionFinding({
        resourceId: 'potential-unused-eips',
        resourceType: 'ElasticIP',
        riskLevel: 'MEDIUM',
        issue: `중지된 인스턴스에 연결된 Elastic IP ${stoppedInstancesWithPotentialEip.length}개가 발견되었습니다 (기준: 인스턴스 상태가 'stopped'이면서 퍼블릭 IP 보유)`,
        recommendation: '중지된 인스턴스의 Elastic IP를 해제하여 비용을 절감하세요',
        details: {
          detectionCriteria: {
            method: '인스턴스 상태 및 퍼블릭 IP 확인',
            condition: '인스턴스가 stopped 상태이면서 퍼블릭 IP 주소 보유',
            limitation: '실제 EIP 여부는 AWS 콘솔에서 재확인 필요'
          },
          stoppedInstancesWithEip: stoppedInstancesWithPotentialEip.length,
          instances: stoppedInstancesWithPotentialEip.map(instance => ({
            instanceId: instance.InstanceId,
            publicIp: instance.PublicIpAddress,
            instanceState: instance.State?.Name,
            name: this.getInstanceName(instance),
            stoppedSince: this.extractStopDate(instance.StateTransitionReason)
          })),
          costImpact: [
            '시간당 Elastic IP 요금 발생',
            '월 약 $3.65 per EIP (미사용 시)',
            '연간 약 $43.8 per EIP'
          ],
          actionSteps: [
            'AWS 콘솔에서 Elastic IP 주소 확인',
            '연결되지 않은 EIP 식별',
            '필요 없는 EIP 릴리스',
            '인스턴스 재시작 시 EIP 재연결 고려'
          ],
          warning: '인스턴스 재시작 시 EIP가 자동으로 재연결되지 않을 수 있습니다'
        },
        category: 'COST_OPTIMIZATION'
      });

      this.inspector.addFinding(finding);
    }

    // 일반적인 EIP 사용 권장사항
    if (instancesWithStaticIp.length > 3) {
      const finding = new InspectionFinding({
        resourceId: 'many-elastic-ips',
        resourceType: 'ElasticIP',
        riskLevel: 'LOW',
        issue: `다수의 Elastic IP(${instancesWithStaticIp.length}개)가 사용 중입니다 (기준: 5개 이상의 고정 IP 사용)`,
        recommendation: 'Load Balancer나 NAT Gateway 사용을 고려하여 EIP 사용을 최적화하세요',
        details: {
          elasticIpCount: instancesWithStaticIp.length,
          instances: instancesWithStaticIp.map(instance => ({
            instanceId: instance.InstanceId,
            publicIp: instance.PublicIpAddress,
            name: this.getInstanceName(instance)
          })),
          alternatives: [
            'Application Load Balancer 사용',
            'Network Load Balancer 사용',
            'NAT Gateway로 아웃바운드 트래픽 처리',
            'CloudFront를 통한 정적 IP 제공'
          ],
          benefits: [
            '고가용성 향상',
            '비용 최적화',
            '관리 복잡성 감소',
            '자동 장애 조치'
          ]
        },
        category: 'COST_OPTIMIZATION'
      });

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 중지된 인스턴스의 Elastic IP 검사
   */
  checkElasticIpsOnStoppedInstances(instances) {
    const longStoppedInstances = instances.filter(instance => {
      if (instance.State?.Name !== 'stopped' || !instance.PublicIpAddress) {
        return false;
      }

      // 7일 이상 중지된 인스턴스 확인
      const stateReason = instance.StateTransitionReason || '';
      const match = stateReason.match(/\((\d{4}-\d{2}-\d{2})/);
      
      if (match) {
        const stopDate = new Date(match[1]);
        const sevenDaysAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));
        return stopDate < sevenDaysAgo;
      }
      
      return false;
    });

    if (longStoppedInstances.length > 0) {
      const finding = new InspectionFinding({
        resourceId: 'long-stopped-with-eip',
        resourceType: 'ElasticIP',
        riskLevel: 'HIGH',
        issue: `7일 이상 중지된 인스턴스에 연결된 Elastic IP ${longStoppedInstances.length}개가 발견되었습니다 (기준: 7일 이상 stopped 상태 + 퍼블릭 IP 보유)`,
        recommendation: '장기간 중지된 인스턴스의 Elastic IP를 즉시 해제하여 비용을 절감하세요',
        details: {
          longStoppedWithEip: longStoppedInstances.length,
          instances: longStoppedInstances.map(instance => ({
            instanceId: instance.InstanceId,
            publicIp: instance.PublicIpAddress,
            name: this.getInstanceName(instance),
            stoppedSince: this.extractStopDate(instance.StateTransitionReason),
            estimatedWasteCost: '$3.65/month per EIP'
          })),
          immediateActions: [
            'Elastic IP 주소 릴리스',
            '인스턴스 종료 고려',
            '데이터 백업 확인',
            '비용 절감 효과 계산'
          ],
          costSavings: `월 약 $${(longStoppedInstances.length * 3.65).toFixed(2)} 절감 가능`
        },
        category: 'COST_OPTIMIZATION'
      });

      this.inspector.addFinding(finding);
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
   * 중지 날짜 추출
   */
  extractStopDate(stateTransitionReason) {
    if (!stateTransitionReason) return 'Unknown';
    
    const match = stateTransitionReason.match(/\((\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : 'Unknown';
  }

  /**
   * 권장사항 생성
   */
  getRecommendations(findings) {
    const recommendations = [];
    const eipFindings = findings.filter(f => 
      f.resourceType === 'ElasticIP'
    );

    if (eipFindings.length > 0) {
      recommendations.push('미사용 Elastic IP를 정기적으로 확인하고 해제하여 비용을 절감하세요.');
      
      const unusedFindings = eipFindings.filter(f => 
        f.issue.includes('중지된') || f.issue.includes('미사용')
      );
      if (unusedFindings.length > 0) {
        recommendations.push('중지된 인스턴스의 Elastic IP를 즉시 해제하세요.');
      }

      const manyEipFindings = eipFindings.filter(f => 
        f.issue.includes('다수의')
      );
      if (manyEipFindings.length > 0) {
        recommendations.push('Load Balancer 사용을 고려하여 Elastic IP 사용을 최적화하세요.');
      }
    }

    return recommendations;
  }
}

module.exports = UnusedElasticIpChecker;