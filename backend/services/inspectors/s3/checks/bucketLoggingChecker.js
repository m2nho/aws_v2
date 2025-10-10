/**
 * Bucket Logging Checker
 * S3 버킷 액세스 로깅 설정을 검사하는 모듈
 */

const InspectionFinding = require('../../../../models/InspectionFinding');

class BucketLoggingChecker {
  constructor(inspector) {
    this.inspector = inspector;
  }

  /**
   * 모든 버킷 로깅 검사 실행
   */
  async runAllChecks(buckets) {
    if (!buckets || buckets.length === 0) {
      const finding = new InspectionFinding({
        resourceId: 'no-s3-buckets',
        resourceType: 'S3Bucket',
        riskLevel: 'PASS',
        issue: 'S3 버킷 로깅 검사 - 통과 (버킷 없음)',
        recommendation: 'S3 버킷 생성 시 액세스 로깅을 활성화하여 보안 모니터링을 강화하세요',
        details: {
          totalBuckets: 0,
          status: '현재 S3 버킷 로깅 관련 위험이 없습니다'
        },
        category: 'COMPLIANCE'
      });
      
      this.inspector.addFinding(finding);
      return;
    }

    for (const bucket of buckets) {
      try {
        this.checkBucketLoggingComprehensive(bucket);
      } catch (error) {
        this.inspector.recordError(error, {
          operation: 'runAllChecks',
          bucketName: bucket.Name
        });
      }
    }
  }

  /**
   * 버킷별 통합 로깅 검사
   */
  checkBucketLoggingComprehensive(bucket) {
    const logging = bucket.Logging;
    
    if (!logging || !logging.LoggingEnabled) {
      const finding = new InspectionFinding({
        resourceId: bucket.Name,
        resourceType: 'S3Bucket',
        riskLevel: 'MEDIUM',
        issue: 'S3 버킷 액세스 로깅 비활성화',
        recommendation: '보안 모니터링과 감사를 위해 액세스 로깅을 활성화하세요',
        details: {
          bucketName: bucket.Name,
          region: bucket.Region,
          loggingStatus: 'DISABLED',
          securityRisks: [
            '액세스 패턴 추적 불가',
            '보안 사고 시 분석 어려움',
            '규정 준수 요구사항 미충족',
            '비정상적 접근 탐지 불가'
          ]
        },
        category: 'SECURITY'
      });
      this.inspector.addFinding(finding);
    } else {
      const finding = new InspectionFinding({
        resourceId: bucket.Name,
        resourceType: 'S3Bucket',
        riskLevel: 'PASS',
        issue: 'S3 버킷 액세스 로깅 - 활성화됨',
        recommendation: '로깅이 활성화되어 있습니다. 로그를 정기적으로 분석하여 보안을 강화하세요.',
        details: {
          bucketName: bucket.Name,
          region: bucket.Region,
          loggingStatus: 'ENABLED',
          targetBucket: logging.LoggingEnabled.TargetBucket
        },
        category: 'COMPLIANCE'
      });
      this.inspector.addFinding(finding);
    }
  }

  /**
   * 기존 check 메서드 (하위 호환성)
   */
  async check(s3Client, buckets) {
    const results = { findings: [] };
    await this.runAllChecks(buckets);
    
    this.inspector.findings.forEach(finding => {
      results.findings.push({
        id: finding.resourceId,
        title: finding.issue,
        description: finding.issue,
        severity: finding.riskLevel.toLowerCase(),
        resource: finding.resourceId,
        recommendation: finding.recommendation
      });
    });

    return results;
  }

  /**
   * 권장사항 생성
   */
  getRecommendations(findings) {
    const recommendations = [];
    const loggingFindings = findings.filter(f => 
      f.issue && f.issue.includes('로깅')
    );

    if (loggingFindings.length > 0) {
      recommendations.push('모든 S3 버킷에 액세스 로깅을 활성화하세요.');
      recommendations.push('로그 분석을 통한 보안 모니터링을 수행하세요.');
    }

    return recommendations;
  }
}

module.exports = BucketLoggingChecker;