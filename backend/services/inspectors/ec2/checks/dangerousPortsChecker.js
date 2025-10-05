/**
 * Dangerous Ports Checker
 * 위험한 포트들의 보안 설정을 통합 검사하는 모듈
 */

const InspectionFinding = require('../../../../models/InspectionFinding');

class DangerousPortsChecker {
  constructor(inspector) {
    this.inspector = inspector;
  }

  /**
   * 모든 위험한 포트 검사 실행
   */
  async runAllChecks(securityGroups) {
    if (!securityGroups || securityGroups.length === 0) {
      const finding = new InspectionFinding({
        resourceId: 'no-security-groups',
        resourceType: 'SecurityGroup',
        riskLevel: 'LOW',
        issue: '보안 그룹이 없어 위험한 포트 노출 위험이 없습니다',
        recommendation: '보안 그룹 생성 시 위험한 포트 개방을 피하세요',
        details: {
          totalSecurityGroups: 0,
          status: '현재 위험한 포트 관련 보안 위험이 없습니다',
          dangerousPorts: this.getDangerousPortsList()
        },
        category: 'COMPLIANCE'
      });
      
      this.inspector.addFinding(finding);
      return;
    }

    for (const sg of securityGroups) {
      try {
        // 1. SSH 포트 22번 검사
        this.checkSSHPort(sg);

        // 2. RDP 포트 3389번 검사
        this.checkRDPPort(sg);

        // 3. 데이터베이스 포트들 검사
        this.checkDatabasePorts(sg);

        // 4. 기타 위험한 포트들 검사
        this.checkOtherDangerousPorts(sg);

        // 5. 과도한 포트 범위 검사
        this.checkExcessivePortRanges(sg);

      } catch (error) {
        this.inspector.recordError(error, {
          operation: 'runAllChecks',
          securityGroupId: sg.GroupId
        });
      }
    }
  }

  /**
   * SSH 포트 22번 검사
   */
  checkSSHPort(securityGroup) {
    if (!securityGroup.IpPermissions) return;

    securityGroup.IpPermissions.forEach(rule => {
      if (this.ruleCoversPort(rule, 22)) {
        const hasOpenAccess = rule.IpRanges?.some(range => range.CidrIp === '0.0.0.0/0');

        if (hasOpenAccess) {
          const finding = new InspectionFinding({
            resourceId: securityGroup.GroupId,
            resourceType: 'SecurityGroup',
            riskLevel: 'CRITICAL',
            issue: 'SSH 포트(22)가 인터넷 전체(0.0.0.0/0)에 개방되어 있습니다',
            recommendation: 'SSH 접근을 특정 IP 주소나 VPN으로 제한하세요',
            details: {
              securityGroupId: securityGroup.GroupId,
              securityGroupName: securityGroup.GroupName,
              port: 22,
              service: 'SSH',
              protocol: rule.IpProtocol,
              risks: [
                '무차별 대입 공격(Brute Force)',
                '봇넷을 통한 자동화된 공격',
                '취약점 스캔 및 악용',
                '불법 접근 시도'
              ]
            },
            category: 'SECURITY'
          });

          this.inspector.addFinding(finding);
        }
      }
    });
  }

  /**
   * RDP 포트 3389번 검사
   */
  checkRDPPort(securityGroup) {
    if (!securityGroup.IpPermissions) return;

    securityGroup.IpPermissions.forEach(rule => {
      if (this.ruleCoversPort(rule, 3389)) {
        const hasOpenAccess = rule.IpRanges?.some(range => range.CidrIp === '0.0.0.0/0');

        if (hasOpenAccess) {
          const finding = new InspectionFinding({
            resourceId: securityGroup.GroupId,
            resourceType: 'SecurityGroup',
            riskLevel: 'CRITICAL',
            issue: 'RDP 포트(3389)가 인터넷 전체(0.0.0.0/0)에 개방되어 있습니다',
            recommendation: 'RDP 접근을 특정 IP 주소나 VPN으로 제한하세요',
            details: {
              securityGroupId: securityGroup.GroupId,
              securityGroupName: securityGroup.GroupName,
              port: 3389,
              service: 'RDP',
              protocol: rule.IpProtocol,
              risks: [
                'Windows 서버 무단 접근',
                '랜섬웨어 공격',
                '시스템 권한 탈취',
                '데이터 유출'
              ]
            },
            category: 'SECURITY'
          });

          this.inspector.addFinding(finding);
        }
      }
    });
  }

