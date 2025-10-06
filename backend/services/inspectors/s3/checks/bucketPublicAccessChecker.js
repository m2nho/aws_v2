const { GetPublicAccessBlockCommand, GetBucketAclCommand } = require('@aws-sdk/client-s3');

class BucketPublicAccessChecker {
  async check(s3Client, buckets) {
    const results = { findings: [] };

    if (buckets.length === 0) {
      results.findings.push({
        id: 's3-no-buckets-public-access-check',
        title: '퍼블릭 액세스 차단 검사 - 통과 (버킷 없음)',
        description: '현재 계정에 S3 버킷이 없어 퍼블릭 액세스 관련 보안 위험이 없습니다.',
        severity: 'pass',
        riskLevel: 'PASS',
        resource: 'N/A',
        recommendation: 'S3 버킷 생성 시 퍼블릭 액세스 차단을 기본으로 활성화하세요.'
      });
      return results;
    }

    let securelyBlockedCount = 0;
    let partiallyBlockedCount = 0;
    let unprotectedCount = 0;

    for (const bucket of buckets) {
      const initialFindingsCount = results.findings.length;
      
      await this.checkPublicAccessBlock(s3Client, bucket, results);
      await this.checkBucketAcl(s3Client, bucket, results);
      
      // 이 버킷에 대한 결과 분석
      const bucketFindings = results.findings.slice(initialFindingsCount);
      const hasPassFindings = bucketFindings.some(f => f.severity === 'pass');
      const hasHighSeverityFindings = bucketFindings.some(f => f.severity === 'high');
      
      if (hasPassFindings && !hasHighSeverityFindings) {
        securelyBlockedCount++;
      } else if (hasHighSeverityFindings) {
        unprotectedCount++;
      } else {
        partiallyBlockedCount++;
      }
    }

    // 전체 요약 결과는 제거 - 개별 버킷 결과만 표시

    return results;
  }

  async checkPublicAccessBlock(s3Client, bucket, results) {
    try {
      // 버킷별 S3 클라이언트 사용 (리전별 엔드포인트)
      const clientToUse = bucket.s3Client || s3Client;
      const publicAccessResponse = await clientToUse.send(
        new GetPublicAccessBlockCommand({ Bucket: bucket.Name })
      );

      const config = publicAccessResponse.PublicAccessBlockConfiguration;
      
      if (!config) {
        results.findings.push({
          id: `s3-no-public-access-block-${bucket.Name}`,
          title: '퍼블릭 액세스 차단 미설정',
          description: `S3 버킷 '${bucket.Name}'에 퍼블릭 액세스 차단 설정이 없습니다.`,
          severity: 'high',
          resource: bucket.Name,
          recommendation: '보안을 위해 퍼블릭 액세스 차단을 활성화하세요. 모든 설정(BlockPublicAcls, IgnorePublicAcls, BlockPublicPolicy, RestrictPublicBuckets)을 true로 설정하는 것을 권장합니다.'
        });
        return;
      }

      // 각 설정 검사
      const checks = [
        { key: 'BlockPublicAcls', name: '퍼블릭 ACL 차단' },
        { key: 'IgnorePublicAcls', name: '퍼블릭 ACL 무시' },
        { key: 'BlockPublicPolicy', name: '퍼블릭 정책 차단' },
        { key: 'RestrictPublicBuckets', name: '퍼블릭 버킷 제한' }
      ];

      const disabledSettings = checks.filter(check => !config[check.key]);
      
      if (disabledSettings.length > 0) {
        const disabledNames = disabledSettings.map(s => s.name).join(', ');
        results.findings.push({
          id: `s3-partial-public-access-block-${bucket.Name}`,
          title: '부분적 퍼블릭 액세스 차단',
          description: `S3 버킷 '${bucket.Name}'에서 일부 퍼블릭 액세스 차단 설정이 비활성화되어 있습니다: ${disabledNames}`,
          severity: 'high',
          resource: bucket.Name,
          recommendation: '완전한 보안을 위해 모든 퍼블릭 액세스 차단 설정을 활성화하세요. 퍼블릭 액세스가 필요한 경우에만 선택적으로 비활성화하고, CloudFront와 같은 CDN을 통한 액세스를 고려하세요.'
        });
      } else {
        results.findings.push({
          id: `s3-public-access-blocked-${bucket.Name}`,
          title: '퍼블릭 액세스 차단 검사 - 통과',
          description: `S3 버킷 '${bucket.Name}'의 모든 퍼블릭 액세스가 안전하게 차단되어 있습니다.`,
          severity: 'pass',
          riskLevel: 'PASS',
          resource: bucket.Name,
          recommendation: '퍼블릭 액세스 차단이 올바르게 설정되어 있습니다. 정기적으로 설정을 검토하여 의도하지 않은 변경이 없는지 확인하세요.'
        });
      }

    } catch (error) {
      if (error.name === 'NoSuchPublicAccessBlockConfiguration') {
        results.findings.push({
          id: `s3-no-public-access-block-config-${bucket.Name}`,
          title: '퍼블릭 액세스 차단 설정 없음',
          description: `S3 버킷 '${bucket.Name}'에 퍼블릭 액세스 차단 설정이 없습니다.`,
          severity: 'high',
          resource: bucket.Name,
          recommendation: '보안을 위해 퍼블릭 액세스 차단을 설정하세요.'
        });
      } else {
        console.warn(`버킷 ${bucket.Name}의 퍼블릭 액세스 차단 설정을 확인할 수 없습니다:`, error.message);
      }
    }
  }

