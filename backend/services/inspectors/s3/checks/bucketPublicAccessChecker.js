/**
 * Bucket Public Access Checker
 * S3 버킷 퍼블릭 액세스 설정을 통합 검사하는 모듈
 */

const InspectionFinding = require('../../../../models/InspectionFinding');

class BucketPublicAccessChecker {
  constructor(inspector) {
    this.inspector = inspector;
  }

  /**
   * 모든 버킷 퍼블릭 액세스 검사 실행
   */
  async runAllChecks(buckets) {
    if (!buckets || buckets.length === 0) {
      const finding = new InspectionFinding({
        resourceId: 'no-s3-buckets',
        resourceType: 'S3Bucket',
        riskLevel: 'PASS',
        issue: '퍼블릭 액세스 차단 검사 - 통과 (버킷 없음)',
        recommendation: 'S3 버킷 생성 시 퍼블릭 액세스 차단을 기본으로 활성화하세요',
        details: {
          totalBuckets: 0,
          status: '현재 S3 버킷 퍼블릭 액세스 관련 보안 위험이 없습니다',
          bestPractices: [
            '새 버킷 생성 시 퍼블릭 액세스 차단 기본 활성화',
            '모든 퍼블릭 액세스 차단 설정 활성화',
            'CloudFront를 통한 안전한 콘텐츠 배포',
            '정기적인 퍼블릭 액세스 설정 검토'
          ]
        },
        category: 'COMPLIANCE'
      });
      
      this.inspector.addFinding(finding);
      return;
    }

    for (const bucket of buckets) {
      try {
        // 통합된 퍼블릭 액세스 검사
        this.checkBucketPublicAccessComprehensive(bucket);

      } catch (error) {
        this.inspector.recordError(error, {
          operation: 'runAllChecks',
          bucketName: bucket.Name
        });
      }
    }
  }

