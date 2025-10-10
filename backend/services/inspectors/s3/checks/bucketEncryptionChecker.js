/**
 * Bucket Encryption Checker
 * S3 버킷 암호화 설정을 통합 검사하는 모듈
 */

const InspectionFinding = require('../../../../models/InspectionFinding');

class BucketEncryptionChecker {
  constructor(inspector) {
    this.inspector = inspector;
  }

  /**
   * 모든 버킷 암호화 검사 실행
   */
  async runAllChecks(buckets) {
    if (!buckets || buckets.length === 0) {
      const finding = new InspectionFinding({
        resourceId: 'no-s3-buckets',
        resourceType: 'S3Bucket',
        riskLevel: 'PASS',
        issue: 'S3 버킷 암호화 검사 - 통과 (버킷 없음)',
        recommendation: 'S3 버킷 생성 시 서버 측 암호화를 기본으로 활성화하세요',
        details: {
          totalBuckets: 0,
          status: '현재 S3 버킷 암호화 관련 보안 위험이 없습니다',
          bestPractices: [
            '새 버킷 생성 시 기본 암호화 설정',
            'KMS 키 사용으로 보안 강화',
            'S3 Bucket Key로 비용 최적화',
            '정기적인 암호화 설정 검토'
          ]
        },
        category: 'COMPLIANCE'
      });
      
      this.inspector.addFinding(finding);
      return;
    }

    for (const bucket of buckets) {
      try {
        // 통합된 버킷 암호화 검사
        this.checkBucketEncryptionComprehensive(bucket);

      } catch (error) {
        this.inspector.recordError(error, {
          operation: 'runAllChecks',
          bucketName: bucket.Name
        });
      }
    }
  }

