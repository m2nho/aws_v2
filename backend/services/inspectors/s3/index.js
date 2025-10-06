const BaseInspector = require('../baseInspector');
const InspectionFinding = require('../../../models/InspectionFinding');
const { S3Client, ListBucketsCommand, GetBucketLocationCommand } = require('@aws-sdk/client-s3');
const bucketPolicyChecker = require('./checks/bucketPolicyChecker');
const bucketEncryptionChecker = require('./checks/bucketEncryptionChecker');
const bucketVersioningChecker = require('./checks/bucketVersioningChecker');
const bucketLoggingChecker = require('./checks/bucketLoggingChecker');
const bucketPublicAccessChecker = require('./checks/bucketPublicAccessChecker');
const bucketMfaDeleteChecker = require('./checks/bucketMfaDeleteChecker');
const bucketLifecycleChecker = require('./checks/bucketLifecycleChecker');
const bucketCorsChecker = require('./checks/bucketCorsChecker');

class S3Inspector extends BaseInspector {
  constructor(options = {}) {
    super('S3', options);
    this.s3Client = null;
    this.region = options.region || 'us-east-1';
  }

  async performInspection(awsCredentials, inspectionConfig = {}) {
    // S3 클라이언트 초기화
    this.s3Client = new S3Client({
      credentials: {
        accessKeyId: awsCredentials.accessKeyId,
        secretAccessKey: awsCredentials.secretAccessKey,
        sessionToken: awsCredentials.sessionToken
      },
      region: this.region
    });

    this.updateProgress('S3 버킷 목록 수집 중', 10);

    try {
      // S3 버킷 목록 수집
      const buckets = await this.collectBucketData();
      this.incrementResourceCount(buckets.length);
      
      if (buckets.length === 0) {
        const finding = new InspectionFinding({
          resourceId: 'N/A',
          resourceType: 'S3',
          riskLevel: 'INFO',
          issue: 'S3 버킷 없음',
          description: '현재 계정에 S3 버킷이 없습니다.',
          recommendation: 'S3 버킷이 필요한 경우 생성을 고려하세요.',
          region: this.region
        });
        this.addFinding(finding);
        return { buckets: [], totalChecks: 0 };
      }

      this.updateProgress('S3 보안 검사 실행 중', 30);

      // 각 검사 실행 - 매번 새로운 인스턴스 생성
      const checks = [
        { CheckerClass: bucketPolicyChecker, name: '버킷 정책 검사' },
        { CheckerClass: bucketEncryptionChecker, name: '암호화 검사' },
        { CheckerClass: bucketVersioningChecker, name: '버전 관리 검사' },
        { CheckerClass: bucketLoggingChecker, name: '로깅 검사' },
        { CheckerClass: bucketPublicAccessChecker, name: '퍼블릭 액세스 검사' },
        { CheckerClass: bucketMfaDeleteChecker, name: 'MFA Delete 검사' },
        { CheckerClass: bucketLifecycleChecker, name: '라이프사이클 검사' },
        { CheckerClass: bucketCorsChecker, name: 'CORS 검사' }
      ];

      let completedChecks = 0;
      const totalChecks = checks.length;

      for (const { CheckerClass, name } of checks) {
        try {
          this.updateProgress(`${name} 실행 중`, 30 + (completedChecks / totalChecks) * 60);
          
          // 매번 새로운 검사 인스턴스 생성하여 결과 누적 방지
          const checker = new CheckerClass();
          const checkResults = await checker.check(this.s3Client, buckets);
          
          // 검사 결과를 InspectionFinding 객체로 변환
          for (const finding of checkResults.findings) {
            const inspectionFinding = new InspectionFinding({
              resourceId: finding.resource,
              resourceType: 'S3',
              riskLevel: this.mapSeverityToRiskLevel(finding.severity),
              issue: finding.title,
              description: finding.description,
              recommendation: finding.recommendation,
              region: this.region,
              metadata: {
                checkId: finding.id,
                bucketName: finding.resource
              }
            });
            this.addFinding(inspectionFinding);
          }
          
        } catch (error) {
          this.recordError(error, { checker: name });
          
          const errorFinding = new InspectionFinding({
            resourceId: 'S3 Service',
            resourceType: 'S3',
            riskLevel: 'MEDIUM',
            issue: 'S3 검사 오류',
            description: `${name} 중 오류가 발생했습니다: ${error.message}`,
            recommendation: 'AWS 권한을 확인하고 다시 시도하세요.',
            region: this.region
          });
          this.addFinding(errorFinding);
        }
        
        completedChecks++;
      }

      this.updateProgress('S3 검사 완료', 100);

      return {
        buckets,
        totalChecks: completedChecks,
        bucketsScanned: buckets.length
      };

    } catch (error) {
      this.recordError(error, { phase: 'S3 inspection' });
      
      const errorFinding = new InspectionFinding({
        resourceId: 'S3 Service',
        resourceType: 'S3',
        riskLevel: 'HIGH',
        issue: 'S3 Inspector 실행 오류',
        description: `S3 검사 중 오류가 발생했습니다: ${error.message}`,
        recommendation: 'AWS 자격 증명과 권한을 확인하세요.',
        region: this.region
      });
      this.addFinding(errorFinding);
      
      throw error;
    }
  }

