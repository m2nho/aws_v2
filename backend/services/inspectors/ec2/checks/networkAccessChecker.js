/**
 * Network Access Checker
 * 네트워크 접근성 관련 검사를 담당하는 모듈
 */

const InspectionFinding = require('../../../../models/InspectionFinding');

class NetworkAccessChecker {
  constructor(inspector) {
    this.inspector = inspector;
  }

  /**
   * 모든 네트워크 접근성 검사 실행
   */
  async runAllChecks(instances, securityGroups) {
    await this.checkPublicAccess(instances, securityGroups);
    await this.checkNetworkAccessibility(instances, securityGroups);
    await this.checkInstanceSecurityRelationships(instances, securityGroups);
  }

  /**
   * 퍼블릭 접근 분석
   */
  async checkPublicAccess(instances, securityGroups) {
    // 퍼블릭 IP를 가진 인스턴스 확인
    instances.forEach(instance => {
      if (instance.State?.Name === 'terminated') return;

      if (instance.PublicIpAddress) {
        this.checkPublicInstanceSecurity(instance, securityGroups);
      }
    });

    // 퍼블릭 접근이 가능한 보안 그룹 확인
    securityGroups.forEach(sg => {
      this.checkPublicSecurityGroupRules(sg);
    });
  }

  /**
   * 퍼블릭 인스턴스 보안 검사
   */
  checkPublicInstanceSecurity(instance, securityGroups) {
    const sgMap = new Map();
    securityGroups.forEach(sg => sgMap.set(sg.GroupId, sg));

    instance.SecurityGroups?.forEach(instanceSg => {
      const sg = sgMap.get(instanceSg.GroupId);
      if (sg && sg.IpPermissions) {
        // 위험한 포트 조합 검사
        this.checkDangerousPortCombinations(instance, sg);
        
        // 관리 포트 노출 검사
        this.checkManagementPortExposure(instance, sg);
      }
    });
  }

  /**
   * 퍼블릭 보안 그룹 규칙 검사
   */
  checkPublicSecurityGroupRules(securityGroup) {
    if (!securityGroup.IpPermissions) return;

    securityGroup.IpPermissions.forEach(rule => {
      rule.IpRanges?.forEach(ipRange => {
        if (ipRange.CidrIp === '0.0.0.0/0') {
          const portInfo = this.getPortInfo(rule);
          
          const finding = InspectionFinding.createSecurityGroupFinding(
            securityGroup,
            `보안 그룹이 모든 IP(0.0.0.0/0)에서 ${portInfo.description} 접근을 허용합니다`,
            '필요한 IP 범위로만 접근을 제한하세요'
          );
          finding.riskLevel = portInfo.riskLevel;
          finding.details.affectedRule = rule;
          finding.details.portRange = portInfo.range;

          this.inspector.addFinding(finding);
        }
      });

      // IPv6 전체 접근 검사
      rule.Ipv6Ranges?.forEach(ipv6Range => {
        if (ipv6Range.CidrIpv6 === '::/0') {
          const portInfo = this.getPortInfo(rule);
          
          const finding = InspectionFinding.createSecurityGroupFinding(
            securityGroup,
            `보안 그룹이 모든 IPv6(::/0)에서 ${portInfo.description} 접근을 허용합니다`,
            '필요한 IPv6 범위로만 접근을 제한하세요'
          );
          finding.riskLevel = portInfo.riskLevel;
          finding.details.affectedRule = rule;

          this.inspector.addFinding(finding);
        }
      });
    });
  }

  /**
   * 위험한 포트 조합 검사
   */
  checkDangerousPortCombinations(instance, securityGroup) {
    const dangerousPorts = [
      { port: 21, service: 'FTP', risk: 'HIGH' },
      { port: 23, service: 'Telnet', risk: 'CRITICAL' },
      { port: 135, service: 'RPC', risk: 'HIGH' },
      { port: 139, service: 'NetBIOS', risk: 'HIGH' },
      { port: 445, service: 'SMB', risk: 'HIGH' },
      { port: 1433, service: 'SQL Server', risk: 'HIGH' },
      { port: 3306, service: 'MySQL', risk: 'HIGH' },
      { port: 5432, service: 'PostgreSQL', risk: 'HIGH' },
      { port: 6379, service: 'Redis', risk: 'HIGH' },
      { port: 27017, service: 'MongoDB', risk: 'HIGH' },
      { port: 5984, service: 'CouchDB', risk: 'HIGH' },
      { port: 9200, service: 'Elasticsearch', risk: 'HIGH' }
    ];

    securityGroup.IpPermissions?.forEach(rule => {
      const hasOpenAccess = rule.IpRanges?.some(range => range.CidrIp === '0.0.0.0/0');

      if (hasOpenAccess) {
        dangerousPorts.forEach(({ port, service, risk }) => {
          if (rule.FromPort <= port && rule.ToPort >= port) {
            const finding = InspectionFinding.createEC2Finding(
              instance,
              `퍼블릭 IP를 가진 인스턴스가 모든 곳에서 ${service} 접근(포트 ${port})을 허용합니다`,
              `${service} 접근을 특정 IP 범위로 제한하거나 프라이빗 네트워킹을 사용하세요`,
              risk
            );
            finding.details.dangerousPort = port;
            finding.details.service = service;
            finding.details.securityGroupId = securityGroup.GroupId;

            this.inspector.addFinding(finding);
          }
        });
      }
    });
  }

