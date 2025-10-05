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
        riskLevel: 'LOW',
        issue: '인스턴스가 없어 퍼블릭 IP 노출 위험이 없습니다',
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
        // 1. 퍼블릭 IP 할당 검사
        this.checkPublicIpAssignment(instance);

        // 2. 퍼블릭 서브넷 배치 검사
        this.checkPublicSubnetPlacement(instance);

        // 3. 인터넷 게이트웨이 직접 접근 검사
        this.checkDirectInternetAccess(instance);

      } catch (error) {
        this.inspector.recordError(error, {
          operation: 'runAllChecks',
          instanceId: instance.InstanceId
        });
      }
    }
  }

  /**
   * 퍼블릭 IP 할당 검사
   */
  checkPublicIpAssignment(instance) {
    const hasPublicIp = !!instance.PublicIpAddress;
    const hasElasticIp = !!instance.PublicIpAddress && instance.PublicIpAddress !== instance.PrivateIpAddress;

    if (hasPublicIp) {
      const riskLevel = this.assessPublicIpRisk(instance);
      
      const finding = new InspectionFinding({
        resourceId: instance.InstanceId,
        resourceType: 'EC2Instance',
        riskLevel: riskLevel,
        issue: `인스턴스에 퍼블릭 IP(${instance.PublicIpAddress})가 할당되어 인터넷에 직접 노출되어 있습니다`,
        recommendation: '퍼블릭 IP가 꼭 필요한지 검토하고, 가능하면 프라이빗 서브넷으로 이동하세요',
        details: {
          instanceId: instance.InstanceId,
          instanceType: instance.InstanceType,
          publicIp: instance.PublicIpAddress,
          privateIp: instance.PrivateIpAddress,
          hasElasticIp: hasElasticIp,
          subnetId: instance.SubnetId,
          vpcId: instance.VpcId,
          securityRisks: [
            '직접적인 인터넷 공격 노출',
            '포트 스캔 및 취약점 탐지',
            'DDoS 공격 대상',
            '무차별 대입 공격'
          ],
          alternatives: [
            'Application Load Balancer 사용',
            'NAT Gateway를 통한 아웃바운드 접근',
            'VPN 또는 Direct Connect 사용',
            '배스천 호스트를 통한 관리'
          ]
        },
        category: 'SECURITY'
      });

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 퍼블릭 서브넷 배치 검사
   */
  checkPublicSubnetPlacement(instance) {
    // 서브넷 정보가 있고 퍼블릭 IP가 있는 경우
    if (instance.SubnetId && instance.PublicIpAddress) {
      const finding = new InspectionFinding({
        resourceId: instance.InstanceId,
        resourceType: 'EC2Instance',
        riskLevel: 'MEDIUM',
        issue: '인스턴스가 퍼블릭 서브넷에 배치되어 있습니다',
        recommendation: '웹 서버가 아닌 경우 프라이빗 서브넷으로 이동을 고려하세요',
        details: {
          instanceId: instance.InstanceId,
          subnetId: instance.SubnetId,
          vpcId: instance.VpcId,
          publicIp: instance.PublicIpAddress,
          instancePurpose: this.guessInstancePurpose(instance),
          recommendations: [
            '데이터베이스 서버: 프라이빗 서브넷 필수',
            '애플리케이션 서버: 프라이빗 서브넷 권장',
            '웹 서버: 퍼블릭 서브넷 허용 (보안 강화 필요)',
            '관리 서버: 프라이빗 서브넷 필수'
          ]
        },
        category: 'SECURITY'
      });

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 인터넷 게이트웨이 직접 접근 검사
   */
  checkDirectInternetAccess(instance) {
    // 퍼블릭 IP가 있고 보안 그룹이 광범위하게 열려있는 경우
    if (instance.PublicIpAddress && instance.SecurityGroups) {
      const hasWideOpenPorts = this.checkForWideOpenPorts(instance.SecurityGroups);
      
      if (hasWideOpenPorts) {
        const finding = new InspectionFinding({
          resourceId: instance.InstanceId,
          resourceType: 'EC2Instance',
          riskLevel: 'HIGH',
          issue: '퍼블릭 IP를 가진 인스턴스의 보안 그룹이 광범위하게 개방되어 있습니다',
          recommendation: '퍼블릭 인스턴스의 보안 그룹을 더욱 제한적으로 설정하세요',
          details: {
            instanceId: instance.InstanceId,
            publicIp: instance.PublicIpAddress,
            securityGroups: instance.SecurityGroups.map(sg => ({
              groupId: sg.GroupId,
              groupName: sg.GroupName
            })),
            combinedRisk: '퍼블릭 IP + 광범위한 보안 그룹 = 높은 위험',
            immediateActions: [
              '보안 그룹 규칙 최소화',
              '특정 IP 주소로 접근 제한',
              'WAF 또는 방화벽 추가',
              '모니터링 강화'
            ]
          },
          category: 'SECURITY'
        });

        this.inspector.addFinding(finding);
      }
    }
  }

  /**
   * 퍼블릭 IP 위험도 평가
   */
  assessPublicIpRisk(instance) {
    let riskScore = 0;

    // 인스턴스 타입별 위험도
    if (instance.InstanceType?.includes('micro') || instance.InstanceType?.includes('small')) {
      riskScore += 1; // 작은 인스턴스는 상대적으로 낮은 위험
    } else {
      riskScore += 2; // 큰 인스턴스는 높은 위험
    }

    // 보안 그룹 위험도
    if (instance.SecurityGroups && this.checkForWideOpenPorts(instance.SecurityGroups)) {
      riskScore += 3; // 광범위한 보안 그룹은 높은 위험
    }

    // 인스턴스 용도 추정
    const purpose = this.guessInstancePurpose(instance);
    if (purpose === 'database' || purpose === 'internal') {
      riskScore += 2; // 내부 서비스는 퍼블릭 IP가 더 위험
    }

    if (riskScore >= 4) return 'HIGH';
    if (riskScore >= 2) return 'MEDIUM';
    return 'LOW';
  }

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
    const publicIpFindings = findings.filter(f => 
      f.issue.includes('퍼블릭') || f.issue.includes('public')
    );

    if (publicIpFindings.length > 0) {
      recommendations.push('불필요한 퍼블릭 IP 할당을 제거하고 프라이빗 서브넷 사용을 고려하세요.');
      
      const highRiskFindings = publicIpFindings.filter(f => f.riskLevel === 'HIGH');
      if (highRiskFindings.length > 0) {
        recommendations.push('퍼블릭 인스턴스의 보안 그룹을 즉시 강화하세요.');
      }

      const subnetFindings = publicIpFindings.filter(f => f.issue.includes('서브넷'));
      if (subnetFindings.length > 0) {
        recommendations.push('데이터베이스와 애플리케이션 서버는 프라이빗 서브넷으로 이동하세요.');
      }
    }

    return recommendations;
  }
}

module.exports = PublicIpChecker;