  async collectBucketData() {
    try {
      const listBucketsResponse = await this.retryableApiCall(
        () => this.s3Client.send(new ListBucketsCommand({})),
        'ListBuckets'
      );
      const buckets = listBucketsResponse.Buckets || [];

      // 각 버킷의 리전 정보 수집
      const bucketsWithRegion = await Promise.all(
        buckets.map(async (bucket) => {
          try {
            const locationResponse = await this.retryableApiCall(
              () => this.s3Client.send(new GetBucketLocationCommand({ Bucket: bucket.Name })),
              `GetBucketLocation-${bucket.Name}`
            );
            const region = locationResponse.LocationConstraint || 'us-east-1';
            
            // 각 버킷에 대해 리전별 S3 클라이언트 생성
            const bucketS3Client = new S3Client({
              credentials: this.s3Client.config.credentials,
              region: region
            });
            
            return {
              ...bucket,
              Region: region,
              CreationDate: bucket.CreationDate ? bucket.CreationDate.toISOString() : null,
              s3Client: bucketS3Client  // 버킷별 클라이언트 추가
            };
          } catch (error) {
            this.logger.warn(`버킷 ${bucket.Name}의 리전 정보를 가져올 수 없습니다:`, error.message);
            return {
              ...bucket,
              Region: 'unknown',
              CreationDate: bucket.CreationDate ? bucket.CreationDate.toISOString() : null,
              s3Client: this.s3Client  // 기본 클라이언트 사용
            };
          }
        })
      );

      return bucketsWithRegion;
    } catch (error) {
      this.logger.error('S3 버킷 데이터 수집 오류:', error);
      throw error;
    }
  }

