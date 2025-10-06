const { GetBucketLoggingCommand } = require('@aws-sdk/client-s3');

class BucketLoggingChecker {
  async check(s3Client, buckets) {
    const results = { findings: [] };

    if (buckets.length === 0) {
      results.findings.push({
        id: 's3-no-buckets-logging-check',
        title: '검사할 S3 버킷 없음',
        description: '현재 계정에 S3 버킷이 없어 로깅 검사를 수행할 수 없습니다.',
        severity: 'info',
        resource: 'N/A',
        recommendation: 'S3 버킷이 생성된 후 다시 검사를 실행하세요.'
      });
      return results;
    }

    let loggingEnabledCount = 0;
    let loggingDisabledCount = 0;
    let selfLoggingCount = 0;

    for (const bucket of buckets) {
      try {
        // 버킷별 S3 클라이언트 사용 (리전별 엔드포인트)
        const clientToUse = bucket.s3Client || s3Client;
        const loggingResponse = await clientToUse.send(
          new GetBucketLoggingCommand({ Bucket: bucket.Name })
        );

        if (!loggingResponse.LoggingEnabled) {
          loggingDisabledCount++;
          results.findings.push({
            id: `s3-logging-disabled-${bucket.Name}`,
            title: 'S3 액세스 로깅 비활성화',
            description: `S3 버킷 '${bucket.Name}'의 액세스 로깅이 비활성화되어 있습니다.`,
            severity: 'medium',
            resource: bucket.Name,
            recommendation: '보안 모니터링과 감사를 위해 S3 액세스 로깅을 활성화하세요. 로그는 별도의 전용 로깅 버킷에 저장하고, 로그 파일에 대한 적절한 액세스 제어를 설정하세요. CloudTrail과 함께 사용하면 더 포괄적인 감사 추적이 가능합니다.'
          });
        } else {
          const targetBucket = loggingResponse.LoggingEnabled.TargetBucket;
          const targetPrefix = loggingResponse.LoggingEnabled.TargetPrefix || '';

          // 로깅 설정 분석
          if (targetBucket === bucket.Name) {
            selfLoggingCount++;
            results.findings.push({
              id: `s3-self-logging-${bucket.Name}`,
              title: '자기 자신에게 로깅',
              description: `S3 버킷 '${bucket.Name}'이 자기 자신에게 액세스 로그를 저장하고 있습니다.`,
              severity: 'high',
              resource: bucket.Name,
              recommendation: '로그 루프를 방지하기 위해 별도의 전용 로깅 버킷을 생성하여 사용하세요. 로깅 버킷은 소스 버킷과 다른 버킷이어야 하며, 적절한 라이프사이클 정책을 설정하여 로그 비용을 관리하세요.'
            });
          } else {
            loggingEnabledCount++;
            results.findings.push({
              id: `s3-logging-enabled-${bucket.Name}`,
              title: 'S3 액세스 로깅 활성화됨',
              description: `S3 버킷 '${bucket.Name}'의 액세스 로깅이 활성화되어 있습니다. 로그는 '${targetBucket}' 버킷에 저장됩니다.`,
              severity: 'info',
              resource: bucket.Name,
              recommendation: `로깅이 올바르게 설정되어 있습니다. 로그 분석을 위해 Amazon Athena나 CloudWatch Logs Insights를 활용하고, 로그 버킷에 라이프사이클 정책을 설정하여 비용을 관리하세요.${targetPrefix ? ` 현재 프리픽스: ${targetPrefix}` : ''}`
            });
          }

          // 로그 프리픽스 권장사항
          if (!targetPrefix) {
            results.findings.push({
              id: `s3-no-log-prefix-${bucket.Name}`,
              title: '로그 프리픽스 미설정',
              description: `S3 버킷 '${bucket.Name}'의 액세스 로그에 프리픽스가 설정되지 않았습니다.`,
              severity: 'low',
              resource: bucket.Name,
              recommendation: '로그 파일 관리를 위해 의미 있는 프리픽스를 설정하세요. 예: "access-logs/bucket-name/" 형태로 설정하면 로그 파일을 쉽게 식별하고 관리할 수 있습니다.'
            });
          }
        }

      } catch (error) {
        console.warn(`버킷 ${bucket.Name}의 로깅 설정을 확인할 수 없습니다:`, error.message);
        results.findings.push({
          id: `s3-logging-check-error-${bucket.Name}`,
          title: '로깅 설정 확인 실패',
          description: `S3 버킷 '${bucket.Name}'의 로깅 설정을 확인할 수 없습니다.`,
          severity: 'low',
          resource: bucket.Name,
          recommendation: 'AWS 권한을 확인하고 s3:GetBucketLogging 권한이 있는지 확인하세요.'
        });
      }
    }

    // 전체 요약 결과 추가
    // 전체 요약 결과는 제거 - 개별 버킷 결과만 표시

    return results;
  }
}

module.exports = BucketLoggingChecker;