  /**
   * 버킷별 통합 퍼블릭 액세스 검사
   */
  checkBucketPublicAccessComprehensive(bucket) {
    const publicAccessBlock = bucket.PublicAccessBlock;
    const acl = bucket.Acl;
    const policy = bucket.Policy;
    
    const issues = [];
    const securityRisks = [];
    let securityScore = 0;
    let maxRiskLevel = 'PASS';

    // 1. 퍼블릭 액세스 차단 설정 검사
    if (!publicAccessBlock) {
      issues.push('퍼블릭 액세스 차단 설정 없음');
      securityRisks.push('모든 퍼블릭 액세스 방법이 열려있음');
      maxRiskLevel = 'CRITICAL';
    } else {
      const checks = [
        { key: 'BlockPublicAcls', name: '퍼블릭 ACL 차단', weight: 25 },
        { key: 'IgnorePublicAcls', name: '퍼블릭 ACL 무시', weight: 25 },
        { key: 'BlockPublicPolicy', name: '퍼블릭 정책 차단', weight: 25 },
        { key: 'RestrictPublicBuckets', name: '퍼블릭 버킷 제한', weight: 25 }
      ];

      const disabledSettings = checks.filter(check => !publicAccessBlock[check.key]);
      
      if (disabledSettings.length === 0) {
        securityScore = 100;
      } else {
        const enabledWeight = checks
          .filter(check => publicAccessBlock[check.key])
          .reduce((sum, check) => sum + check.weight, 0);
        securityScore = enabledWeight;
        
        const disabledNames = disabledSettings.map(s => s.name);
        issues.push(`일부 퍼블릭 액세스 차단 비활성화: ${disabledNames.join(', ')}`);
        
        if (disabledSettings.length >= 3) {
          maxRiskLevel = 'CRITICAL';
          securityRisks.push('대부분의 퍼블릭 액세스 보호 기능 비활성화');
        } else if (disabledSettings.length >= 2) {
          maxRiskLevel = 'HIGH';
          securityRisks.push('주요 퍼블릭 액세스 보호 기능 부족');
        } else {
          maxRiskLevel = 'MEDIUM';
          securityRisks.push('부분적 퍼블릭 액세스 보호');
        }
      }
    }

    // 2. ACL 검사
    if (acl && acl.Grants) {
      const publicGrants = acl.Grants.filter(grant => this.isPublicGrant(grant));
      const authenticatedGrants = acl.Grants.filter(grant => this.isAuthenticatedUsersGrant(grant));
      
      if (publicGrants.length > 0) {
        const permissions = publicGrants.map(grant => grant.Permission).join(', ');
        issues.push(`퍼블릭 ACL 권한: ${permissions}`);
        securityRisks.push('ACL을 통한 퍼블릭 액세스 허용');
        maxRiskLevel = 'CRITICAL';
        securityScore = Math.min(securityScore, 20);
      }
      
      if (authenticatedGrants.length > 0) {
        const permissions = authenticatedGrants.map(grant => grant.Permission).join(', ');
        issues.push(`인증된 사용자 그룹 권한: ${permissions}`);
        securityRisks.push('모든 AWS 사용자에게 액세스 허용');
        if (maxRiskLevel === 'PASS') maxRiskLevel = 'MEDIUM';
        securityScore = Math.min(securityScore, 60);
      }
    }

    // 3. 버킷 정책 검사 (간단한 퍼블릭 액세스 확인)
    if (policy && this.hasPolicyPublicAccess(policy)) {
      issues.push('버킷 정책을 통한 퍼블릭 액세스');
      securityRisks.push('정책을 통한 퍼블릭 액세스 허용');
      maxRiskLevel = 'CRITICAL';
      securityScore = Math.min(securityScore, 10);
    }

    // 전체 상태 결정
    let status = '';
    let recommendation = '';

    if (securityScore >= 90 && issues.length === 0) {
      status = '완전한 퍼블릭 액세스 차단';
      recommendation = '퍼블릭 액세스가 안전하게 차단되어 있습니다. 정기적으로 설정을 검토하세요.';
      maxRiskLevel = 'PASS';
    } else if (securityScore >= 70) {
      status = '부분적 퍼블릭 액세스 차단';
      recommendation = '일부 퍼블릭 액세스 보호 기능을 활성화하여 보안을 강화하세요.';
    } else if (securityScore >= 40) {
      status = '취약한 퍼블릭 액세스 설정';
      recommendation = '즉시 퍼블릭 액세스 차단 설정을 강화하세요.';
    } else {
      status = '심각한 퍼블릭 노출 위험';
      recommendation = '모든 퍼블릭 액세스를 즉시 차단하고 CloudFront 사용을 고려하세요.';
    }

    // 통합된 결과 생성
    const finding = new InspectionFinding({
      resourceId: bucket.Name,
      resourceType: 'S3Bucket',
      riskLevel: maxRiskLevel,
      issue: issues.length > 0 ? 
        `퍼블릭 액세스 상태 - ${status}: ${issues.join(', ')}` : 
        `퍼블릭 액세스 상태 - ${status}`,
      recommendation: recommendation,
      details: {
        bucketName: bucket.Name,
        region: bucket.Region,
        securityScore: securityScore,
        status: status,
        issues: issues,
        securityRisks: securityRisks,
        publicAccessBlockSettings: publicAccessBlock ? {
          blockPublicAcls: publicAccessBlock.BlockPublicAcls || false,
          ignorePublicAcls: publicAccessBlock.IgnorePublicAcls || false,
          blockPublicPolicy: publicAccessBlock.BlockPublicPolicy || false,
          restrictPublicBuckets: publicAccessBlock.RestrictPublicBuckets || false
        } : null,
        aclAnalysis: acl ? {
          totalGrants: acl.Grants?.length || 0,
          publicGrants: acl.Grants?.filter(grant => this.isPublicGrant(grant)).length || 0,
          authenticatedGrants: acl.Grants?.filter(grant => this.isAuthenticatedUsersGrant(grant)).length || 0
        } : null,
        actionItems: [
          !publicAccessBlock ? '퍼블릭 액세스 차단 설정 활성화' : null,
          publicAccessBlock && !publicAccessBlock.BlockPublicAcls ? 'BlockPublicAcls 활성화' : null,
          publicAccessBlock && !publicAccessBlock.IgnorePublicAcls ? 'IgnorePublicAcls 활성화' : null,
          publicAccessBlock && !publicAccessBlock.BlockPublicPolicy ? 'BlockPublicPolicy 활성화' : null,
          publicAccessBlock && !publicAccessBlock.RestrictPublicBuckets ? 'RestrictPublicBuckets 활성화' : null,
          acl && acl.Grants?.some(grant => this.isPublicGrant(grant)) ? '퍼블릭 ACL 권한 제거' : null
        ].filter(Boolean),
        alternatives: maxRiskLevel !== 'PASS' ? [
          'CloudFront를 통한 안전한 콘텐츠 배포',
          'Pre-signed URL을 통한 임시 액세스',
          'API Gateway를 통한 제어된 액세스',
          'VPC 엔드포인트를 통한 프라이빗 액세스'
        ] : []
      },
      category: 'SECURITY'
    });

    this.inspector.addFinding(finding);
  }

  /**
   * 기존 check 메서드 (하위 호환성)
   */
  async check(s3Client, buckets) {
    const results = { findings: [] };

    // 버킷 데이터가 이미 수집된 경우 직접 사용
    if (buckets && buckets.length > 0 && buckets[0].PublicAccessBlock !== undefined) {
      await this.runAllChecks(buckets);
    } else {
      // 기존 방식으로 데이터 수집 후 검사 (간소화된 버전)
      for (const bucket of buckets) {
        await this.checkPublicAccessBlock(s3Client, bucket, results);
        await this.checkBucketAcl(s3Client, bucket, results);
      }
    }

    // 결과를 기존 형식으로 변환
    this.inspector.findings.forEach(finding => {
      results.findings.push({
        id: finding.resourceId,
        title: finding.issue,
        description: finding.issue,
        severity: finding.riskLevel.toLowerCase(),
        resource: finding.resourceId,
        recommendation: finding.recommendation
      });
    });

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