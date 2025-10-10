/**
 * Bucket CORS Checker
 * S3 버킷 CORS 설정을 검사하는 모듈
 */

const InspectionFinding = require('../../../../models/InspectionFinding');

class BucketCorsChecker {
  constructor(inspector) {
    this.inspector = inspector;
  }

  /**
   * 모든 버킷 CORS 검사 실행
   */
  async runAllChecks(buckets) {
    if (!buckets || buckets.length === 0) {
      const finding = new InspectionFinding({
        resourceId: 'no-s3-buckets',
        resourceType: 'S3Bucket',
        riskLevel: 'PASS',
        issue: 'S3 버킷 CORS 검사 - 통과 (버킷 없음)',
        recommendation: 'S3 버킷 생성 시 CORS 설정이 필요한 경우 최소 권한 원칙을 적용하세요',
        details: {
          totalBuckets: 0,
          status: '현재 S3 버킷 CORS 관련 위험이 없습니다'
        },
        category: 'COMPLIANCE'
      });
      
      this.inspector.addFinding(finding);
      return;
    }

    for (const bucket of buckets) {
      try {
        this.checkBucketCorsComprehensive(bucket);
      } catch (error) {
        this.inspector.recordError(error, {
          operation: 'runAllChecks',
          bucketName: bucket.Name
        });
      }
    }
  }

  /**
   * 버킷별 통합 CORS 검사
   */
  checkBucketCorsComprehensive(bucket) {
    const cors = bucket.Cors;
    
    if (!cors || !cors.CORSRules || cors.CORSRules.length === 0) {
      const finding = new InspectionFinding({
        resourceId: bucket.Name,
        resourceType: 'S3Bucket',
        riskLevel: 'PASS',
        issue: 'S3 버킷 CORS 설정 없음',
        recommendation: 'CORS가 설정되지 않아 크로스 오리진 요청이 차단됩니다. 필요한 경우에만 최소 권한으로 설정하세요.',
        details: {
          bucketName: bucket.Name,
          region: bucket.Region,
          corsStatus: 'NOT_CONFIGURED',
          securityBenefit: 'CORS 미설정으로 크로스 오리진 공격 위험 최소화'
        },
        category: 'SECURITY'
      });
      this.inspector.addFinding(finding);
    } else {
      // CORS 규칙 분석
      const hasWildcardOrigin = cors.CORSRules.some(rule => 
        rule.AllowedOrigins && rule.AllowedOrigins.includes('*')
      );
      
      if (hasWildcardOrigin) {
        const finding = new InspectionFinding({
          resourceId: bucket.Name,
          resourceType: 'S3Bucket',
          riskLevel: 'MEDIUM',
          issue: 'S3 버킷 CORS 설정 - 와일드카드 오리진 허용',
          recommendation: '보안을 위해 특정 도메인만 허용하도록 CORS 설정을 제한하세요',
          details: {
            bucketName: bucket.Name,
            region: bucket.Region,
            corsStatus: 'CONFIGURED_WITH_WILDCARD',
            rulesCount: cors.CORSRules.length,
            securityRisk: '모든 도메인에서 크로스 오리진 요청 허용'
          },
          category: 'SECURITY'
        });
        this.inspector.addFinding(finding);
      } else {
        const finding = new InspectionFinding({
          resourceId: bucket.Name,
          resourceType: 'S3Bucket',
          riskLevel: 'PASS',
          issue: 'S3 버킷 CORS 설정 - 적절히 제한됨',
          recommendation: 'CORS가 적절히 설정되어 있습니다. 정기적으로 허용된 오리진을 검토하세요.',
          details: {
            bucketName: bucket.Name,
            region: bucket.Region,
            corsStatus: 'PROPERLY_CONFIGURED',
            rulesCount: cors.CORSRules.length
          },
          category: 'COMPLIANCE'
        });
        this.inspector.addFinding(finding);
      }
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
    const corsFindings = findings.filter(f => 
      f.issue && f.issue.includes('CORS')
    );

    if (corsFindings.length > 0) {
      const wildcardFindings = corsFindings.filter(f => 
        f.issue.includes('와일드카드')
      );
      if (wildcardFindings.length > 0) {
        recommendations.push('CORS 설정에서 와일드카드 오리진을 제거하고 특정 도메인만 허용하세요.');
      }
    }

    return recommendations;
  }
}

module.exports = BucketCorsChecker;