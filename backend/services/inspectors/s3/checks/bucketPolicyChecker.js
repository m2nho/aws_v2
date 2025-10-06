const { GetBucketPolicyCommand } = require('@aws-sdk/client-s3');

class BucketPolicyChecker {
  async check(s3Client, buckets) {
    const results = { findings: [] };

    if (buckets.length === 0) {
      results.findings.push({
        id: 's3-no-buckets-policy-check',
        title: '검사할 S3 버킷 없음',
        description: '현재 계정에 S3 버킷이 없어 버킷 정책 검사를 수행할 수 없습니다.',
        severity: 'info',
        resource: 'N/A',
        recommendation: 'S3 버킷이 생성된 후 다시 검사를 실행하세요.'
      });
      return results;
    }

    let hasSecurePolicies = 0;
    let hasNoPolicies = 0;
    let hasDangerousPolicies = 0;

    for (const bucket of buckets) {
      try {
        // 버킷별 S3 클라이언트 사용 (리전별 엔드포인트)
        const clientToUse = bucket.s3Client || s3Client;
        const policyResponse = await clientToUse.send(
          new GetBucketPolicyCommand({ Bucket: bucket.Name })
        );

        if (policyResponse.Policy) {
          const policy = JSON.parse(policyResponse.Policy);
          
          // 위험한 정책 패턴 검사
          const dangerousPatterns = this.checkDangerousPatterns(policy, bucket.Name);
          
          if (dangerousPatterns.length > 0) {
            results.findings.push(...dangerousPatterns);
            hasDangerousPolicies++;
          } else {
            // 안전한 정책
            hasSecurePolicies++;
            results.findings.push({
              id: `s3-secure-bucket-policy-${bucket.Name}`,
              title: '버킷 정책 보안 - 통과',
              description: `S3 버킷 '${bucket.Name}'의 정책이 안전하게 구성되어 있습니다.`,
              severity: 'pass',
              riskLevel: 'PASS',
              resource: bucket.Name,
              recommendation: '현재 정책이 적절히 설정되어 있습니다. 정기적으로 정책을 검토하여 보안을 유지하세요.'
            });
          }
        }
      } catch (error) {
        if (error.name === 'NoSuchBucketPolicy') {
          // 버킷 정책이 없는 경우
          hasNoPolicies++;
          results.findings.push({
            id: `s3-no-bucket-policy-${bucket.Name}`,
            title: '버킷 정책 미설정',
            description: `S3 버킷 '${bucket.Name}'에 버킷 정책이 설정되지 않았습니다.`,
            severity: 'low',
            resource: bucket.Name,
            recommendation: '필요에 따라 적절한 버킷 정책을 설정하여 액세스를 제어하세요. 최소 권한 원칙을 적용하고, 특정 IP나 VPC에서만 액세스를 허용하는 것을 고려하세요.'
          });
        } else {
          console.warn(`버킷 ${bucket.Name}의 정책을 확인할 수 없습니다:`, error.message);
        }
      }
    }

    // 전체 요약 결과는 제거 - 개별 버킷 결과만 표시

    return results;
  }

  checkDangerousPatterns(policy, bucketName) {
    const findings = [];

    if (!policy.Statement || !Array.isArray(policy.Statement)) {
      return findings;
    }

    for (const statement of policy.Statement) {
      // 전체 공개 액세스 검사
      if (this.isPublicAccess(statement)) {
        findings.push({
          id: `s3-public-policy-${bucketName}`,
          title: '버킷 정책 공개 액세스',
          description: `S3 버킷 '${bucketName}'의 정책이 전체 공개 액세스를 허용합니다.`,
          severity: 'high',
          resource: bucketName,
          recommendation: 'Principal을 "*"에서 특정 AWS 계정, 사용자 또는 역할로 제한하세요. 필요한 경우 조건문을 사용하여 IP 주소나 VPC를 제한하세요.'
        });
      }

      // 위험한 액션 검사
      const dangerousActions = this.checkDangerousActions(statement);
      if (dangerousActions.length > 0) {
        findings.push({
          id: `s3-dangerous-actions-${bucketName}`,
          title: '위험한 S3 액션 허용',
          description: `S3 버킷 '${bucketName}'의 정책이 위험한 액션을 허용합니다: ${dangerousActions.join(', ')}`,
          severity: 'high',
          resource: bucketName,
          recommendation: '불필요한 권한을 제거하고 최소 권한 원칙을 적용하세요. s3:DeleteBucket, s3:PutBucketPolicy 등의 관리 권한은 신중하게 부여하세요.'
        });
      }

      // 조건문 없는 광범위한 액세스 검사
      if (this.isBroadAccessWithoutConditions(statement)) {
        findings.push({
          id: `s3-broad-access-${bucketName}`,
          title: '조건 없는 광범위한 액세스',
          description: `S3 버킷 '${bucketName}'의 정책이 조건 없이 광범위한 액세스를 허용합니다.`,
          severity: 'medium',
          resource: bucketName,
          recommendation: 'IP 주소, VPC, 시간 등의 조건을 추가하여 액세스를 제한하세요. aws:SourceIp, aws:VpcSourceIp 등의 조건 키를 활용하세요.'
        });
      }
    }

    return findings;
  }

  isPublicAccess(statement) {
    if (statement.Effect !== 'Allow') return false;
    
    const principal = statement.Principal;
    if (typeof principal === 'string' && principal === '*') return true;
    if (principal && principal.AWS === '*') return true;
    
    return false;
  }

  checkDangerousActions(statement) {
    const dangerousActions = [
      's3:DeleteBucket',
      's3:PutBucketPolicy',
      's3:DeleteBucketPolicy',
      's3:PutBucketAcl',
      's3:PutObjectAcl',
      's3:PutBucketPublicAccessBlock'
    ];

    const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
    return actions.filter(action => 
      dangerousActions.some(dangerous => 
        action === dangerous || action === 's3:*' || action === '*'
      )
    );
  }

  isBroadAccessWithoutConditions(statement) {
    if (statement.Effect !== 'Allow') return false;
    if (statement.Condition) return false;

    const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
    const hasBroadActions = actions.some(action => 
      action === 's3:*' || action === '*' || action.includes('s3:Get*') || action.includes('s3:Put*')
    );

    return hasBroadActions;
  }
}

module.exports = BucketPolicyChecker;