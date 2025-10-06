const { GetBucketEncryptionCommand } = require('@aws-sdk/client-s3');

class BucketEncryptionChecker {
  async check(s3Client, buckets) {
    const results = { findings: [] };

    if (buckets.length === 0) {
      results.findings.push({
        id: 's3-no-buckets-encryption-check',
        title: '검사할 S3 버킷 없음',
        description: '현재 계정에 S3 버킷이 없어 암호화 검사를 수행할 수 없습니다.',
        severity: 'info',
        resource: 'N/A',
        recommendation: 'S3 버킷이 생성된 후 다시 검사를 실행하세요.'
      });
      return results;
    }

    let encryptedBuckets = 0;
    let unencryptedBuckets = 0;

    for (const bucket of buckets) {
      try {
        // 버킷별 S3 클라이언트 사용 (리전별 엔드포인트)
        const clientToUse = bucket.s3Client || s3Client;
        const encryptionResponse = await clientToUse.send(
          new GetBucketEncryptionCommand({ Bucket: bucket.Name })
        );

        if (encryptionResponse.ServerSideEncryptionConfiguration) {
          encryptedBuckets++;
          const config = encryptionResponse.ServerSideEncryptionConfiguration;
          this.analyzeEncryptionConfig(config, bucket.Name, results);
        }
      } catch (error) {
        if (error.name === 'ServerSideEncryptionConfigurationNotFoundError') {
          // 암호화가 설정되지 않은 경우
          unencryptedBuckets++;
          results.findings.push({
            id: `s3-no-encryption-${bucket.Name}`,
            title: 'S3 버킷 암호화 미설정',
            description: `S3 버킷 '${bucket.Name}'에 서버 측 암호화가 설정되지 않았습니다.`,
            severity: 'high',
            resource: bucket.Name,
            recommendation: 'S3 버킷에 서버 측 암호화를 활성화하세요. AES-256 (SSE-S3) 또는 AWS KMS (SSE-KMS)를 사용할 수 있습니다. 민감한 데이터의 경우 KMS 키를 사용하는 것을 권장합니다.'
          });
        } else {
          console.warn(`버킷 ${bucket.Name}의 암호화 설정을 확인할 수 없습니다:`, error.message);
        }
      }
    }

    // 전체 요약 결과 추가
    if (unencryptedBuckets === 0) {
      results.findings.push({
        id: 's3-all-buckets-encrypted',
        title: '모든 S3 버킷이 암호화됨',
        description: `총 ${buckets.length}개의 모든 S3 버킷에 암호화가 설정되어 있습니다.`,
        severity: 'info',
        resource: 'All Buckets',
        recommendation: '훌륭합니다! 모든 버킷이 암호화되어 있습니다. 새로운 버킷 생성 시에도 암호화를 활성화하세요.'
      });
    }

    return results;
  }

  analyzeEncryptionConfig(config, bucketName, results) {
    if (!config.Rules || config.Rules.length === 0) {
      results.findings.push({
        id: `s3-no-encryption-rules-${bucketName}`,
        title: '암호화 규칙 없음',
        description: `S3 버킷 '${bucketName}'에 암호화 규칙이 설정되지 않았습니다.`,
        severity: 'high',
        resource: bucketName,
        recommendation: '적절한 암호화 규칙을 설정하세요.'
      });
      return;
    }

    for (const rule of config.Rules) {
      if (!rule.ApplyServerSideEncryptionByDefault) {
        results.findings.push({
          id: `s3-no-default-encryption-${bucketName}`,
          title: '기본 암호화 미설정',
          description: `S3 버킷 '${bucketName}'에 기본 암호화가 설정되지 않았습니다.`,
          severity: 'high',
          resource: bucketName,
          recommendation: '모든 객체에 대해 기본 암호화를 활성화하세요.'
        });
        continue;
      }

      const encryption = rule.ApplyServerSideEncryptionByDefault;
      
      // AES256 사용 시 권장사항
      if (encryption.SSEAlgorithm === 'AES256') {
        results.findings.push({
          id: `s3-aes256-encryption-${bucketName}`,
          title: 'AES-256 암호화 사용',
          description: `S3 버킷 '${bucketName}'이 AES-256 암호화를 사용하고 있습니다.`,
          severity: 'info',
          resource: bucketName,
          recommendation: '보안 강화를 위해 AWS KMS 키를 사용한 암호화(SSE-KMS)로 업그레이드를 고려하세요. KMS를 사용하면 키 관리, 액세스 로깅, 키 회전 등의 추가 기능을 활용할 수 있습니다.'
        });
      }

      // KMS 키 사용 시 분석
      if (encryption.SSEAlgorithm === 'aws:kms') {
        if (!encryption.KMSMasterKeyID) {
          results.findings.push({
            id: `s3-default-kms-key-${bucketName}`,
            title: '기본 KMS 키 사용',
            description: `S3 버킷 '${bucketName}'이 AWS 관리형 기본 KMS 키를 사용하고 있습니다.`,
            severity: 'low',
            resource: bucketName,
            recommendation: '더 세밀한 액세스 제어를 위해 고객 관리형 KMS 키 사용을 고려하세요. 고객 관리형 키를 사용하면 키 정책을 통해 더 정교한 권한 관리가 가능합니다.'
          });
        } else {
          results.findings.push({
            id: `s3-custom-kms-key-${bucketName}`,
            title: '고객 관리형 KMS 키 사용',
            description: `S3 버킷 '${bucketName}'이 고객 관리형 KMS 키를 사용하고 있습니다.`,
            severity: 'info',
            resource: bucketName,
            recommendation: 'KMS 키 정책이 적절히 설정되어 있는지 확인하고, 정기적인 키 회전을 활성화하세요.'
          });
        }
      }

      // Bucket Key 사용 여부 확인
      if (!rule.BucketKeyEnabled) {
        results.findings.push({
          id: `s3-bucket-key-disabled-${bucketName}`,
          title: 'S3 Bucket Key 미사용',
          description: `S3 버킷 '${bucketName}'에서 Bucket Key가 비활성화되어 있습니다.`,
          severity: 'low',
          resource: bucketName,
          recommendation: 'KMS 비용 절감을 위해 S3 Bucket Key를 활성화하세요. Bucket Key를 사용하면 KMS 요청 수를 줄여 암호화 비용을 최대 99%까지 절감할 수 있습니다.'
        });
      }
    }
  }
}

module.exports = BucketEncryptionChecker;