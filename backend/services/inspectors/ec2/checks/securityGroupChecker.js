/**
 * Security Group Checker
 * 보안 그룹 기본 설정 검사를 담당하는 모듈 (위험한 포트는 별도 모듈에서 처리)
 */

const InspectionFinding = require('../../../../models/InspectionFinding');

class SecurityGroupChecker {
  constructor(inspector) {
    this.inspector = inspector;
  }

  /**
   * 모든 보안 그룹 검사 실행
   */
  async runAllChecks(securityGroups) {
    // 검사 대상이 없는 경우 정보성 finding 추가
    if (!securityGroups || securityGroups.length === 0) {
      const finding = new InspectionFinding({
        resourceId: 'no-security-groups',
        resourceType: 'SecurityGroup',
        riskLevel: 'LOW',
        issue: '보안 그룹이 없습니다',
        recommendation: '보안 그룹을 생성할 때는 최소 권한 원칙을 적용하세요',
        details: {
          totalSecurityGroups: 0,
          status: '현재 보안 그룹이 없어 관련 보안 위험이 없습니다',
          nextSteps: [
            '보안 그룹 생성 시 필요한 포트만 개방',
            '0.0.0.0/0 접근 지양',
            '정기적인 보안 그룹 검토'
          ]
        },
        category: 'COMPLIANCE'
      });
      
      this.inspector.addFinding(finding);
      return;
    }

    await this.checkBasicSecurityRules(securityGroups);
    await this.checkManagementStatus(securityGroups);
  }

  /**
   * 기본 보안 규칙 검사 (위험한 포트는 별도 모듈에서 처리)
   */
  async checkBasicSecurityRules(securityGroups) {
    for (const sg of securityGroups) {
      try {
        // 1. 기본 보안 그룹 사용 검사
        this.checkDefaultSecurityGroup(sg);

        // 2. 보안 그룹 설명 검사
        this.checkSecurityGroupDescription(sg);

        // 3. 아웃바운드 규칙 검사
        this.checkOutboundRules(sg);

      } catch (error) {
        this.inspector.recordError(error, {
          operation: 'checkBasicSecurityRules',
          securityGroupId: sg.GroupId
        });
      }
    }
  }

  /**
   * 관리 상태 검사 (관리 중심)
   */
  async checkManagementStatus(securityGroups) {
    for (const sg of securityGroups) {
      try {
        // 1. 보안 그룹 설명 검사
        this.checkSecurityGroupDescription(sg);

        // 2. 태그 검사
        this.checkSecurityGroupTags(sg);

        // 3. 규칙 복잡성 검사
        this.checkRuleComplexity(sg);

      } catch (error) {
        this.inspector.recordError(error, {
          operation: 'checkManagementStatus',
          securityGroupId: sg.GroupId
        });
      }
    }
  }

  /**
   * 과도하게 열린 포트 검사
   */
  checkOverlyPermissiveRules(securityGroup) {
    if (!securityGroup.IpPermissions) return;

    securityGroup.IpPermissions.forEach(rule => {
      // SSH 포트 22번은 별도 모듈에서 처리하므로 제외
      const isSSHPort = (rule.FromPort <= 22 && rule.ToPort >= 22);
      if (isSSHPort) return;

      // 0.0.0.0/0으로 열린 규칙 검사
      const hasOpenAccess = rule.IpRanges?.some(range => range.CidrIp === '0.0.0.0/0') ||
        rule.Ipv6Ranges?.some(range => range.CidrIpv6 === '::/0');

      if (hasOpenAccess) {
        const portRange = rule.FromPort === rule.ToPort ?
          rule.FromPort : `${rule.FromPort}-${rule.ToPort}`;

        const finding = InspectionFinding.createSecurityGroupFinding(
          securityGroup,
          `보안 그룹이 포트 ${portRange}에서 모든 IP(0.0.0.0/0)의 무제한 접근을 허용합니다`,
          `모든 트래픽을 허용하는 대신 특정 IP 범위나 보안 그룹으로 접근을 제한하세요`
        );
        finding.riskLevel = 'HIGH';
        finding.details.affectedRule = rule;
        finding.details.portRange = portRange;

        this.inspector.addFinding(finding);
      }

      // 너무 넓은 포트 범위 검사
      if (rule.FromPort && rule.ToPort && (rule.ToPort - rule.FromPort) > 100) {
        const finding = InspectionFinding.createSecurityGroupFinding(
          securityGroup,
          `보안 그룹이 너무 넓은 포트 범위(${rule.FromPort}-${rule.ToPort})를 허용합니다`,
          `필요한 포트만 개방하여 공격 표면을 줄이세요`
        );
        finding.riskLevel = 'MEDIUM';
        finding.details.affectedRule = rule;

        this.inspector.addFinding(finding);
      }
    });
  }

