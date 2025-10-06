/**
 * Inspection Finding Model
 * 검사 결과 세부 항목 모델
 * Requirements: 2.3, 5.1
 */

class InspectionFinding {
  constructor({
    resourceId,
    resourceType,
    riskLevel,
    issue,
    recommendation,
    details = {},
    category = 'SECURITY',
    severity = 'MEDIUM'
  }) {
    this.resourceId = resourceId;
    this.resourceType = resourceType;
    this.riskLevel = riskLevel;
    this.issue = issue;
    this.recommendation = recommendation;
    this.details = details;
    this.category = category;
    this.severity = severity;
    this.timestamp = Date.now();
  }

  /**
   * 위험도 점수 계산
   * @returns {number} 위험도 점수 (0-100)
   */
  getRiskScore() {
    const riskScores = {
      'PASS': 0,
      'LOW': 25,
      'MEDIUM': 50,
      'HIGH': 75,
      'CRITICAL': 100
    };

    return riskScores[this.riskLevel] || 50;
  }

  /**
   * 카테고리별 색상 코드 반환
   * @returns {string} 색상 코드
   */
  getCategoryColor() {
    const categoryColors = {
      'SECURITY': '#ff4757',
      'PERFORMANCE': '#ffa502',
      'COST': '#2ed573',
      'RELIABILITY': '#3742fa',
      'COMPLIANCE': '#8b00ff'
    };

    return categoryColors[this.category] || '#747d8c';
  }

  /**
   * API 응답용 객체 변환
   * @returns {Object} API 응답 형식
   */
  toApiResponse() {
    return {
      resourceId: this.resourceId,
      resourceType: this.resourceType,
      riskLevel: this.riskLevel,
      issue: this.issue,
      recommendation: this.recommendation,
      details: this.details,
      category: this.category,
      severity: this.severity,
      riskScore: this.getRiskScore(),
      categoryColor: this.getCategoryColor(),
      timestamp: this.timestamp
    };
  }

  /**
   * 유효성 검증
   * @returns {Object} 유효성 검증 결과
   */
  validate() {
    const errors = [];

    if (!this.resourceId) {
      errors.push('resourceId is required');
    }

    if (!this.resourceType) {
      errors.push('resourceType is required');
    }

    if (!this.issue) {
      errors.push('issue description is required');
    }

    if (!this.recommendation) {
      errors.push('recommendation is required');
    }

    const validRiskLevels = ['PASS', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    if (!validRiskLevels.includes(this.riskLevel)) {
      errors.push(`riskLevel must be one of: ${validRiskLevels.join(', ')}`);
    }

    const validCategories = ['SECURITY', 'PERFORMANCE', 'COST', 'RELIABILITY', 'COMPLIANCE'];
    if (!validCategories.includes(this.category)) {
      errors.push(`category must be one of: ${validCategories.join(', ')}`);
    }

    const validSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    if (!validSeverities.includes(this.severity)) {
      errors.push(`severity must be one of: ${validSeverities.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 보안 그룹 관련 Finding 생성 헬퍼
   * @param {Object} securityGroup - 보안 그룹 정보
   * @param {string} issue - 문제점
   * @param {string} recommendation - 권장사항
   * @returns {InspectionFinding} Finding 인스턴스
   */
  static createSecurityGroupFinding(securityGroup, issue, recommendation) {
    return new InspectionFinding({
      resourceId: securityGroup.GroupId,
      resourceType: 'SecurityGroup',
      riskLevel: 'HIGH',
      issue,
      recommendation,
      details: {
        groupId: securityGroup.GroupId,
        groupName: securityGroup.GroupName,
        description: securityGroup.Description,
        vpcId: securityGroup.VpcId,
        rules: securityGroup.IpPermissions || []
      },
      category: 'SECURITY',
      severity: 'HIGH'
    });
  }

  /**
   * EC2 인스턴스 관련 Finding 생성 헬퍼
   * @param {Object} instance - EC2 인스턴스 정보
   * @param {string} issue - 문제점
   * @param {string} recommendation - 권장사항
   * @param {string} riskLevel - 위험도
   * @returns {InspectionFinding} Finding 인스턴스
   */
  static createEC2Finding(instance, issue, recommendation, riskLevel = 'MEDIUM') {
    return new InspectionFinding({
      resourceId: instance.InstanceId,
      resourceType: 'EC2Instance',
      riskLevel,
      issue,
      recommendation,
      details: {
        instanceId: instance.InstanceId,
        instanceType: instance.InstanceType,
        state: instance.State?.Name,
        publicIpAddress: instance.PublicIpAddress,
        privateIpAddress: instance.PrivateIpAddress,
        securityGroups: instance.SecurityGroups || []
      },
      category: 'SECURITY',
      severity: riskLevel
    });
  }

  /**
   * 여러 Finding을 위험도별로 그룹화
   * @param {Array<InspectionFinding>} findings - Finding 배열
   * @returns {Object} 위험도별 그룹화된 결과
   */
  static groupByRiskLevel(findings) {
    return findings.reduce((groups, finding) => {
      const level = finding.riskLevel;
      if (!groups[level]) {
        groups[level] = [];
      }
      groups[level].push(finding);
      return groups;
    }, {});
  }

  /**
   * Finding 요약 통계 생성
   * @param {Array<InspectionFinding>} findings - Finding 배열
   * @returns {Object} 요약 통계
   */
  static generateSummary(findings) {
    const summary = {
      totalFindings: findings.length,
      passedChecks: 0,
      criticalIssues: 0,
      highRiskIssues: 0,
      mediumRiskIssues: 0,
      lowRiskIssues: 0,
      categories: {},
      averageRiskScore: 0
    };

    let totalRiskScore = 0;

    findings.forEach(finding => {
      // 위험도별 카운트
      switch (finding.riskLevel) {
        case 'PASS':
          summary.passedChecks++;
          break;
        case 'CRITICAL':
          summary.criticalIssues++;
          break;
        case 'HIGH':
          summary.highRiskIssues++;
          break;
        case 'MEDIUM':
          summary.mediumRiskIssues++;
          break;
        case 'LOW':
          summary.lowRiskIssues++;
          break;
      }

      // 카테고리별 카운트
      if (!summary.categories[finding.category]) {
        summary.categories[finding.category] = 0;
      }
      summary.categories[finding.category]++;

      // 위험도 점수 합계
      totalRiskScore += finding.getRiskScore();
    });

    // 평균 위험도 점수 계산
    if (findings.length > 0) {
      summary.averageRiskScore = Math.round(totalRiskScore / findings.length);
    }

    return summary;
  }
}

module.exports = InspectionFinding;