  /**
   * 데이터베이스 포트들 검사
   */
  checkDatabasePorts(securityGroup) {
    if (!securityGroup.IpPermissions) return;

    const databasePorts = [
      { port: 3306, service: 'MySQL' },
      { port: 5432, service: 'PostgreSQL' },
      { port: 1433, service: 'SQL Server' },
      { port: 27017, service: 'MongoDB' },
      { port: 6379, service: 'Redis' },
      { port: 5984, service: 'CouchDB' },
      { port: 9200, service: 'Elasticsearch' }
    ];

    securityGroup.IpPermissions.forEach(rule => {
      databasePorts.forEach(({ port, service }) => {
        if (this.ruleCoversPort(rule, port)) {
          const hasOpenAccess = rule.IpRanges?.some(range => range.CidrIp === '0.0.0.0/0');

          if (hasOpenAccess) {
            const finding = new InspectionFinding({
              resourceId: securityGroup.GroupId,
              resourceType: 'SecurityGroup',
              riskLevel: 'CRITICAL',
              issue: `${service} 포트(${port})가 인터넷 전체(0.0.0.0/0)에 개방되어 있습니다`,
              recommendation: `${service} 접근을 애플리케이션 서버나 특정 IP로만 제한하세요`,
              details: {
                securityGroupId: securityGroup.GroupId,
                securityGroupName: securityGroup.GroupName,
                port: port,
                service: service,
                protocol: rule.IpProtocol,
                risks: [
                  '데이터베이스 무단 접근',
                  '민감한 데이터 유출',
                  '데이터 조작 및 삭제',
                  'SQL 인젝션 공격'
                ]
              },
              category: 'SECURITY'
            });

            this.inspector.addFinding(finding);
          }
        }
      });
    });
  }

  /**
   * 기타 위험한 포트들 검사
   */
  checkOtherDangerousPorts(securityGroup) {
    if (!securityGroup.IpPermissions) return;

    const dangerousPorts = [
      { port: 21, service: 'FTP', risk: 'HIGH' },
      { port: 23, service: 'Telnet', risk: 'CRITICAL' },
      { port: 135, service: 'RPC', risk: 'HIGH' },
      { port: 139, service: 'NetBIOS', risk: 'HIGH' },
      { port: 445, service: 'SMB', risk: 'HIGH' },
      { port: 161, service: 'SNMP', risk: 'MEDIUM' },
      { port: 1521, service: 'Oracle DB', risk: 'HIGH' },
      { port: 2049, service: 'NFS', risk: 'HIGH' }
    ];

    securityGroup.IpPermissions.forEach(rule => {
      dangerousPorts.forEach(({ port, service, risk }) => {
        if (this.ruleCoversPort(rule, port)) {
          const hasOpenAccess = rule.IpRanges?.some(range => range.CidrIp === '0.0.0.0/0');

          if (hasOpenAccess) {
            const finding = new InspectionFinding({
              resourceId: securityGroup.GroupId,
              resourceType: 'SecurityGroup',
              riskLevel: risk,
              issue: `위험한 ${service} 포트(${port})가 인터넷에 개방되어 있습니다`,
              recommendation: `${service} 서비스가 필요하지 않다면 포트를 닫고, 필요하다면 접근을 제한하세요`,
              details: {
                securityGroupId: securityGroup.GroupId,
                securityGroupName: securityGroup.GroupName,
                port: port,
                service: service,
                protocol: rule.IpProtocol,
                securityConcerns: this.getServiceRisks(service)
              },
              category: 'SECURITY'
            });

            this.inspector.addFinding(finding);
          }
        }
      });
    });
  }

