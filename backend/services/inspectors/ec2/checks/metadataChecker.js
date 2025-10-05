/**
 * Metadata Checker
 * EC2 인스턴스 메타데이터 서비스 관련 검사를 담당하는 모듈
 */

const InspectionFinding = require('../../../../models/InspectionFinding');

class MetadataChecker {
  constructor(inspector) {
    this.inspector = inspector;
  }

  /**
   * 모든 메타데이터 검사 실행
   */
  async runAllChecks(instances) {
    const activeInstances = instances.filter(instance => 
      instance.State?.Name !== 'terminated' && 
      instance.State?.Name !== 'terminating'
    );

    // 검사 대상이 없는 경우 정보성 finding 추가
    if (activeInstances.length === 0) {
      const finding = new InspectionFinding({
        resourceId: 'no-instances',
        resourceType: 'EC2Instance',
        riskLevel: 'LOW',
        issue: '검사할 EC2 인스턴스가 없습니다',
        recommendation: 'EC2 인스턴스가 생성되면 메타데이터 서비스 설정을 검토하세요',
        details: {
          totalInstances: instances.length,
          activeInstances: activeInstances.length,
          reason: '활성 상태의 EC2 인스턴스가 없어 메타데이터 서비스 검사를 수행할 수 없습니다'
        },
        category: 'COMPLIANCE'
      });
      
      this.inspector.addFinding(finding);
      return;
    }

    for (const instance of activeInstances) {
      try {
        // 1. IMDSv2 강제 사용 검사
        this.checkIMDSv2Enforcement(instance);

        // 2. 메타데이터 홉 제한 검사
        this.checkMetadataHopLimit(instance);

        // 3. 메타데이터 서비스 비활성화 검사
        this.checkMetadataServiceDisabled(instance);

        // 4. 메타데이터 토큰 TTL 검사
        this.checkMetadataTokenTTL(instance);

      } catch (error) {
        this.inspector.recordError(error, {
          operation: 'runAllChecks',
          instanceId: instance.InstanceId
        });
      }
    }
  }

