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



    return results;
  }

  analyzeEncryptionConfig(config, bucketName, results) {
    if (!config.Rules || config.Rules.length === 0) {
      results.findings.push({
        id: `s3-no-encryption-rules-${bucketName}`,
        title: '버킷 암호화 상태 - 규칙 없음',
        description: `S3 버킷 '${bucketName}'에 암호화 규칙이 설정되지 않았습니다.`,
        severity: 'high',
        resource: bucketName,
        recommendation: '적절한 암호화 규칙을 설정하세요.'
      });
      return;
    }

    // 통합된 암호화 분석
    this.analyzeBucketEncryptionComprehensive(config, bucketName, results);
  }

  analyzeBucketEncryptionComprehensive(config, bucketName, results) {
    const issues = [];
    const recommendations = [];
    let encryptionScore = 0;
    let maxSeverity = 'pass';
    let encryptionType = 'none';
    let hasCustomKMS = false;
    let hasBucketKey = false;

    for (const rule of config.Rules) {
      if (!rule.ApplyServerSideEncryptionByDefault) {
        issues.push('기본 암호화 미설정');
        maxSeverity = 'high';
        continue;
      }

      const encryption = rule.ApplyServerSideEncryptionByDefault;
      
      // 암호화 타입 분석
      if (encryption.SSEAlgorithm === 'AES256') {
        encryptionType = 'AES256';
        encryptionScore = 70; // 기본 암호화
        issues.push('AES-256 암호화 사용 중 (KMS 업그레이드 권장)');
        recommendations.push('보안 강화를 위해 AWS KMS 키 사용 고려');
      } else if (encryption.SSEAlgorithm === 'aws:kms') {
        encryptionType = 'KMS';
        encryptionScore = 90; // KMS 암호화
        
        if (!encryption.KMSMasterKeyID) {
          issues.push('AWS 관리형 기본 KMS 키 사용');
          recommendations.push('고객 관리형 KMS 키 사용 고려');
          encryptionScore = 80;
        } else {
          hasCustomKMS = true;
          encryptionScore = 95;
        }
      }

      // Bucket Key 확인
      if (rule.BucketKeyEnabled) {
        hasBucketKey = true;
        encryptionScore += 5;
      } else if (encryptionType === 'KMS') {
        issues.push('S3 Bucket Key 미사용 (비용 최적화 기회)');
        recommendations.push('KMS 비용 절감을 위해 S3 Bucket Key 활성화');
      }
    }

    // 전체 상태 결정
    let status = '';
    let overallRecommendation = '';

    if (encryptionScore >= 95) {
      status = '최적의 암호화 설정';
      maxSeverity = 'pass';
      overallRecommendation = '현재 암호화 설정이 최적입니다. 정기적인 키 회전을 확인하세요.';
    } else if (encryptionScore >= 80) {
      status = '양호한 암호화 설정';
      maxSeverity = 'pass';
      overallRecommendation = '암호화가 잘 설정되어 있습니다. 추가 보안 강화를 고려하세요.';
    } else if (encryptionScore >= 60) {
      status = '기본 암호화 설정';
      maxSeverity = 'low';
      overallRecommendation = '기본 암호화가 설정되어 있지만 보안 강화가 필요합니다.';
    } else {
      status = '암호화 설정 부족';
      maxSeverity = 'high';
      overallRecommendation = '즉시 적절한 암호화를 설정하세요.';
    }

    // 통합된 결과 생성
    results.findings.push({
      id: `s3-encryption-comprehensive-${bucketName}`,
      title: `버킷 암호화 상태 - ${status}`,
      description: issues.length > 0 ? 
        `S3 버킷 '${bucketName}' 암호화 분석: ${issues.join(', ')}` :
        `S3 버킷 '${bucketName}'의 암호화 설정이 우수합니다.`,
      severity: maxSeverity,
      riskLevel: maxSeverity === 'pass' ? 'PASS' : maxSeverity.toUpperCase(),
      resource: bucketName,
      recommendation: overallRecommendation,
      details: {
        encryptionType: encryptionType,
        encryptionScore: encryptionScore,
        hasCustomKMS: hasCustomKMS,
        hasBucketKey: hasBucketKey,
        issues: issues,
        recommendations: recommendations,
        securityLevel: encryptionScore >= 90 ? '높음' : encryptionScore >= 70 ? '중간' : '낮음',
        costOptimization: hasBucketKey ? '최적화됨' : '개선 가능',
        actionItems: [
          encryptionType === 'AES256' ? 'KMS 암호화로 업그레이드' : null,
          !hasCustomKMS && encryptionType === 'KMS' ? '고객 관리형 KMS 키 사용' : null,
          !hasBucketKey && encryptionType === 'KMS' ? 'S3 Bucket Key 활성화' : null
        ].filter(Boolean)
      }
    });
  }
}

module.exports = BucketEncryptionChecker;