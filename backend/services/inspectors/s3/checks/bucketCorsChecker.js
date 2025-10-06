const { GetBucketCorsCommand } = require('@aws-sdk/client-s3');

class BucketCorsChecker {
  async check(s3Client, buckets) {
    const results = { findings: [] };

    if (buckets.length === 0) {
      results.findings.push({
        id: 's3-no-buckets-cors-check',
        title: '검사할 S3 버킷 없음',
        description: '현재 계정에 S3 버킷이 없어 CORS 검사를 수행할 수 없습니다.',
        severity: 'info',
        resource: 'N/A',
        recommendation: 'S3 버킷이 생성된 후 다시 검사를 실행하세요.'
      });
      return results;
    }

    let corsConfiguredCount = 0;
    let noCorsCount = 0;
    let dangerousCorsCount = 0;

    for (const bucket of buckets) {
      try {
        // 버킷별 S3 클라이언트 사용 (리전별 엔드포인트)
        const clientToUse = bucket.s3Client || s3Client;
        const corsResponse = await clientToUse.send(
          new GetBucketCorsCommand({ Bucket: bucket.Name })
        );

        if (corsResponse.CORSRules && corsResponse.CORSRules.length > 0) {
          corsConfiguredCount++;
          const beforeCount = results.findings.length;
          this.analyzeCorsRules(corsResponse.CORSRules, bucket.Name, results);
          const afterCount = results.findings.length;
          
          // 위험한 CORS 설정이 발견되었는지 확인
          if (afterCount > beforeCount) {
            const newFindings = results.findings.slice(beforeCount);
            const hasDangerousFindings = newFindings.some(f => f.severity === 'high');
            if (hasDangerousFindings) {
              dangerousCorsCount++;
            }
          }
        }

      } catch (error) {
        if (error.name === 'NoSuchCORSConfiguration') {
          // CORS 설정이 없는 경우는 일반적이므로 정보성 메시지만 추가
          noCorsCount++;
          results.findings.push({
            id: `s3-no-cors-config-${bucket.Name}`,
            title: 'CORS 설정 없음',
            description: `S3 버킷 '${bucket.Name}'에 CORS 설정이 없습니다.`,
            severity: 'info',
            resource: bucket.Name,
            recommendation: '웹 애플리케이션에서 이 버킷에 직접 액세스해야 하는 경우에만 CORS를 설정하세요. 불필요한 CORS 설정은 보안 위험을 증가시킬 수 있습니다.'
          });
        } else {
          console.warn(`버킷 ${bucket.Name}의 CORS 설정을 확인할 수 없습니다:`, error.message);
        }
      }
    }

    // 전체 요약 결과 추가
    results.findings.push({
      id: 's3-cors-summary',
      title: 'S3 CORS 검사 완료',
      description: `총 ${buckets.length}개 버킷 검사 완료 - CORS 설정: ${corsConfiguredCount}개, CORS 없음: ${noCorsCount}개, 위험한 CORS: ${dangerousCorsCount}개`,
      severity: 'info',
      resource: 'All Buckets',
      recommendation: dangerousCorsCount > 0
        ? '위험한 CORS 설정이 있는 버킷들을 즉시 검토하세요.'
        : 'CORS 설정이 안전하게 구성되어 있거나 필요에 따라 설정되지 않았습니다.'
    });

    return results;
  }

