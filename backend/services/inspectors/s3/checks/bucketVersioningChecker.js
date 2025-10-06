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
          results.findings.push({
            id: `s3-versioning-enabled-${bucket.Name}`,
            title: 'S3 버킷 버전 관리 활성화됨',
            description: `S3 버킷 '${bucket.Name}'의 버전 관리가 활성화되어 있습니다.`,
            severity: 'info',
            resource: bucket.Name,
            recommendation: '버전 관리가 활성화되어 있습니다. 스토리지 비용 관리를 위해 라이프사이클 정책을 설정하여 오래된 버전을 자동으로 삭제하거나 저렴한 스토리지 클래스로 이동시키세요.'
          });

          // MFA Delete 검사
          if (mfaDelete !== 'Enabled') {
            results.findings.push({
              id: `s3-mfa-delete-disabled-${bucket.Name}`,
              title: 'MFA Delete 비활성화',
              description: `S3 버킷 '${bucket.Name}'에서 MFA Delete가 비활성화되어 있습니다.`,
              severity: 'medium',
              resource: bucket.Name,
              recommendation: '중요한 데이터가 포함된 버킷의 경우 MFA Delete를 활성화하여 객체 버전 삭제 시 추가 인증을 요구하세요. 이는 실수나 악의적인 삭제로부터 데이터를 보호합니다.'
            });
          }
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

    // 전체 요약 결과 추가
    results.findings.push({
      id: 's3-versioning-summary',
      title: 'S3 버전 관리 검사 완료',
      description: `총 ${buckets.length}개 버킷 검사 완료 - 활성화: ${versioningEnabledCount}개, 비활성화: ${versioningDisabledCount}개`,
      severity: 'info',
      resource: 'All Buckets',
      recommendation: versioningDisabledCount > 0 
        ? '비활성화된 버킷들에 대해 버전 관리 활성화를 고려하세요.'
        : '모든 버킷의 버전 관리 상태가 확인되었습니다.'
    });

    return results;
  }
}

module.exports = BucketVersioningChecker;