  /**
   * RDP 접근 검사 (SSH는 별도 모듈에서 처리)
   */
  checkRDPAccess(securityGroup) {
    if (!securityGroup.IpPermissions) return;

    securityGroup.IpPermissions.forEach(rule => {
      const ruleCoversPort = (port) => {
        return rule.FromPort <= port && rule.ToPort >= port;
      };

      // RDP 포트 3389만 검사
      if (ruleCoversPort(3389)) {
        const hasOpenAccess = rule.IpRanges?.some(range => range.CidrIp === '0.0.0.0/0');

        if (hasOpenAccess) {
          const finding = InspectionFinding.createSecurityGroupFinding(
            securityGroup,
            'RDP 접근(포트 3389)이 인터넷(0.0.0.0/0)에 개방되어 있습니다',
            'RDP 접근을 특정 IP 주소로 제한하거나 VPN을 사용하세요'
          );
          finding.riskLevel = 'CRITICAL';
          finding.details.affectedPort = 3389;
          finding.details.service = 'RDP';

          this.inspector.addFinding(finding);
        }
      }
    });
  }

  /**
   * 위험한 포트 검사
   */
  checkDangerousPorts(securityGroup) {
    if (!securityGroup.IpPermissions) return;

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
      { port: 27017, service: 'MongoDB', risk: 'HIGH' }
    ];