  /**
   * 관리 포트 노출 검사
   */
  checkManagementPortExposure(instance, securityGroup) {
    const managementPorts = [
      { port: 22, service: 'SSH' },
      { port: 3389, service: 'RDP' },
      { port: 5985, service: 'WinRM HTTP' },
      { port: 5986, service: 'WinRM HTTPS' }
    ];

    securityGroup.IpPermissions?.forEach(rule => {
      const hasOpenAccess = rule.IpRanges?.some(range => range.CidrIp === '0.0.0.0/0');

      if (hasOpenAccess) {
        managementPorts.forEach(({ port, service }) => {
          if (rule.FromPort <= port && rule.ToPort >= port) {
            const finding = InspectionFinding.createEC2Finding(
              instance,
              `퍼블릭 인스턴스에서 ${service}(포트 ${port})가 인터넷에 개방되어 있습니다`,
              `${service} 접근을 특정 관리 IP로 제한하거나 VPN/배스천 호스트를 사용하세요`,
              'CRITICAL'
            );
            finding.details.managementPort = port;
            finding.details.service = service;
            finding.details.securityGroupId = securityGroup.GroupId;

            this.inspector.addFinding(finding);
          }
        });
      }
    });
  }

  /**
   * 네트워크 접근성 분석
   */
  async checkNetworkAccessibility(instances, securityGroups) {
    // 보안 그룹 ID로 매핑 생성
    const sgMap = new Map();
    securityGroups.forEach(sg => sgMap.set(sg.GroupId, sg));

    instances.forEach(instance => {
      if (instance.State?.Name === 'terminated') return;

      // 인스턴스별 네트워크 구성 검사
      this.checkInstanceNetworkConfiguration(instance, sgMap);
      
      // 서브넷 구성 검사
      this.checkSubnetConfiguration(instance);
    });
  }

  /**
   * 인스턴스 네트워크 구성 검사
   */
  checkInstanceNetworkConfiguration(instance, sgMap) {
    // 여러 서브넷에 걸친 네트워크 인터페이스 검사
    const subnets = new Set();
    instance.NetworkInterfaces?.forEach(eni => {
      if (eni.SubnetId) {
        subnets.add(eni.SubnetId);
      }
    });

    if (subnets.size > 1) {
      const finding = InspectionFinding.createEC2Finding(
        instance,
        `인스턴스가 ${subnets.size}개의 서로 다른 서브넷에 연결되어 있습니다`,
        '복잡한 네트워크 구성이 필요한지 검토하고 단순화를 고려하세요',
        'LOW'
      );
      finding.category = 'RELIABILITY';
      finding.details.subnetCount = subnets.size;

      this.inspector.addFinding(finding);
    }

    // 보안 그룹 간 순환 참조 검사
    this.checkSecurityGroupCircularReferences(instance, sgMap);
  }

  /**
   * 서브넷 구성 검사
   */
  checkSubnetConfiguration(instance) {
    // 퍼블릭 서브넷에서 프라이빗 리소스 실행 검사
    if (instance.PublicIpAddress && instance.PrivateIpAddress) {
      // 데이터베이스나 캐시 서비스로 보이는 포트가 열려있는지 검사
      const dbPorts = [3306, 5432, 1433, 6379, 27017, 5984];
      
      instance.SecurityGroups?.forEach(sg => {
        // 이 검사는 보안 그룹 정보가 필요하므로 별도 메서드에서 처리
      });
    }
  }

  /**
   * 보안 그룹 순환 참조 검사
   */
  checkSecurityGroupCircularReferences(instance, sgMap) {
    const instanceSgIds = instance.SecurityGroups?.map(sg => sg.GroupId) || [];
    
    instanceSgIds.forEach(sgId => {
      const sg = sgMap.get(sgId);
      if (!sg) return;

      // 자기 자신을 참조하는 규칙 검사
      sg.IpPermissions?.forEach(rule => {
        rule.UserIdGroupPairs?.forEach(pair => {
          if (pair.GroupId === sgId) {
            const finding = InspectionFinding.createEC2Finding(
              instance,
              `보안 그룹 ${sgId}이 자기 자신을 참조하는 규칙을 가지고 있습니다`,
              '순환 참조를 피하고 명확한 보안 그룹 구조를 설계하세요',
              'LOW'
            );
            finding.category = 'RELIABILITY';
            finding.details.circularReference = {
              securityGroupId: sgId,
              rule: rule
            };

            this.inspector.addFinding(finding);
          }
        });
      });
    });
  }

