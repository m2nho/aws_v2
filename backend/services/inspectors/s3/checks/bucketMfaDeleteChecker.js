const { GetBucketVersioningCommand } = require('@aws-sdk/client-s3');

class BucketMfaDeleteChecker {
  async check(s3Client, buckets) {
    const results = { findings: [] };

    for (const bucket of buckets) {
      try {
        // 버킷별 S3 클라이언트 사용 (리전별 엔드포인트)
        const clientToUse = bucket.s3Client || s3Client;
        const versioningResponse = await clientToUse.send(
          new GetBucketVersioningCommand({ Bucket: bucket.Name })
        );

        const status = versioningResponse.Status;
        const mfaDelete = versioningResponse.MfaDelete;

        // 버전 관리가 활성화된 버킷에 대해서만 MFA Delete 검사
        if (status === 'Enabled') {
          if (mfaDelete !== 'Enabled') {
            // 버킷 이름이나 태그를 통해 중요도 판단 (실제로는 태그 정보가 필요)
            const isImportantBucket = this.isImportantBucket(bucket.Name);
            
            results.findings.push({
              id: `s3-mfa-delete-disabled-${bucket.Name}`,
              title: 'MFA Delete 비활성화',
              description: `S3 버킷 '${bucket.Name}'에서 MFA Delete가 비활성화되어 있습니다.`,
              severity: isImportantBucket ? 'high' : 'medium',
              resource: bucket.Name,
              recommendation: '중요한 데이터 보호를 위해 MFA Delete를 활성화하세요. MFA Delete를 활성화하면 객체 버전 삭제나 버전 관리 비활성화 시 MFA 인증이 필요합니다. 루트 계정으로만 설정 가능하므로 주의하세요.'
            });
          } else {
            results.findings.push({
              id: `s3-mfa-delete-enabled-${bucket.Name}`,
              title: 'MFA Delete 활성화됨',
              description: `S3 버킷 '${bucket.Name}'에서 MFA Delete가 활성화되어 있습니다.`,
              severity: 'info',
              resource: bucket.Name,
              recommendation: 'MFA Delete가 올바르게 설정되어 있습니다. 객체 버전 삭제 시 MFA 인증이 필요하므로 데이터가 안전하게 보호됩니다.'
            });
          }
        } else {
          // 버전 관리가 비활성화된 경우
          const isImportantBucket = this.isImportantBucket(bucket.Name);
          
          if (isImportantBucket) {
            results.findings.push({
              id: `s3-important-bucket-no-versioning-${bucket.Name}`,
              title: '중요 버킷 버전 관리 비활성화',
              description: `중요한 것으로 보이는 S3 버킷 '${bucket.Name}'에서 버전 관리가 비활성화되어 있습니다.`,
              severity: 'high',
              resource: bucket.Name,
              recommendation: '중요한 데이터 보호를 위해 버전 관리를 활성화하고 MFA Delete를 설정하세요. 버전 관리를 통해 실수로 삭제되거나 수정된 데이터를 복구할 수 있습니다.'
            });
          }
        }

      } catch (error) {
        console.warn(`버킷 ${bucket.Name}의 MFA Delete 설정을 확인할 수 없습니다:`, error.message);
      }
    }

    return results;
  }

  isImportantBucket(bucketName) {
    const importantKeywords = [
      'prod', 'production', 'live',
      'backup', 'archive', 'critical',
      'important', 'secure', 'confidential',
      'database', 'db', 'data',
      'log', 'audit', 'compliance',
      'config', 'configuration'
    ];

    const lowerBucketName = bucketName.toLowerCase();
    return importantKeywords.some(keyword => lowerBucketName.includes(keyword));
  }
}

module.exports = BucketMfaDeleteChecker;