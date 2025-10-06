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
        riskLevel: 'PASS',
        issue: '위험한 포트 검사 - 통과 (보안 그룹 없음)',
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
        // 통합된 보안 그룹 위험한 포트 검사
        this.checkSecurityGroupDangerousPortsComprehensive(sg);

      } catch (error) {
        this.inspector.recordError(error, {
          operation: 'runAllChecks',
          securityGroupId: sg.GroupId
        });
      }
    }
  }

  /**
   * 보안 그룹별 통합 위험한 포트 검사
   */
  checkSecurityGroupDangerousPortsComprehensive(securityGroup) {
    if (!securityGroup.IpPermissions || securityGroup.IpPermissions.length === 0) {
      // 규칙이 없는 보안 그룹 - 안전함
      const finding = new InspectionFinding({
        resourceId: securityGroup.GroupId,
        resourceType: 'SecurityGroup',
        riskLevel: 'PASS',
        issue: '위험한 포트 검사 - 통과 (규칙 없음)',
        recommendation: '현재 보안 그룹에 규칙이 없어 안전합니다. 규칙 추가 시 주의하세요.',
        details: {
          securityGroupId: securityGroup.GroupId,
          securityGroupName: securityGroup.GroupName,
          vpcId: securityGroup.VpcId,
          totalRules: 0,
          status: '인바운드 규칙이 없어 모든 접근 차단'
        },
        category: 'SECURITY'
      });

      this.inspector.addFinding(finding);
      return;
    }

    const issues = [];
    const dangerousRules = [];
    let riskScore = 0;
    let maxRiskLevel = 'PASS';

    // 위험한 포트 정의
    const dangerousPorts = [
      { port: 22, service: 'SSH', riskLevel: 'CRITICAL', score: 5 },
      { port: 3389, service: 'RDP', riskLevel: 'CRITICAL', score: 5 },
      { port: 3306, service: 'MySQL', riskLevel: 'HIGH', score: 4 },
      { port: 5432, service: 'PostgreSQL', riskLevel: 'HIGH', score: 4 },
      { port: 1433, service: 'SQL Server', riskLevel: 'HIGH', score: 4 },
      { port: 27017, service: 'MongoDB', riskLevel: 'HIGH', score: 4 },
      { port: 6379, service: 'Redis', riskLevel: 'HIGH', score: 4 },
      { port: 5984, service: 'CouchDB', riskLevel: 'MEDIUM', score: 3 },
      { port: 9200, service: 'Elasticsearch', riskLevel: 'MEDIUM', score: 3 },
      { port: 21, service: 'FTP', riskLevel: 'HIGH', score: 4 },
      { port: 23, service: 'Telnet', riskLevel: 'CRITICAL', score: 5 },
      { port: 25, service: 'SMTP', riskLevel: 'MEDIUM', score: 3 },
      { port: 53, service: 'DNS', riskLevel: 'MEDIUM', score: 3 },
      { port: 135, service: 'RPC', riskLevel: 'HIGH', score: 4 },
      { port: 445, service: 'SMB', riskLevel: 'HIGH', score: 4 }
    ];

    // 각 규칙 검사
    securityGroup.IpPermissions.forEach(rule => {
      const hasOpenAccess = rule.IpRanges?.some(range => range.CidrIp === '0.0.0.0/0');
      
      if (hasOpenAccess) {
        // 위험한 포트 검사
        dangerousPorts.forEach(({ port, service, riskLevel, score }) => {
          if (this.ruleCoversPort(rule, port)) {
            issues.push(`${service} 포트(${port})가 인터넷 전체에 개방됨`);
            dangerousRules.push({
              port: port,
              service: service,
              protocol: rule.IpProtocol,
              riskLevel: riskLevel,
              fromPort: rule.FromPort,
              toPort: rule.ToPort
            });
            riskScore += score;
            
            // 최고 위험도 업데이트
            if (riskLevel === 'CRITICAL' && maxRiskLevel !== 'CRITICAL') {
              maxRiskLevel = 'CRITICAL';
            } else if (riskLevel === 'HIGH' && maxRiskLevel !== 'CRITICAL' && maxRiskLevel !== 'HIGH') {
              maxRiskLevel = 'HIGH';
            } else if (riskLevel === 'MEDIUM' && maxRiskLevel === 'PASS') {
              maxRiskLevel = 'MEDIUM';
            }
          }
        });

        // 과도한 포트 범위 검사
        if (rule.FromPort !== undefined && rule.ToPort !== undefined) {
          const portRange = rule.ToPort - rule.FromPort + 1;
          if (portRange > 100) {
            issues.push(`과도한 포트 범위(${rule.FromPort}-${rule.ToPort}, ${portRange}개 포트) 개방`);
            riskScore += 2;
            if (maxRiskLevel === 'PASS') {
              maxRiskLevel = 'MEDIUM';
            }
          }
        }

        // 모든 포트 개방 검사 (0-65535)
        if (rule.FromPort === 0 && rule.ToPort === 65535) {
          issues.push('모든 포트(0-65535)가 인터넷에 개방됨');
          riskScore += 10;
          maxRiskLevel = 'CRITICAL';
        }
      }
    });

    // 결과 결정
    let status = '';
    let recommendation = '';

    if (issues.length === 0) {
      status = '위험한 포트 노출 없음';
      recommendation = '현재 보안 설정이 양호합니다. 새로운 규칙 추가 시에도 주의하세요.';
    } else {
      if (maxRiskLevel === 'CRITICAL') {
        status = '즉시 조치 필요 - 심각한 포트 노출';
        recommendation = '즉시 SSH/RDP 포트를 특정 IP로 제한하고 불필요한 규칙을 제거하세요.';
      } else if (maxRiskLevel === 'HIGH') {
        status = '높은 위험 - 데이터베이스 포트 노출';
        recommendation = '데이터베이스 포트를 내부 네트워크로만 제한하고 보안을 강화하세요.';
      } else {
        status = '중간 위험 - 일부 포트 노출';
        recommendation = '노출된 포트들을 검토하고 필요시 접근을 제한하세요.';
      }
    }

    // 결과 생성
    const finding = new InspectionFinding({
      resourceId: securityGroup.GroupId,
      resourceType: 'SecurityGroup',
      riskLevel: maxRiskLevel,
      issue: issues.length > 0 ? 
        `위험한 포트 노출 - ${status}: ${issues.join(', ')}` : 
        '위험한 포트 검사 - 통과',
      recommendation: recommendation,
      details: {
        securityGroupId: securityGroup.GroupId,
        securityGroupName: securityGroup.GroupName,
        vpcId: securityGroup.VpcId,
        status: status,
        riskScore: riskScore,
        totalRules: securityGroup.IpPermissions.length,
        dangerousRules: dangerousRules,
        issues: issues,
        summary: {
          criticalPorts: dangerousRules.filter(r => r.riskLevel === 'CRITICAL').length,
          highRiskPorts: dangerousRules.filter(r => r.riskLevel === 'HIGH').length,
          mediumRiskPorts: dangerousRules.filter(r => r.riskLevel === 'MEDIUM').length,
          totalDangerousPorts: dangerousRules.length
        },
        actionItems: [
          dangerousRules.some(r => r.port === 22) ? 'SSH 포트(22) 접근을 특정 IP로 제한' : null,
          dangerousRules.some(r => r.port === 3389) ? 'RDP 포트(3389) 접근을 특정 IP로 제한' : null,
          dangerousRules.filter(r => [3306, 5432, 1433, 27017, 6379].includes(r.port)).length > 0 ? '데이터베이스 포트들을 내부 네트워크로만 제한' : null,
          issues.some(i => i.includes('과도한 포트 범위')) ? '불필요한 포트 범위 축소' : null
        ].filter(Boolean),
        securityRisks: dangerousRules.length > 0 ? [
          '무차별 대입 공격(Brute Force)',
          '자동화된 취약점 스캔',
          '데이터베이스 무단 접근',
          '시스템 권한 탈취',
          '데이터 유출 위험'
        ] : [],
        bestPractices: [
          '특정 IP 주소로만 접근 제한',
          '필요한 포트만 개방',
          'VPN 또는 Bastion Host 사용',
          '정기적인 보안 그룹 검토'
        ]
      },
      category: 'SECURITY'
    });

    this.inspector.addFinding(finding);
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
    
    if (!findings || findings.length === 0) {
      return recommendations;
    }

    const criticalFindings = findings.filter(f => f.riskLevel === 'CRITICAL');
    const highRiskFindings = findings.filter(f => f.riskLevel === 'HIGH');
    
    if (criticalFindings.length > 0) {
      recommendations.push('즉시 SSH/RDP 포트를 특정 IP로 제한하고 불필요한 규칙을 제거하세요.');
    }
    
    if (highRiskFindings.length > 0) {
      recommendations.push('데이터베이스 포트를 내부 네트워크로만 제한하고 보안을 강화하세요.');
    }
    
    if (criticalFindings.length > 0 || highRiskFindings.length > 0) {
      recommendations.push('VPN 또는 Bastion Host를 통한 접근을 고려하세요.');
    }
    
    return recommendations;
  }
}

module.exports = DangerousPortsChecker;