  /**
   * 인스턴스-보안그룹 관계 분석
   */
  async checkInstanceSecurityRelationships(instances, securityGroups) {
    // 사용되지 않는 보안 그룹 찾기
    const usedSecurityGroupIds = new Set();
    const securityGroupUsage = new Map();

    instances.forEach(instance => {
      if (instance.State?.Name === 'terminated') return;

      if (instance.SecurityGroups) {
        instance.SecurityGroups.forEach(sg => {
          usedSecurityGroupIds.add(sg.GroupId);
          
          if (!securityGroupUsage.has(sg.GroupId)) {
            securityGroupUsage.set(sg.GroupId, []);
          }
          securityGroupUsage.get(sg.GroupId).push(instance.InstanceId);
        });
      }
    });

    // 미사용 보안 그룹 검사
    securityGroups.forEach(sg => {
      if (!usedSecurityGroupIds.has(sg.GroupId) && sg.GroupName !== 'default') {
        const finding = InspectionFinding.createSecurityGroupFinding(
          sg,
          '보안 그룹이 어떤 인스턴스에도 연결되어 있지 않습니다',
          '공격 표면을 줄이고 관리를 개선하기 위해 사용하지 않는 보안 그룹을 제거하세요'
        );
        finding.riskLevel = 'LOW';
        finding.category = 'COST';

        this.inspector.addFinding(finding);
      }
    });

    // 과도하게 많은 인스턴스에서 사용되는 보안 그룹 검사
    securityGroupUsage.forEach((instanceIds, sgId) => {
      if (instanceIds.length > 20) {
        const sg = securityGroups.find(s => s.GroupId === sgId);
        if (sg) {
          const finding = InspectionFinding.createSecurityGroupFinding(
            sg,
            `보안 그룹이 ${instanceIds.length}개의 인스턴스에서 사용되고 있습니다`,
            '보안 그룹을 더 세분화하여 최소 권한 원칙을 적용하세요',
            'LOW'
          );
          finding.category = 'RELIABILITY';
          finding.details.instanceCount = instanceIds.length;

          this.inspector.addFinding(finding);
        }
      }
    });
  }

  /**
   * 포트 정보 반환
   */
  getPortInfo(rule) {
    const fromPort = rule.FromPort || 0;
    const toPort = rule.ToPort || 65535;
    
    let description, riskLevel;
    
    if (fromPort === toPort) {
      description = `포트 ${fromPort}`;
    } else if (fromPort === 0 && toPort === 65535) {
      description = '모든 포트';
      riskLevel = 'HIGH';
    } else {
      description = `포트 ${fromPort}-${toPort}`;
    }

    // 특정 포트에 대한 위험도 설정
    if (!riskLevel) {
      if ([22, 3389].includes(fromPort)) {
        riskLevel = 'CRITICAL';
      } else if ([21, 23, 135, 139, 445, 1433, 3306, 5432].includes(fromPort)) {
        riskLevel = 'HIGH';
      } else if (toPort - fromPort > 100) {
        riskLevel = 'MEDIUM';
      } else {
        riskLevel = 'LOW';
      }
    }

    return {
      range: fromPort === toPort ? fromPort.toString() : `${fromPort}-${toPort}`,
      description,
      riskLevel
    };
  }

  /**
   * 권장사항 생성
   */
  getRecommendations(findings) {
    const recommendations = [];
    const networkFindings = findings.filter(f => 
      f.issue.includes('네트워크') || f.issue.includes('network') ||
      f.issue.includes('퍼블릭') || f.issue.includes('public')
    );

    if (networkFindings.length > 0) {
      recommendations.push('네트워크 보안 그룹 규칙을 정기적으로 검토하고 최소 권한 원칙을 적용하세요.');
      
      const publicAccessFindings = networkFindings.filter(f => 
        f.issue.includes('0.0.0.0/0') || f.issue.includes('모든 IP')
      );
      if (publicAccessFindings.length > 0) {
        recommendations.push('인터넷에서의 직접 접근을 제한하고 VPN이나 배스천 호스트를 사용하세요.');
      }

      const managementFindings = networkFindings.filter(f => 
        f.issue.includes('SSH') || f.issue.includes('RDP')
      );
      if (managementFindings.length > 0) {
        recommendations.push('관리 포트(SSH, RDP)는 특정 관리 네트워크에서만 접근 가능하도록 제한하세요.');
      }
    }

    return recommendations;
  }
}

module.exports = NetworkAccessChecker;