  async checkBucketAcl(s3Client, bucket, results) {
    try {
      // 버킷별 S3 클라이언트 사용 (리전별 엔드포인트)
      const clientToUse = bucket.s3Client || s3Client;
      const aclResponse = await clientToUse.send(
        new GetBucketAclCommand({ Bucket: bucket.Name })
      );

      if (aclResponse.Grants) {
        const publicGrants = aclResponse.Grants.filter(grant => 
          this.isPublicGrant(grant)
        );

        if (publicGrants.length > 0) {
          const permissions = publicGrants.map(grant => grant.Permission).join(', ');
          results.findings.push({
            id: `s3-public-acl-${bucket.Name}`,
            title: '퍼블릭 ACL 권한',
            description: `S3 버킷 '${bucket.Name}'에 퍼블릭 ACL 권한이 설정되어 있습니다: ${permissions}`,
            severity: 'high',
            resource: bucket.Name,
            recommendation: '퍼블릭 ACL 권한을 제거하세요. 퍼블릭 액세스가 필요한 경우 버킷 정책을 사용하거나 CloudFront를 통한 배포를 고려하세요. ACL보다는 버킷 정책을 사용하는 것이 더 세밀한 제어가 가능합니다.'
          });
        }

        // 인증된 사용자 그룹 권한 검사
        const authenticatedGrants = aclResponse.Grants.filter(grant =>
          grant.Grantee && grant.Grantee.URI === 'http://acs.amazonaws.com/groups/global/AuthenticatedUsers'
        );

        if (authenticatedGrants.length > 0) {
          const permissions = authenticatedGrants.map(grant => grant.Permission).join(', ');
          results.findings.push({
            id: `s3-authenticated-users-acl-${bucket.Name}`,
            title: '인증된 사용자 그룹 권한',
            description: `S3 버킷 '${bucket.Name}'에 모든 인증된 AWS 사용자에게 권한이 부여되어 있습니다: ${permissions}`,
            severity: 'medium',
            resource: bucket.Name,
            recommendation: '인증된 사용자 그룹 권한을 제거하고 특정 AWS 계정이나 사용자에게만 권한을 부여하세요. 최소 권한 원칙을 적용하여 필요한 권한만 부여하세요.'
          });
        }
      }

    } catch (error) {
      console.warn(`버킷 ${bucket.Name}의 ACL을 확인할 수 없습니다:`, error.message);
    }
  }

  isPublicGrant(grant) {
    if (!grant.Grantee) return false;
    
    // 모든 사용자 그룹
    if (grant.Grantee.URI === 'http://acs.amazonaws.com/groups/global/AllUsers') {
      return true;
    }
    
    return false;
  }
}

module.exports = BucketPublicAccessChecker;