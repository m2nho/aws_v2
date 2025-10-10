/**
 * Bucket Policy Checker
 * S3 버킷 정책을 통합 검사하는 모듈
 */

const InspectionFinding = require('../../../../models/InspectionFinding');

class BucketPolicyChecker {
  constructor(inspector) {
    this.inspector = inspector;
  }

  /**
   * 모든 버킷 정책 검사 실행
   */
  async runAllChecks(buckets) {
    if (!buckets || buckets.length === 0) {
      const finding = new InspectionFinding({
        resourceId: 'no-s3-buckets',
        resourceType: 'S3Bucket',
        riskLevel: 'PASS',
        issue: 'S3 버킷 정책 검사 - 통과 (버킷 없음)',
        recommendation: 'S3 버킷 생성 시 적절한 버킷 정책을 설정하여 액세스를 제어하세요',
        details: {
          totalBuckets: 0,
          status: '현재 S3 버킷 정책 관련 위험이 없습니다'
        },
        category: 'COMPLIANCE'
      });
      
      this.inspector.addFinding(finding);
      return;
    }

    for (const bucket of buckets) {
      try {
        this.checkBucketPolicyComprehensive(bucket);
      } catch (error) {
        this.inspector.recordError(error, {
          operation: 'runAllChecks',
          bucketName: bucket.Name
        });
      }
    }
  }

  /**
   * 버킷별 통합 정책 검사
   */
  checkBucketPolicyComprehensive(bucket) {
    const policy = bucket.Policy;
    
    if (!policy) {
      const finding = new InspectionFinding({
        resourceId: bucket.Name,
        resourceType: 'S3Bucket',
        riskLevel: 'LOW',
        issue: 'S3 버킷 정책 미설정',
        recommendation: '필요에 따라 적절한 버킷 정책을 설정하여 액세스를 제어하세요',
        details: {
          bucketName: bucket.Name,
          region: bucket.Region,
          policyStatus: 'NOT_SET',
          securityNote: '버킷 정책이 없어 기본 IAM 권한만 적용됨'
        },
        category: 'COMPLIANCE'
      });
      this.inspector.addFinding(finding);
      return;
    }

    // 정책 위험 패턴 검사
    const dangerousPatterns = this.analyzePolicyRisks(policy, bucket.Name);
    
    if (dangerousPatterns.length > 0) {
      const highestRisk = this.getHighestRiskLevel(dangerousPatterns);
      const finding = new InspectionFinding({
        resourceId: bucket.Name,
        resourceType: 'S3Bucket',
        riskLevel: highestRisk,
        issue: `S3 버킷 정책 보안 위험: ${dangerousPatterns.map(p => p.type).join(', ')}`,
        recommendation: '버킷 정책에서 위험한 패턴을 제거하고 최소 권한 원칙을 적용하세요',
        details: {
          bucketName: bucket.Name,
          region: bucket.Region,
          policyStatus: 'RISKY',
          dangerousPatterns: dangerousPatterns,
          actionItems: dangerousPatterns.map(p => p.recommendation)
        },
        category: 'SECURITY'
      });
      this.inspector.addFinding(finding);
    } else {
      const finding = new InspectionFinding({
        resourceId: bucket.Name,
        resourceType: 'S3Bucket',
        riskLevel: 'PASS',
        issue: 'S3 버킷 정책 보안 - 통과',
        recommendation: '버킷 정책이 안전하게 구성되어 있습니다. 정기적으로 정책을 검토하세요.',
        details: {
          bucketName: bucket.Name,
          region: bucket.Region,
          policyStatus: 'SECURE'
        },
        category: 'COMPLIANCE'
      });
      this.inspector.addFinding(finding);
    }
  }

  /**
   * 정책 위험 패턴 분석
   */
  analyzePolicyRisks(policy, bucketName) {
    const risks = [];

    if (!policy.Statement || !Array.isArray(policy.Statement)) {
      return risks;
    }

    for (const statement of policy.Statement) {
      // 전체 공개 액세스 검사
      if (this.isPublicAccess(statement)) {
        risks.push({
          type: '퍼블릭 액세스 허용',
          riskLevel: 'HIGH',
          description: '버킷 정책이 전체 공개 액세스를 허용합니다',
          recommendation: 'Principal을 특정 AWS 계정이나 사용자로 제한하세요'
        });
      }

      // 위험한 액션 검사
      const dangerousActions = this.checkDangerousActions(statement);
      if (dangerousActions.length > 0) {
        risks.push({
          type: '위험한 액션 허용',
          riskLevel: 'HIGH',
          description: `위험한 S3 액션 허용: ${dangerousActions.join(', ')}`,
          recommendation: '불필요한 관리 권한을 제거하고 최소 권한 원칙을 적용하세요'
        });
      }

      // 조건 없는 광범위한 액세스 검사
      if (this.isBroadAccessWithoutConditions(statement)) {
        risks.push({
          type: '조건 없는 광범위한 액세스',
          riskLevel: 'MEDIUM',
          description: '조건 없이 광범위한 액세스를 허용합니다',
          recommendation: 'IP 주소, VPC, 시간 등의 조건을 추가하여 액세스를 제한하세요'
        });
      }
    }

    return risks;
  }

  /**
   * 기존 check 메서드 (하위 호환성)
   */
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

  /**
   * 최고 위험도 반환
   */
  getHighestRiskLevel(patterns) {
    const riskLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    let highest = 'LOW';
    
    patterns.forEach(pattern => {
      const currentIndex = riskLevels.indexOf(pattern.riskLevel);
      const highestIndex = riskLevels.indexOf(highest);
      if (currentIndex > highestIndex) {
        highest = pattern.riskLevel;
      }
    });
    
    return highest;
  }

  /**
   * 퍼블릭 액세스 확인
   */
  isPublicAccess(statement) {
    if (statement.Effect !== 'Allow') return false;
    
    const principal = statement.Principal;
    if (typeof principal === 'string' && principal === '*') return true;
    if (principal && principal.AWS === '*') return true;
    
    return false;
  }

  /**
   * 위험한 액션 확인
   */
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

  /**
   * 조건 없는 광범위한 액세스 확인
   */
  isBroadAccessWithoutConditions(statement) {
    if (statement.Effect !== 'Allow') return false;
    if (statement.Condition) return false;

    const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
    const hasBroadActions = actions.some(action => 
      action === 's3:*' || action === '*' || action.includes('s3:Get*') || action.includes('s3:Put*')
    );

    return hasBroadActions;
  }

  /**
   * 권장사항 생성
   */
  getRecommendations(findings) {
    const recommendations = [];
    const policyFindings = findings.filter(f => 
      f.issue && f.issue.includes('정책')
    );

    if (policyFindings.length > 0) {
      const riskyFindings = policyFindings.filter(f => 
        f.riskLevel === 'HIGH' || f.riskLevel === 'CRITICAL'
      );
      
      if (riskyFindings.length > 0) {
        recommendations.push('위험한 버킷 정책 패턴을 제거하고 최소 권한 원칙을 적용하세요.');
        recommendations.push('퍼블릭 액세스가 필요한 경우 CloudFront를 통한 배포를 고려하세요.');
      }
    }

    return recommendations;
  }
}

module.exports = BucketPolicyChecker;