/**
 * Unused Security Groups Checker
 * 미사용 보안 그룹을 검사하는 모듈
 */

const InspectionFinding = require('../../../../models/InspectionFinding');

class UnusedSecurityGroupsChecker {
  constructor(inspector) {
    this.inspector = inspector;
  }

  /**
   * 미사용 보안 그룹 검사 실행
   */
  async runAllChecks(securityGroups, instances) {
    if (!securityGroups || securityGroups.length === 0) {
      const finding = new InspectionFinding({
        resourceId: 'no-security-groups',
        resourceType: 'SecurityGroup',
        riskLevel: 'LOW',
        issue: '보안 그룹이 없어 미사용 보안 그룹 문제가 없습니다',
        recommendation: '보안 그룹 생성 시 명확한 명명 규칙을 사용하세요',
        details: {
          totalSecurityGroups: 0,
          status: '현재 미사용 보안 그룹 관련 문제가 없습니다'
        },
        category: 'COMPLIANCE'
      });
      
      this.inspector.addFinding(finding);
      return;
    }

    try {
      // 1. 미사용 보안 그룹 검사
      this.checkUnusedSecurityGroups(securityGroups, instances);

      // 2. 중복 보안 그룹 검사
      this.checkDuplicateSecurityGroups(securityGroups);

      // 3. 빈 보안 그룹 검사
      this.checkEmptySecurityGroups(securityGroups);

    } catch (error) {
      this.inspector.recordError(error, {
        operation: 'runAllChecks'
      });
    }
  }