  async performItemInspection(awsCredentials, inspectionConfig = {}) {
    // S3 클라이언트 초기화
    this.s3Client = new S3Client({
      credentials: {
        accessKeyId: awsCredentials.accessKeyId,
        secretAccessKey: awsCredentials.secretAccessKey,
        sessionToken: awsCredentials.sessionToken
      },
      region: this.region
    });

    const targetItem = inspectionConfig.targetItem;

    this.updateProgress('S3 버킷 목록 수집 중', 10);

    try {
      // S3 버킷 목록 수집
      const buckets = await this.collectBucketData();
      this.incrementResourceCount(buckets.length);
      
      if (buckets.length === 0) {
        const finding = new InspectionFinding({
          resourceId: 'N/A',
          resourceType: 'S3',
          riskLevel: 'LOW',
          issue: 'S3 버킷 없음',
          description: '현재 계정에 S3 버킷이 없습니다.',
          recommendation: 'S3 버킷이 필요한 경우 생성을 고려하세요.',
          region: this.region
        });
        this.addFinding(finding);
        return { buckets: [], totalChecks: 0 };
      }

      this.updateProgress(`${targetItem} 검사 실행 중`, 50);

      // 특정 검사만 실행
      let CheckerClass = null;
      let checkerName = '';

      switch (targetItem) {
        case 'bucket-policy':
          CheckerClass = bucketPolicyChecker;
          checkerName = '버킷 정책 검사';
          break;
        case 'bucket-encryption':
          CheckerClass = bucketEncryptionChecker;
          checkerName = '암호화 검사';
          break;
        case 'bucket-versioning':
          CheckerClass = bucketVersioningChecker;
          checkerName = '버전 관리 검사';
          break;
        case 'bucket-logging':
          CheckerClass = bucketLoggingChecker;
          checkerName = '로깅 검사';
          break;
        case 'bucket-public-access':
          CheckerClass = bucketPublicAccessChecker;
          checkerName = '퍼블릭 액세스 검사';
          break;
        case 'bucket-mfa-delete':
          CheckerClass = bucketMfaDeleteChecker;
          checkerName = 'MFA Delete 검사';
          break;
        case 'bucket-lifecycle':
          CheckerClass = bucketLifecycleChecker;
          checkerName = '라이프사이클 검사';
          break;
        case 'bucket-cors':
          CheckerClass = bucketCorsChecker;
          checkerName = 'CORS 검사';
          break;
        default:
          throw new Error(`Unknown S3 inspection item: ${targetItem}`);
      }

      try {
        // 특정 검사만 실행
        const checker = new CheckerClass();
        const checkResults = await checker.check(this.s3Client, buckets);
        
        // 검사 결과를 InspectionFinding 객체로 변환
        for (const finding of checkResults.findings) {
          const inspectionFinding = new InspectionFinding({
            resourceId: finding.resource,
            resourceType: 'S3',
            riskLevel: this.mapSeverityToRiskLevel(finding.severity),
            issue: finding.title,
            description: finding.description,
            recommendation: finding.recommendation,
            region: this.region,
            metadata: {
              checkId: finding.id,
              bucketName: finding.resource
            }
          });
          this.addFinding(inspectionFinding);
        }
        
      } catch (error) {
        this.recordError(error, { checker: checkerName });
        
        const errorFinding = new InspectionFinding({
          resourceId: 'S3 Service',
          resourceType: 'S3',
          riskLevel: 'MEDIUM',
          issue: 'S3 검사 오류',
          description: `${checkerName} 중 오류가 발생했습니다: ${error.message}`,
          recommendation: 'AWS 권한을 확인하고 다시 시도하세요.',
          region: this.region
        });
        this.addFinding(errorFinding);
      }

      this.updateProgress('S3 검사 완료', 100);

      return {
        buckets,
        totalChecks: 1,
        bucketsScanned: buckets.length,
        targetItem: targetItem
      };

    } catch (error) {
      this.recordError(error, { phase: 'S3 item inspection', targetItem });
      
      const errorFinding = new InspectionFinding({
        resourceId: 'S3 Service',
        resourceType: 'S3',
        riskLevel: 'HIGH',
        issue: 'S3 Inspector 실행 오류',
        description: `S3 ${targetItem} 검사 중 오류가 발생했습니다: ${error.message}`,
        recommendation: 'AWS 자격 증명과 권한을 확인하세요.',
        region: this.region
      });
      this.addFinding(errorFinding);
      
      throw error;
    }
  }

  mapSeverityToRiskLevel(severity) {
    const mapping = {
      'high': 'HIGH',
      'medium': 'MEDIUM', 
      'low': 'LOW',
      'info': 'LOW'  // INFO를 LOW로 매핑
    };
    return mapping[severity] || 'MEDIUM';
  }

  getVersion() {
    return 's3-inspector-v1.0';
  }

  getSupportedInspectionTypes() {
    return [
      'bucket-policy',
      'bucket-encryption',
      'bucket-versioning',
      'bucket-logging',
      'bucket-public-access',
      'bucket-mfa-delete',
      'bucket-lifecycle',
      'bucket-cors'
    ];
  }

  getServiceSpecificRecommendations() {
    const recommendations = [];
    const riskGroups = InspectionFinding.groupByRiskLevel(this.findings);

    if (riskGroups.HIGH && riskGroups.HIGH.length > 0) {
      recommendations.push('S3 버킷의 퍼블릭 액세스 설정을 즉시 검토하세요.');
      recommendations.push('암호화되지 않은 버킷에 대해 서버 측 암호화를 활성화하세요.');
    }

    if (riskGroups.MEDIUM && riskGroups.MEDIUM.length > 0) {
      recommendations.push('버전 관리와 MFA Delete를 활성화하여 데이터 보호를 강화하세요.');
      recommendations.push('라이프사이클 정책을 설정하여 스토리지 비용을 최적화하세요.');
    }

    return recommendations;
  }
}

module.exports = S3Inspector;