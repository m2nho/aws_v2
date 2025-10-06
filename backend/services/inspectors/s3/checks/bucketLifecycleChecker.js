const { GetBucketLifecycleConfigurationCommand } = require('@aws-sdk/client-s3');

class BucketLifecycleChecker {
  async check(s3Client, buckets) {
    const results = { findings: [] };

    for (const bucket of buckets) {
      try {
        // 버킷별 S3 클라이언트 사용 (리전별 엔드포인트)
        const clientToUse = bucket.s3Client || s3Client;
        const lifecycleResponse = await clientToUse.send(
          new GetBucketLifecycleConfigurationCommand({ Bucket: bucket.Name })
        );

        if (lifecycleResponse.Rules && lifecycleResponse.Rules.length > 0) {
          this.analyzeLifecycleRules(lifecycleResponse.Rules, bucket.Name, results);
        } else {
          results.findings.push({
            id: `s3-no-lifecycle-rules-${bucket.Name}`,
            title: '라이프사이클 정책 없음',
            description: `S3 버킷 '${bucket.Name}'에 라이프사이클 정책이 설정되지 않았습니다.`,
            severity: 'medium',
            resource: bucket.Name,
            recommendation: '스토리지 비용 최적화를 위해 라이프사이클 정책을 설정하세요. 오래된 객체를 IA, Glacier, Deep Archive로 이동시키거나 삭제하는 규칙을 만들어 비용을 절감할 수 있습니다.'
          });
        }

      } catch (error) {
        if (error.name === 'NoSuchLifecycleConfiguration') {
          results.findings.push({
            id: `s3-no-lifecycle-config-${bucket.Name}`,
            title: '라이프사이클 설정 없음',
            description: `S3 버킷 '${bucket.Name}'에 라이프사이클 설정이 없습니다.`,
            severity: 'medium',
            resource: bucket.Name,
            recommendation: '비용 최적화를 위해 라이프사이클 정책을 설정하세요. 30일 후 IA로, 90일 후 Glacier로, 365일 후 Deep Archive로 이동하는 정책을 고려하세요.'
          });
        } else {
          console.warn(`버킷 ${bucket.Name}의 라이프사이클 설정을 확인할 수 없습니다:`, error.message);
        }
      }
    }

    return results;
  }

  analyzeLifecycleRules(rules, bucketName, results) {
    let hasTransitionRules = false;
    let hasExpirationRules = false;
    let hasIncompleteMultipartRule = false;
    let hasNoncurrentVersionRule = false;

    for (const rule of rules) {
      if (rule.Status !== 'Enabled') {
        results.findings.push({
          id: `s3-disabled-lifecycle-rule-${bucketName}-${rule.ID || 'unnamed'}`,
          title: '비활성화된 라이프사이클 규칙',
          description: `S3 버킷 '${bucketName}'에 비활성화된 라이프사이클 규칙이 있습니다: ${rule.ID || '이름 없음'}`,
          severity: 'low',
          resource: bucketName,
          recommendation: '불필요한 규칙은 삭제하고, 필요한 규칙은 활성화하세요.'
        });
        continue;
      }

      // 전환 규칙 검사
      if (rule.Transitions && rule.Transitions.length > 0) {
        hasTransitionRules = true;
        this.analyzeTransitions(rule.Transitions, bucketName, rule.ID, results);
      }

      // 만료 규칙 검사
      if (rule.Expiration) {
        hasExpirationRules = true;
      }

      // 불완전한 멀티파트 업로드 정리 규칙 검사
      if (rule.AbortIncompleteMultipartUpload) {
        hasIncompleteMultipartRule = true;
      }

      // 비현재 버전 관리 규칙 검사
      if (rule.NoncurrentVersionTransitions || rule.NoncurrentVersionExpiration) {
        hasNoncurrentVersionRule = true;
      }
    }

    // 권장사항 생성
    if (!hasTransitionRules) {
      results.findings.push({
        id: `s3-no-transition-rules-${bucketName}`,
        title: '스토리지 클래스 전환 규칙 없음',
        description: `S3 버킷 '${bucketName}'에 스토리지 클래스 전환 규칙이 없습니다.`,
        severity: 'medium',
        resource: bucketName,
        recommendation: '비용 절감을 위해 오래된 객체를 저렴한 스토리지 클래스로 이동시키는 규칙을 추가하세요. 예: 30일 후 Standard-IA, 90일 후 Glacier, 365일 후 Deep Archive'
      });
    }

    if (!hasIncompleteMultipartRule) {
      results.findings.push({
        id: `s3-no-multipart-cleanup-${bucketName}`,
        title: '불완전한 멀티파트 업로드 정리 규칙 없음',
        description: `S3 버킷 '${bucketName}'에 불완전한 멀티파트 업로드 정리 규칙이 없습니다.`,
        severity: 'medium',
        resource: bucketName,
        recommendation: '불완전한 멀티파트 업로드로 인한 불필요한 비용을 방지하기 위해 7일 후 자동 삭제 규칙을 추가하세요.'
      });
    }

    if (!hasNoncurrentVersionRule) {
      results.findings.push({
        id: `s3-no-noncurrent-version-rule-${bucketName}`,
        title: '이전 버전 관리 규칙 없음',
        description: `S3 버킷 '${bucketName}'에 이전 버전 객체 관리 규칙이 없습니다.`,
        severity: 'low',
        resource: bucketName,
        recommendation: '버전 관리가 활성화된 경우, 이전 버전 객체의 비용 관리를 위해 자동 삭제 또는 저렴한 스토리지 클래스로 이동하는 규칙을 추가하세요.'
      });
    }

    results.findings.push({
      id: `s3-lifecycle-configured-${bucketName}`,
      title: '라이프사이클 정책 설정됨',
      description: `S3 버킷 '${bucketName}'에 라이프사이클 정책이 설정되어 있습니다.`,
      severity: 'info',
      resource: bucketName,
      recommendation: '라이프사이클 정책이 설정되어 있습니다. 정기적으로 규칙을 검토하여 비즈니스 요구사항에 맞게 최적화하세요.'
    });
  }

  analyzeTransitions(transitions, bucketName, ruleId, results) {
    const storageClasses = transitions.map(t => t.StorageClass).join(', ');
    const minDays = Math.min(...transitions.map(t => t.Days || 0));

    if (minDays < 30) {
      results.findings.push({
        id: `s3-early-transition-${bucketName}-${ruleId}`,
        title: '너무 빠른 스토리지 클래스 전환',
        description: `S3 버킷 '${bucketName}'의 라이프사이클 규칙이 ${minDays}일 후 전환을 설정했습니다.`,
        severity: 'low',
        resource: bucketName,
        recommendation: 'Standard-IA로의 전환은 최소 30일 후에 설정하는 것이 비용 효율적입니다. 30일 이전에 자주 액세스되는 객체는 추가 비용이 발생할 수 있습니다.'
      });
    }
  }
}

module.exports = BucketLifecycleChecker;