  analyzeCorsRules(corsRules, bucketName, results) {
    let hasWildcardOrigin = false;
    let hasWildcardMethod = false;
    let hasWildcardHeader = false;
    let hasDangerousMethods = false;

    for (const rule of corsRules) {
      // Origin 검사
      if (rule.AllowedOrigins) {
        const wildcardOrigins = rule.AllowedOrigins.filter(origin => origin === '*');
        if (wildcardOrigins.length > 0) {
          hasWildcardOrigin = true;
        }
      }

      // Method 검사
      if (rule.AllowedMethods) {
        const dangerousMethods = rule.AllowedMethods.filter(method => 
          ['PUT', 'DELETE', 'POST'].includes(method.toUpperCase())
        );
        if (dangerousMethods.length > 0) {
          hasDangerousMethods = true;
        }

        const wildcardMethods = rule.AllowedMethods.filter(method => method === '*');
        if (wildcardMethods.length > 0) {
          hasWildcardMethod = true;
        }
      }

      // Header 검사
      if (rule.AllowedHeaders) {
        const wildcardHeaders = rule.AllowedHeaders.filter(header => header === '*');
        if (wildcardHeaders.length > 0) {
          hasWildcardHeader = true;
        }
      }
    }

    // 보안 위험 평가
    if (hasWildcardOrigin) {
      const severity = (hasDangerousMethods || hasWildcardMethod) ? 'high' : 'medium';
      results.findings.push({
        id: `s3-cors-wildcard-origin-${bucketName}`,
        title: 'CORS 와일드카드 Origin 허용',
        description: `S3 버킷 '${bucketName}'의 CORS 설정이 모든 Origin(*)을 허용합니다.`,
        severity: severity,
        resource: bucketName,
        recommendation: '보안을 위해 특정 도메인만 허용하도록 Origin을 제한하세요. 예: ["https://example.com", "https://www.example.com"]. 와일드카드 사용은 CSRF 공격의 위험을 증가시킵니다.'
      });
    }

    if (hasWildcardMethod) {
      results.findings.push({
        id: `s3-cors-wildcard-method-${bucketName}`,
        title: 'CORS 와일드카드 Method 허용',
        description: `S3 버킷 '${bucketName}'의 CORS 설정이 모든 HTTP 메서드(*)를 허용합니다.`,
        severity: 'high',
        resource: bucketName,
        recommendation: '필요한 HTTP 메서드만 명시적으로 허용하세요. 일반적으로 GET, POST만 필요한 경우가 많습니다. PUT, DELETE는 신중하게 허용하세요.'
      });
    }

    if (hasDangerousMethods && hasWildcardOrigin) {
      results.findings.push({
        id: `s3-cors-dangerous-combination-${bucketName}`,
        title: '위험한 CORS 설정 조합',
        description: `S3 버킷 '${bucketName}'의 CORS 설정이 모든 Origin에서 위험한 HTTP 메서드(PUT, DELETE, POST)를 허용합니다.`,
        severity: 'high',
        resource: bucketName,
        recommendation: '즉시 CORS 설정을 검토하고 제한하세요. Origin을 특정 도메인으로 제한하고, 필요한 메서드만 허용하세요. 이 설정은 심각한 보안 위험을 초래할 수 있습니다.'
      });
    }

    if (hasWildcardHeader) {
      results.findings.push({
        id: `s3-cors-wildcard-header-${bucketName}`,
        title: 'CORS 와일드카드 Header 허용',
        description: `S3 버킷 '${bucketName}'의 CORS 설정이 모든 헤더(*)를 허용합니다.`,
        severity: 'medium',
        resource: bucketName,
        recommendation: '필요한 헤더만 명시적으로 허용하세요. 일반적으로 Content-Type, Authorization 등 특정 헤더만 필요합니다.'
      });
    }

    // MaxAge 검사
    const rulesWithoutMaxAge = corsRules.filter(rule => !rule.MaxAgeSeconds);
    if (rulesWithoutMaxAge.length > 0) {
      results.findings.push({
        id: `s3-cors-no-max-age-${bucketName}`,
        title: 'CORS MaxAge 미설정',
        description: `S3 버킷 '${bucketName}'의 일부 CORS 규칙에 MaxAge가 설정되지 않았습니다.`,
        severity: 'low',
        resource: bucketName,
        recommendation: 'MaxAge를 설정하여 브라우저가 preflight 요청을 캐시하도록 하세요. 일반적으로 3600초(1시간) 정도가 적절합니다.'
      });
    }

    results.findings.push({
      id: `s3-cors-configured-${bucketName}`,
      title: 'CORS 설정됨',
      description: `S3 버킷 '${bucketName}'에 CORS가 설정되어 있습니다.`,
      severity: 'info',
      resource: bucketName,
      recommendation: 'CORS 설정이 있습니다. 정기적으로 설정을 검토하여 불필요한 권한이 없는지 확인하고, 최소 권한 원칙을 적용하세요.'
    });
  }
}

module.exports = BucketCorsChecker;