  /**
   * 과도한 포트 범위 검사
   */
  checkExcessivePortRanges(securityGroup) {
    if (!securityGroup.IpPermissions) return;

    securityGroup.IpPermissions.forEach(rule => {
      if (rule.FromPort && rule.ToPort) {
        const portRange = rule.ToPort - rule.FromPort + 1;
        const hasOpenAccess = rule.IpRanges?.some(range => range.CidrIp === '0.0.0.0/0');

        if (hasOpenAccess && portRange > 100) {
          const finding = new InspectionFinding({
            resourceId: securityGroup.GroupId,
            resourceType: 'SecurityGroup',
            riskLevel: 'HIGH',
            issue: `과도하게 넓은 포트 범위(${rule.FromPort}-${rule.ToPort})가 인터넷에 개방되어 있습니다`,
            recommendation: '필요한 포트만 개방하여 공격 표면을 줄이세요',
            details: {
              securityGroupId: securityGroup.GroupId,
              securityGroupName: securityGroup.GroupName,
              fromPort: rule.FromPort,
              toPort: rule.ToPort,
              portCount: portRange,
              protocol: rule.IpProtocol,
              risks: [
                '공격 표면 확대',
                '예상치 못한 서비스 노출',
                '포트 스캔 공격 취약성'
              ]
            },
            category: 'SECURITY'
          });

          this.inspector.addFinding(finding);
        }
      }
    });
  }

  /**
   * 규칙이 특정 포트를 포함하는지 확인
   */
  ruleCoversPort(rule, port) {
    return rule.FromPort <= port && rule.ToPort >= port;
  }

  /**
   * 서비스별 위험 요소 반환
   */
  getServiceRisks(service) {
    const risks = {
      'FTP': ['평문 전송', '인증 정보 노출', '파일 시스템 접근'],
      'Telnet': ['평문 통신', '인증 정보 탈취', '원격 명령 실행'],
      'RPC': ['원격 코드 실행', '시스템 권한 탈취', 'Windows 취약점'],
      'NetBIOS': ['네트워크 정보 노출', '공유 폴더 접근', 'Windows 취약점'],
      'SMB': ['파일 공유 접근', '랜섬웨어 전파', 'Windows 취약점'],
      'SNMP': ['시스템 정보 노출', '설정 변경', '네트워크 정보 수집'],
      'Oracle DB': ['데이터베이스 접근', '데이터 유출', 'SQL 인젝션'],
      'NFS': ['파일 시스템 접근', '데이터 유출', '권한 상승']
    };

    return risks[service] || ['보안 위험', '무단 접근', '서비스 악용'];
  }

  /**
   * 위험한 포트 목록 반환
   */
  getDangerousPortsList() {
    return {
      critical: [22, 23, 3389],
      high: [21, 135, 139, 445, 1433, 3306, 5432, 27017],
      medium: [80, 161, 1521, 2049, 5984, 6379, 9200]
    };
  }

  /**
   * 권장사항 생성
   */
  getRecommendations(findings) {
    const recommendations = [];
    const portFindings = findings.filter(f => 
      f.resourceType === 'SecurityGroup' && 
      (f.issue.includes('포트') || f.issue.includes('port'))
    );

    if (portFindings.length > 0) {
      recommendations.push('위험한 포트의 인터넷 접근을 즉시 제한하세요.');
      
      const criticalFindings = portFindings.filter(f => f.riskLevel === 'CRITICAL');
      if (criticalFindings.length > 0) {
        recommendations.push('SSH, RDP, 데이터베이스 포트는 특정 IP로만 접근을 허용하세요.');
      }

      const rangeFindings = portFindings.filter(f => f.issue.includes('범위'));
      if (rangeFindings.length > 0) {
        recommendations.push('필요한 포트만 개방하여 공격 표면을 최소화하세요.');
      }
    }

    return recommendations;
  }
}

module.exports = DangerousPortsChecker;