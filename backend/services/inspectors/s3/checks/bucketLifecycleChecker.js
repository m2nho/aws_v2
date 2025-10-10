/**
 * Bucket Lifecycle Checker
 * S3 버킷 라이프사이클 정책을 검사하는 모듈
 */

const InspectionFinding = require('../../../../models/InspectionFinding');

class BucketLifecycleChecker {
  constructor(inspector) {
    this.inspector = inspector;
  }

  /**
   * 모든 버킷 라이프사이클 검사 실행
   */
  async runAllChecks(buckets) {
    if (!buckets || buckets.length === 0) {
      const finding = new InspectionFinding({
        resourceId: 'no-s3-buckets',
        resourceType: 'S3Bucket',
        riskLevel: 'PASS',
        issue: 'S3 버킷 라이프사이클 검사 - 통과 (버킷 없음)',
        recommendation: 'S3 버킷 생성 시 라이프사이클 정책을 설정하여 비용을 최적화하세요',
        details: {
          totalBuckets: 0,
          status: '현재 S3 버킷 라이프사이클 관련 위험이 없습니다'
        },
        category: 'COMPLIANCE'
      });
      
      this.inspector.addFinding(finding);
      return;
    }

    for (const bucket of buckets) {
      try {
        this.checkBucketLifecycleComprehensive(bucket);
      } catch (error) {
        this.inspector.recordError(error, {
          operation: 'runAllChecks',
          bucketName: bucket.Name
        });
      }
    }
  }

  /**
   * 버킷별 통합 라이프사이클 검사
   */
  checkBucketLifecycleComprehensive(bucket) {
    const lifecycle = bucket.Lifecycle;
    
    if (!lifecycle || !lifecycle.Rules || lifecycle.Rules.length === 0) {
      const finding = new InspectionFinding({
        resourceId: bucket.Name,
        resourceType: 'S3Bucket',
        riskLevel: 'LOW',
        issue: 'S3 버킷 라이프사이클 정책 미설정',
        recommendation: '스토리지 비용 최적화를 위해 라이프사이클 정책을 설정하세요',
        details: {
          bucketName: bucket.Name,
          region: bucket.Region,
          lifecycleStatus: 'NOT_CONFIGURED',
          costOptimizationOpportunities: [
            '오래된 객체 자동 삭제',
            'Intelligent Tiering 적용',
            '불완전한 멀티파트 업로드 정리',
            '이전 버전 자동 관리'
          ]
        },
        category: 'COST'
      });
      this.inspector.addFinding(finding);
    } else {
      const finding = new InspectionFinding({
        resourceId: bucket.Name,
        resourceType: 'S3Bucket',
        riskLevel: 'PASS',
        issue: 'S3 버킷 라이프사이클 정책 - 설정됨',
        recommendation: '라이프사이클 정책이 설정되어 있습니다. 정기적으로 정책을 검토하여 최적화하세요.',
        details: {
          bucketName: bucket.Name,
          region: bucket.Region,
          lifecycleStatus: 'CONFIGURED',
          rulesCount: lifecycle.Rules.length
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
    const lifecycleFindings = findings.filter(f => 
      f.issue && f.issue.includes('라이프사이클')
    );

    if (lifecycleFindings.length > 0) {
      recommendations.push('모든 S3 버킷에 라이프사이클 정책을 설정하여 비용을 최적화하세요.');
      recommendations.push('Intelligent Tiering을 활용하여 자동 비용 최적화를 구현하세요.');
    }

    return recommendations;
  }
}

module.exports = BucketLifecycleChecker;