  /**
   * 미사용 보안 그룹 검사
   */
  checkUnusedSecurityGroups(securityGroups, instances) {
    // 인스턴스에서 사용 중인 보안 그룹 ID 수집
    const usedSecurityGroupIds = new Set();
    instances.forEach(instance => {
      if (instance.SecurityGroups) {
        instance.SecurityGroups.forEach(sg => {
          usedSecurityGroupIds.add(sg.GroupId);
        });
      }
    });

    // 미사용 보안 그룹 찾기 (기본 보안 그룹 제외)
    const unusedSecurityGroups = securityGroups.filter(sg => 
      !usedSecurityGroupIds.has(sg.GroupId) && 
      sg.GroupName !== 'default'
    );

    if (unusedSecurityGroups.length > 0) {
      const finding = new InspectionFinding({
        resourceId: 'unused-security-groups',
        resourceType: 'SecurityGroup',
        riskLevel: 'MEDIUM',
        issue: `${unusedSecurityGroups.length}개의 미사용 보안 그룹이 발견되었습니다 (기준: EC2 인스턴스에 연결되지 않음)`,
        recommendation: '미사용 보안 그룹을 정리하여 관리 효율성을 높이고 비용을 절감하세요',
        details: {
          detectionCriteria: {
            method: 'EC2 인스턴스 연결 상태 확인',
            excludes: ['default 보안 그룹'],
            checkScope: 'EC2 인스턴스만 확인 (RDS, ELB 등 다른 서비스는 별도 확인 필요)'
          },
          totalSecurityGroups: securityGroups.length,
          usedSecurityGroups: usedSecurityGroupIds.size,
          unusedSecurityGroups: unusedSecurityGroups.length,
          unusedGroups: unusedSecurityGroups.map(sg => ({
            groupId: sg.GroupId,
            groupName: sg.GroupName,
            description: sg.Description,
            vpcId: sg.VpcId,
            creationDate: sg.Tags?.find(tag => tag.Key === 'CreatedDate')?.Value || 'Unknown'
          })),
          costImpact: [
            '관리 복잡성 증가',
            '보안 정책 혼란',
            '규정 준수 어려움'
          ],
          cleanupSteps: [
            '다른 리소스에서 참조 여부 확인',
            'Load Balancer, RDS 등에서 사용 여부 확인',
            '백업 후 단계적 삭제',
            '정기적인 정리 프로세스 수립'
          ]
        },
        category: 'COST_OPTIMIZATION'
      });

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 중복 보안 그룹 검사
   */
  checkDuplicateSecurityGroups(securityGroups) {
    const ruleSignatures = new Map();
    const duplicateGroups = [];

    securityGroups.forEach(sg => {
      // 보안 그룹 규칙의 시그니처 생성
      const signature = this.createRuleSignature(sg);
      
      if (ruleSignatures.has(signature)) {
        duplicateGroups.push({
          original: ruleSignatures.get(signature),
          duplicate: sg
        });
      } else {
        ruleSignatures.set(signature, sg);
      }
    });

    if (duplicateGroups.length > 0) {
      const finding = new InspectionFinding({
        resourceId: 'duplicate-security-groups',
        resourceType: 'SecurityGroup',
        riskLevel: 'LOW',
        issue: `${duplicateGroups.length}개의 중복된 보안 그룹 규칙이 발견되었습니다 (기준: 동일한 인바운드/아웃바운드 규칙)`,
        recommendation: '동일한 규칙을 가진 보안 그룹을 통합하여 관리를 단순화하세요',
        details: {
          duplicateCount: duplicateGroups.length,
          duplicates: duplicateGroups.map(dup => ({
            original: {
              groupId: dup.original.GroupId,
              groupName: dup.original.GroupName
            },
            duplicate: {
              groupId: dup.duplicate.GroupId,
              groupName: dup.duplicate.GroupName
            }
          })),
          benefits: [
            '관리 복잡성 감소',
            '정책 일관성 향상',
            '실수 방지'
          ]
        },
        category: 'COMPLIANCE'
      });

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 빈 보안 그룹 검사
   */
  checkEmptySecurityGroups(securityGroups) {
    const emptySecurityGroups = securityGroups.filter(sg => 
      (!sg.IpPermissions || sg.IpPermissions.length === 0) &&
      (!sg.IpPermissionsEgress || sg.IpPermissionsEgress.length === 1) && // 기본 아웃바운드 규칙만 있는 경우
      sg.GroupName !== 'default'
    );

    if (emptySecurityGroups.length > 0) {
      const finding = new InspectionFinding({
        resourceId: 'empty-security-groups',
        resourceType: 'SecurityGroup',
        riskLevel: 'LOW',
        issue: `${emptySecurityGroups.length}개의 빈 보안 그룹이 발견되었습니다 (기준: 인바운드 규칙 없음, 기본 아웃바운드 규칙만 존재)`,
        recommendation: '규칙이 없는 보안 그룹을 정리하거나 필요한 규칙을 추가하세요',
        details: {
          emptyGroups: emptySecurityGroups.map(sg => ({
            groupId: sg.GroupId,
            groupName: sg.GroupName,
            description: sg.Description,
            vpcId: sg.VpcId
          })),
          possibleReasons: [
            '생성 후 규칙 미설정',
            '규칙 삭제 후 방치',
            '테스트용으로 생성 후 미사용'
          ]
        },
        category: 'COMPLIANCE'
      });

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 보안 그룹 규칙 시그니처 생성
   */
  createRuleSignature(securityGroup) {
    const inboundRules = (securityGroup.IpPermissions || []).map(rule => 
      `${rule.IpProtocol}:${rule.FromPort}-${rule.ToPort}:${JSON.stringify(rule.IpRanges)}`
    ).sort();

    const outboundRules = (securityGroup.IpPermissionsEgress || []).map(rule => 
      `${rule.IpProtocol}:${rule.FromPort}-${rule.ToPort}:${JSON.stringify(rule.IpRanges)}`
    ).sort();

    return `IN:${inboundRules.join('|')}|OUT:${outboundRules.join('|')}`;
  }

  /**
   * 권장사항 생성
   */
  getRecommendations(findings) {
    const recommendations = [];
    const sgFindings = findings.filter(f => 
      f.resourceType === 'SecurityGroup' && 
      (f.issue.includes('미사용') || f.issue.includes('중복') || f.issue.includes('빈'))
    );

    if (sgFindings.length > 0) {
      recommendations.push('미사용 보안 그룹을 정기적으로 정리하여 관리 효율성을 높이세요.');
      
      const unusedFindings = sgFindings.filter(f => f.issue.includes('미사용'));
      if (unusedFindings.length > 0) {
        recommendations.push('다른 AWS 서비스에서 사용 중인지 확인 후 미사용 보안 그룹을 삭제하세요.');
      }

      const duplicateFindings = sgFindings.filter(f => f.issue.includes('중복'));
      if (duplicateFindings.length > 0) {
        recommendations.push('동일한 규칙을 가진 보안 그룹을 통합하여 관리를 단순화하세요.');
      }
    }

    return recommendations;
  }
}

module.exports = UnusedSecurityGroupsChecker;