  /**
   * 버킷별 통합 암호화 검사
   */
  checkBucketEncryptionComprehensive(bucket) {
    const encryption = bucket.Encryption;
    const issues = [];
    const recommendations = [];
    let encryptionScore = 0;
    let maxRiskLevel = 'PASS';
    let encryptionType = 'none';
    let hasCustomKMS = false;
    let hasBucketKey = false;

    // 암호화 설정이 없는 경우
    if (!encryption || !encryption.Rules || encryption.Rules.length === 0) {
      issues.push('서버 측 암호화 미설정');
      encryptionScore = 0;
      maxRiskLevel = 'HIGH';
      
      const finding = new InspectionFinding({
        resourceId: bucket.Name,
        resourceType: 'S3Bucket',
        riskLevel: 'HIGH',
        issue: `S3 버킷 암호화 상태 - 미설정: 서버 측 암호화가 설정되지 않음`,
        recommendation: 'S3 버킷에 서버 측 암호화를 즉시 활성화하세요. 민감한 데이터의 경우 AWS KMS 키 사용을 권장합니다.',
        details: {
          bucketName: bucket.Name,
          region: bucket.Region,
          encryptionStatus: 'DISABLED',
          encryptionScore: 0,
          securityRisks: [
            '저장 데이터 평문 노출 위험',
            '규정 준수 요구사항 위반',
            '데이터 유출 시 직접적 노출',
            '감사 및 컴플라이언스 문제'
          ],
          actionItems: [
            'AWS 콘솔에서 기본 암호화 활성화',
            'AES-256 또는 KMS 암호화 선택',
            '민감 데이터의 경우 고객 관리형 KMS 키 사용',
            'S3 Bucket Key로 비용 최적화'
          ],
          encryptionOptions: [
            {
              type: 'SSE-S3 (AES-256)',
              description: 'AWS 관리형 키로 암호화',
              cost: '무료',
              security: 'MEDIUM'
            },
            {
              type: 'SSE-KMS (AWS 관리형)',
              description: 'AWS 관리형 KMS 키로 암호화',
              cost: '저렴',
              security: 'HIGH'
            },
            {
              type: 'SSE-KMS (고객 관리형)',
              description: '고객 관리형 KMS 키로 암호화',
              cost: '중간',
              security: 'VERY_HIGH'
            }
          ]
        },
        category: 'SECURITY'
      });

      this.inspector.addFinding(finding);
      return;
    }

    // 암호화 규칙 분석
    for (const rule of encryption.Rules) {
      if (!rule.ApplyServerSideEncryptionByDefault) {
        issues.push('기본 암호화 미설정');
        maxRiskLevel = 'HIGH';
        continue;
      }

      const encryptionConfig = rule.ApplyServerSideEncryptionByDefault;
      
      // 암호화 타입 분석
      if (encryptionConfig.SSEAlgorithm === 'AES256') {
        encryptionType = 'AES256';
        encryptionScore = 70; // 기본 암호화
        issues.push('AES-256 암호화 사용 중 (KMS 업그레이드 권장)');
        recommendations.push('보안 강화를 위해 AWS KMS 키 사용 고려');
      } else if (encryptionConfig.SSEAlgorithm === 'aws:kms') {
        encryptionType = 'KMS';
        encryptionScore = 90; // KMS 암호화
        
        if (!encryptionConfig.KMSMasterKeyID) {
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
      maxRiskLevel = 'PASS';
      overallRecommendation = '현재 암호화 설정이 최적입니다. 정기적인 키 회전을 확인하세요.';
    } else if (encryptionScore >= 80) {
      status = '양호한 암호화 설정';
      maxRiskLevel = 'PASS';
      overallRecommendation = '암호화가 잘 설정되어 있습니다. 추가 보안 강화를 고려하세요.';
    } else if (encryptionScore >= 60) {
      status = '기본 암호화 설정';
      maxRiskLevel = 'MEDIUM';
      overallRecommendation = '기본 암호화가 설정되어 있지만 보안 강화가 필요합니다.';
    } else {
      status = '암호화 설정 부족';
      maxRiskLevel = 'HIGH';
      overallRecommendation = '즉시 적절한 암호화를 설정하세요.';
    }

    // 통합된 결과 생성
    const finding = new InspectionFinding({
      resourceId: bucket.Name,
      resourceType: 'S3Bucket',
      riskLevel: maxRiskLevel,
      issue: issues.length > 0 ? 
        `S3 버킷 암호화 상태 - ${status}: ${issues.join(', ')}` : 
        `S3 버킷 암호화 상태 - ${status}`,
      recommendation: overallRecommendation,
      details: {
        bucketName: bucket.Name,
        region: bucket.Region,
        encryptionType: encryptionType,
        encryptionScore: encryptionScore,
        hasCustomKMS: hasCustomKMS,
        hasBucketKey: hasBucketKey,
        status: status,
        issues: issues,
        recommendations: recommendations,
        securityLevel: encryptionScore >= 90 ? '높음' : encryptionScore >= 70 ? '중간' : '낮음',
        costOptimization: hasBucketKey ? '최적화됨' : '개선 가능',
        actionItems: [
          encryptionType === 'AES256' ? 'KMS 암호화로 업그레이드' : null,
          !hasCustomKMS && encryptionType === 'KMS' ? '고객 관리형 KMS 키 사용' : null,
          !hasBucketKey && encryptionType === 'KMS' ? 'S3 Bucket Key 활성화' : null
        ].filter(Boolean),
        complianceBenefits: encryptionScore > 0 ? [
          '저장 데이터 암호화로 데이터 보호',
          '규정 준수 요구사항 충족',
          '데이터 유출 시 위험 최소화',
          '감사 및 컴플라이언스 통과'
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
    if (buckets && buckets.length > 0 && buckets[0].Encryption !== undefined) {
      await this.runAllChecks(buckets);
    } else {
      // 기존 방식으로 데이터 수집 후 검사
      const bucketsWithEncryption = [];
      
      for (const bucket of buckets) {
        try {
          const clientToUse = bucket.s3Client || s3Client;
          const encryptionResponse = await clientToUse.send(
            new GetBucketEncryptionCommand({ Bucket: bucket.Name })
          );
          
          bucketsWithEncryption.push({
            ...bucket,
            Encryption: encryptionResponse.ServerSideEncryptionConfiguration
          });
        } catch (error) {
          if (error.name === 'ServerSideEncryptionConfigurationNotFoundError') {
            bucketsWithEncryption.push({
              ...bucket,
              Encryption: null
            });
          }
        }
      }
      
      await this.runAllChecks(bucketsWithEncryption);
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