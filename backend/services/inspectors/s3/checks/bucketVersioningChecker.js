const { GetBucketVersioningCommand } = require('@aws-sdk/client-s3');

class BucketVersioningChecker {
  async check(s3Client, buckets) {
    const results = { findings: [] };

    if (buckets.length === 0) {
      results.findings.push({
        id: 's3-no-buckets-versioning-check',
        title: '검사할 S3 버킷 없음',
        description: '현재 계정에 S3 버킷이 없어 버전 관리 검사를 수행할 수 없습니다.',
        severity: 'info',
        resource: 'N/A',
        recommendation: 'S3 버킷이 생성된 후 다시 검사를 실행하세요.'
      });
      return results;
    }

    let versioningEnabledCount = 0;
    let versioningDisabledCount = 0;

    for (const bucket of buckets) {
      try {
        // 버킷별 S3 클라이언트 사용 (리전별 엔드포인트)
        const clientToUse = bucket.s3Client || s3Client;
        const versioningResponse = await clientToUse.send(
          new GetBucketVersioningCommand({ Bucket: bucket.Name })
        );

        const status = versioningResponse.Status;
        const mfaDelete = versioningResponse.MfaDelete;

        // 버전 관리 상태 검사
        if (!status || status === 'Suspended') {
          versioningDisabledCount++;
          results.findings.push({
            id: `s3-versioning-disabled-${bucket.Name}`,
            title: 'S3 버킷 버전 관리 비활성화',
            description: `S3 버킷 '${bucket.Name}'의 버전 관리가 비활성화되어 있습니다.`,
            severity: 'medium',
            resource: bucket.Name,
            recommendation: '데이터 보호를 위해 버전 관리를 활성화하세요. 버전 관리를 통해 실수로 삭제되거나 수정된 객체를 복구할 수 있습니다. 비용 관리를 위해 라이프사이클 정책과 함께 사용하세요.'
          });
        } else if (status === 'Enabled') {
          versioningEnabledCount++;
          
          // 통합된 버전 관리 분석
          const issues = [];
          const recommendations = [];
          let securityScore = 80; // 기본 버전 관리 점수
          let maxSeverity = 'pass';

          // MFA Delete 검사
          if (mfaDelete !== 'Enabled') {
            issues.push('MFA Delete 비활성화');
            recommendations.push('중요 데이터 보호를 위해 MFA Delete 활성화');
            securityScore -= 20;
            maxSeverity = 'medium';
          } else {
            securityScore += 20;
          }

          // 통합된 결과 생성
          const status = securityScore >= 90 ? '최적 설정' : securityScore >= 70 ? '양호한 설정' : '개선 필요';
          
          results.findings.push({
            id: `s3-versioning-comprehensive-${bucket.Name}`,
            title: `버전 관리 상태 - ${status}`,
            description: issues.length > 0 ? 
              `S3 버킷 '${bucket.Name}' 버전 관리 분석: 활성화됨, ${issues.join(', ')}` :
              `S3 버킷 '${bucket.Name}'의 버전 관리가 최적으로 설정되어 있습니다.`,
            severity: maxSeverity,
            riskLevel: maxSeverity === 'pass' ? 'PASS' : maxSeverity.toUpperCase(),
            resource: bucket.Name,
            recommendation: issues.length > 0 ? 
              `버전 관리가 활성화되어 있지만 추가 보안 강화가 필요합니다: ${recommendations.join(', ')}` :
              '버전 관리가 최적으로 설정되어 있습니다. 스토리지 비용 관리를 위해 라이프사이클 정책을 설정하세요.',
            details: {
              versioningEnabled: true,
              mfaDeleteEnabled: mfaDelete === 'Enabled',
              securityScore: securityScore,
              issues: issues,
              recommendations: recommendations,
              actionItems: [
                mfaDelete !== 'Enabled' ? 'MFA Delete 활성화' : null,
                '라이프사이클 정책 설정으로 비용 최적화'
              ].filter(Boolean)
            }
          });
        }

      } catch (error) {
        console.warn(`버킷 ${bucket.Name}의 버전 관리 설정을 확인할 수 없습니다:`, error.message);
        results.findings.push({
          id: `s3-versioning-check-error-${bucket.Name}`,
          title: '버전 관리 설정 확인 실패',
          description: `S3 버킷 '${bucket.Name}'의 버전 관리 설정을 확인할 수 없습니다.`,
          severity: 'low',
          resource: bucket.Name,
          recommendation: 'AWS 권한을 확인하고 s3:GetBucketVersioning 권한이 있는지 확인하세요.'
        });
      }
    }



    return results;
  }
}

module.exports = BucketVersioningChecker;