  /**
   * IMDSv2 강제 사용 검사
   */
  checkIMDSv2Enforcement(instance) {
    const metadataOptions = instance.MetadataOptions;

    if (!metadataOptions) {
      const finding = InspectionFinding.createEC2Finding(
        instance,
        '인스턴스 메타데이터 서비스 구성 정보를 사용할 수 없습니다',
        '향상된 보안을 위해 IMDSv2가 강제로 적용되도록 하세요',
        'MEDIUM'
      );
      finding.details.missingMetadataOptions = true;

      this.inspector.addFinding(finding);
      return;
    }

    // IMDSv1이 허용되는지 검사
    if (metadataOptions.HttpTokens !== 'required') {
      const finding = InspectionFinding.createEC2Finding(
        instance,
        'EC2 인스턴스에서 IMDSv2가 강제되지 않습니다',
        'Instance Metadata Service v2 (IMDSv2)를 강제로 사용하도록 설정하세요',
        'HIGH'
      );
      finding.details.metadataOptions = {
        httpTokens: metadataOptions.HttpTokens,
        httpEndpoint: metadataOptions.HttpEndpoint
      };

      this.inspector.addFinding(finding);
    }

    // 메타데이터 서비스가 활성화되어 있는지 확인
    if (metadataOptions.HttpEndpoint === 'disabled') {
      const finding = InspectionFinding.createEC2Finding(
        instance,
        '인스턴스 메타데이터 서비스가 완전히 비활성화되어 있습니다',
        '메타데이터 서비스를 완전히 비활성화하는 대신 IMDSv2 활성화를 고려하세요',
        'LOW'
      );
      finding.category = 'RELIABILITY';

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 메타데이터 홉 제한 검사
   */
  checkMetadataHopLimit(instance) {
    const metadataOptions = instance.MetadataOptions;
    
    if (!metadataOptions) return;

    // 홉 제한이 너무 높은지 검사
    if (metadataOptions.HttpPutResponseHopLimit > 1) {
      const finding = InspectionFinding.createEC2Finding(
        instance,
        `EC2 인스턴스의 메타데이터 홉 제한이 ${metadataOptions.HttpPutResponseHopLimit}로 설정되어 있습니다`,
        '메타데이터 홉 제한을 1로 설정하여 보안을 강화하세요',
        'MEDIUM'
      );
      finding.details.currentHopLimit = metadataOptions.HttpPutResponseHopLimit;
      finding.details.recommendedHopLimit = 1;

      this.inspector.addFinding(finding);
    }

    // 컨테이너 환경에서 홉 제한이 적절한지 검사
    if (this.isContainerInstance(instance) && metadataOptions.HttpPutResponseHopLimit < 2) {
      const finding = InspectionFinding.createEC2Finding(
        instance,
        '컨테이너 환경에서 메타데이터 홉 제한이 너무 낮을 수 있습니다',
        '컨테이너 워크로드가 메타데이터에 접근할 수 있도록 홉 제한을 적절히 설정하세요',
        'LOW'
      );
      finding.category = 'RELIABILITY';
      finding.details.currentHopLimit = metadataOptions.HttpPutResponseHopLimit;

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 메타데이터 서비스 비활성화 검사
   */
  checkMetadataServiceDisabled(instance) {
    const metadataOptions = instance.MetadataOptions;
    
    if (!metadataOptions) return;

    // 메타데이터 서비스가 비활성화된 경우의 영향 검사
    if (metadataOptions.HttpEndpoint === 'disabled') {
      // AWS SDK나 CLI를 사용하는 애플리케이션에 영향을 줄 수 있음
      const finding = InspectionFinding.createEC2Finding(
        instance,
        '메타데이터 서비스가 비활성화되어 AWS SDK/CLI 사용에 영향을 줄 수 있습니다',
        'IAM 역할을 사용하는 애플리케이션이 있다면 메타데이터 서비스 활성화를 고려하세요',
        'LOW'
      );
      finding.category = 'RELIABILITY';

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 메타데이터 토큰 TTL 검사
   */
  checkMetadataTokenTTL(instance) {
    const metadataOptions = instance.MetadataOptions;
    
    if (!metadataOptions || metadataOptions.HttpTokens !== 'required') return;

    // 토큰 TTL이 너무 길거나 짧은지 검사
    const ttl = metadataOptions.HttpPutResponseHopLimit;
    
    if (ttl > 21600) { // 6시간 이상
      const finding = InspectionFinding.createEC2Finding(
        instance,
        `메타데이터 토큰 TTL이 ${ttl}초로 너무 길게 설정되어 있습니다`,
        '보안을 위해 메타데이터 토큰 TTL을 더 짧게 설정하세요 (권장: 1-6시간)',
        'LOW'
      );
      finding.details.currentTTL = ttl;
      finding.details.recommendedMaxTTL = 21600;

      this.inspector.addFinding(finding);
    }

    if (ttl < 300) { // 5분 미만
      const finding = InspectionFinding.createEC2Finding(
        instance,
        `메타데이터 토큰 TTL이 ${ttl}초로 너무 짧게 설정되어 있습니다`,
        '애플리케이션 안정성을 위해 메타데이터 토큰 TTL을 적절히 설정하세요 (권장: 5분 이상)',
        'LOW'
      );
      finding.category = 'RELIABILITY';
      finding.details.currentTTL = ttl;
      finding.details.recommendedMinTTL = 300;

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 컨테이너 인스턴스 여부 확인
   */
  isContainerInstance(instance) {
    // 태그나 인스턴스 유형으로 컨테이너 환경 추정
    const containerIndicators = [
      'ecs', 'eks', 'kubernetes', 'docker', 'container'
    ];

    // 태그에서 컨테이너 관련 키워드 검사
    if (instance.Tags) {
      const tagValues = instance.Tags.map(tag => 
        `${tag.Key}:${tag.Value}`.toLowerCase()
      ).join(' ');

      if (containerIndicators.some(indicator => tagValues.includes(indicator))) {
        return true;
      }
    }

    // 인스턴스 유형으로 추정 (컨테이너 최적화된 인스턴스)
    if (instance.InstanceType?.startsWith('c5n') || 
        instance.InstanceType?.startsWith('m5n') ||
        instance.InstanceType?.startsWith('r5n')) {
      return true;
    }

    return false;
  }

  /**
   * 메타데이터 보안 모범 사례 검사
   */
  checkMetadataSecurityBestPractices(instance) {
    const metadataOptions = instance.MetadataOptions;
    
    if (!metadataOptions) return;

    // 모든 메타데이터 보안 설정이 최적화되어 있는지 종합 검사
    const isOptimal = 
      metadataOptions.HttpTokens === 'required' &&
      metadataOptions.HttpPutResponseHopLimit === 1 &&
      metadataOptions.HttpEndpoint === 'enabled';

    if (!isOptimal) {
      const issues = [];
      
      if (metadataOptions.HttpTokens !== 'required') {
        issues.push('IMDSv2 미강제');
      }
      if (metadataOptions.HttpPutResponseHopLimit > 1) {
        issues.push('높은 홉 제한');
      }
      if (metadataOptions.HttpEndpoint !== 'enabled') {
        issues.push('메타데이터 서비스 비활성화');
      }

      const finding = InspectionFinding.createEC2Finding(
        instance,
        `메타데이터 서비스 보안 설정이 최적화되지 않았습니다: ${issues.join(', ')}`,
        'IMDSv2 강제, 홉 제한 1, 서비스 활성화로 설정하세요',
        'MEDIUM'
      );
      finding.details.securityIssues = issues;
      finding.details.currentSettings = metadataOptions;

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 권장사항 생성
   */
  getRecommendations(findings) {
    const recommendations = [];
    const metadataFindings = findings.filter(f => 
      f.issue.includes('메타데이터') || f.issue.includes('metadata') ||
      f.issue.includes('IMDS')
    );

    if (metadataFindings.length > 0) {
      recommendations.push('모든 EC2 인스턴스에서 IMDSv2를 강제로 사용하도록 설정하세요.');
      
      const imdsFindings = metadataFindings.filter(f => 
        f.issue.includes('IMDSv2') || f.issue.includes('HttpTokens')
      );
      if (imdsFindings.length > 0) {
        recommendations.push('인스턴스 메타데이터 서비스 v2(IMDSv2)를 활성화하여 SSRF 공격을 방지하세요.');
      }

      const hopLimitFindings = metadataFindings.filter(f => 
        f.issue.includes('홉 제한') || f.issue.includes('hop limit')
      );
      if (hopLimitFindings.length > 0) {
        recommendations.push('메타데이터 홉 제한을 1로 설정하여 네트워크 기반 공격을 방지하세요.');
      }

      const disabledFindings = metadataFindings.filter(f => 
        f.issue.includes('비활성화') || f.issue.includes('disabled')
      );
      if (disabledFindings.length > 0) {
        recommendations.push('메타데이터 서비스를 완전히 비활성화하기보다는 IMDSv2로 보안을 강화하세요.');
      }
    }

    return recommendations;
  }
}

module.exports = MetadataChecker;