    securityGroup.IpPermissions.forEach(rule => {
      const hasOpenAccess = rule.IpRanges?.some(range => range.CidrIp === '0.0.0.0/0');

      if (hasOpenAccess) {
        dangerousPorts.forEach(({ port, service, risk }) => {
          if (rule.FromPort <= port && rule.ToPort >= port) {
            const finding = InspectionFinding.createSecurityGroupFinding(
              securityGroup,
              `${service} 서비스(포트 ${port})가 인터넷에 개방되어 있습니다`,
              `${service} 접근을 특정 IP 범위로 제한하거나 프라이빗 네트워킹을 사용하세요`
            );
            finding.riskLevel = risk;
            finding.details.dangerousPort = port;
            finding.details.service = service;

            this.inspector.addFinding(finding);
          }
        });
      }
    });
  }

  /**
   * 기본 보안 그룹 사용 검사
   */
  checkDefaultSecurityGroup(securityGroup) {
    if (securityGroup.GroupName === 'default') {
      // 기본 보안 그룹에 커스텀 규칙이 있는지 검사
      const hasCustomInboundRules = securityGroup.IpPermissions?.length > 0;
      const hasCustomOutboundRules = securityGroup.IpPermissionsEgress?.some(rule =>
        !(rule.IpProtocol === '-1' &&
          rule.IpRanges?.some(range => range.CidrIp === '0.0.0.0/0'))
      );

      if (hasCustomInboundRules || hasCustomOutboundRules) {
        const finding = InspectionFinding.createSecurityGroupFinding(
          securityGroup,
          '기본 보안 그룹에 사용자 정의 규칙이 설정되어 있습니다',
          '기본 보안 그룹을 수정하는 대신 전용 보안 그룹을 생성하세요'
        );
        finding.riskLevel = 'MEDIUM';

        this.inspector.addFinding(finding);
      }
    }
  }

  /**
   * 보안 그룹 설명 검사
   */
  checkSecurityGroupDescription(securityGroup) {
    if (!securityGroup.Description ||
      securityGroup.Description.trim() === '' ||
      securityGroup.Description === 'default VPC security group' ||
      securityGroup.Description.length < 10) {

      const finding = InspectionFinding.createSecurityGroupFinding(
        securityGroup,
        '보안 그룹에 의미 있는 설명이 없습니다',
        '이 보안 그룹의 목적과 범위를 식별하는 데 도움이 되는 설명 정보를 추가하세요'
      );
      finding.riskLevel = 'LOW';
      finding.category = 'COMPLIANCE';

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 보안 그룹 태그 검사
   */
  checkSecurityGroupTags(securityGroup) {
    const requiredTags = ['Environment', 'Owner', 'Purpose'];
    const existingTags = securityGroup.Tags?.map(tag => tag.Key) || [];
    
    const missingTags = requiredTags.filter(tag => !existingTags.includes(tag));

    if (missingTags.length > 0) {
      const finding = InspectionFinding.createSecurityGroupFinding(
        securityGroup,
        `보안 그룹에 필수 태그가 누락되었습니다: ${missingTags.join(', ')}`,
        '리소스 관리와 비용 추적을 위해 필수 태그를 추가하세요'
      );
      finding.riskLevel = 'LOW';
      finding.category = 'COMPLIANCE';
      finding.details.missingTags = missingTags;

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 규칙 복잡성 검사
   */
  checkRuleComplexity(securityGroup) {
    const totalRules = (securityGroup.IpPermissions?.length || 0) + 
                      (securityGroup.IpPermissionsEgress?.length || 0);

    if (totalRules > 20) {
      const finding = InspectionFinding.createSecurityGroupFinding(
        securityGroup,
        `보안 그룹에 너무 많은 규칙(${totalRules}개)이 있습니다`,
        '관리를 단순화하기 위해 보안 그룹을 분할하거나 규칙을 통합하세요'
      );
      finding.riskLevel = 'LOW';
      finding.category = 'RELIABILITY';
      finding.details.totalRules = totalRules;

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 미사용 보안 그룹 검사 (인스턴스 정보 필요)
   */
  checkUnusedSecurityGroups(securityGroups, instances) {
    const usedSecurityGroupIds = new Set();

    instances.forEach(instance => {
      if (instance.SecurityGroups) {
        instance.SecurityGroups.forEach(sg => {
          usedSecurityGroupIds.add(sg.GroupId);
        });
      }
    });

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
  }

  /**
   * 권장사항 생성
   */
  getRecommendations(findings) {
    const recommendations = [];
    const securityGroupFindings = findings.filter(f => f.resourceType === 'SecurityGroup');

    if (securityGroupFindings.length > 0) {
      recommendations.push('보안 그룹 규칙을 정기적으로 검토하고 최소 권한 원칙을 적용하세요.');
      
      const criticalFindings = securityGroupFindings.filter(f => f.riskLevel === 'CRITICAL');
      if (criticalFindings.length > 0) {
        recommendations.push('SSH/RDP 접근을 특정 IP 주소로 제한하거나 VPN을 사용하세요.');
      }

      const openAccessFindings = securityGroupFindings.filter(f => 
        f.issue.includes('0.0.0.0/0') || f.issue.includes('무제한 접근')
      );
      if (openAccessFindings.length > 0) {
        recommendations.push('모든 IP에서의 접근을 허용하는 규칙을 검토하고 필요한 경우에만 사용하세요.');
      }
    }

    return recommendations;
  }
}

module.exports = SecurityGroupChecker;