const BaseInspector = require('../baseInspector');
const InspectionFinding = require('../../../models/InspectionFinding');
const { S3Client } = require('@aws-sdk/client-s3');

// 검사 항목별 모듈 import
const BucketPolicyChecker = require('./checks/bucketPolicyChecker');
const BucketEncryptionChecker = require('./checks/bucketEncryptionChecker');
const BucketVersioningChecker = require('./checks/bucketVersioningChecker');
const BucketLoggingChecker = require('./checks/bucketLoggingChecker');
const BucketPublicAccessChecker = require('./checks/bucketPublicAccessChecker');
const BucketLifecycleChecker = require('./checks/bucketLifecycleChecker');
const BucketCorsChecker = require('./checks/bucketCorsChecker');

// 데이터 수집 모듈
const S3DataCollector = require('./collectors/s3DataCollector');

class S3Inspector extends BaseInspector {
  constructor(options = {}) {
    super('S3', options);
    this.s3Client = null;
    this.dataCollector = null;
    this.region = options.region || 'us-east-1';

    // 검사 모듈들 초기화
    this.checkers = {
      bucketPolicy: new BucketPolicyChecker(this),
      bucketEncryption: new BucketEncryptionChecker(this),
      bucketVersioning: new BucketVersioningChecker(this),
      bucketLogging: new BucketLoggingChecker(this),
      bucketPublicAccess: new BucketPublicAccessChecker(this),
      bucketLifecycle: new BucketLifecycleChecker(this),
      bucketCors: new BucketCorsChecker(this)
    };
  }

  /**
   * Inspector 버전 반환
   */
  getVersion() {
    return 's3-inspector-v2.0';
  }

  /**
   * 지원하는 검사 유형 목록 반환
   */
  getSupportedInspectionTypes() {
    return [
      'bucket-policy',
      'bucket-encryption',
      'bucket-versioning',
      'bucket-logging',
      'bucket-public-access',
      'bucket-lifecycle',
      'bucket-cors'
    ];
  }

  /**
   * 사전 검증
   */
  async preInspectionValidation(awsCredentials, inspectionConfig) {
    await super.preInspectionValidation(awsCredentials, inspectionConfig);

    // S3 클라이언트 초기화
    this.s3Client = new S3Client({
      region: awsCredentials.region || this.region,
      credentials: {
        accessKeyId: awsCredentials.accessKeyId,
        secretAccessKey: awsCredentials.secretAccessKey,
        sessionToken: awsCredentials.sessionToken
      }
    });

    // 데이터 수집기 초기화
    this.dataCollector = new S3DataCollector(this.s3Client, this);

    this.logger.debug('S3 client and data collector initialized successfully');
  }

  /**
   * 개별 항목 검사 수행
   */
  async performItemInspection(awsCredentials, inspectionConfig) {
    const targetItem = inspectionConfig.targetItem;
    const results = {
      buckets: [],
      findings: []
    };

    try {
      switch (targetItem) {
        case 'bucket-policy':
          await this._inspectBucketPolicy(results);
          break;

        case 'bucket-encryption':
          await this._inspectBucketEncryption(results);
          break;

        case 'bucket-versioning':
          await this._inspectBucketVersioning(results);
          break;

        case 'bucket-logging':
          await this._inspectBucketLogging(results);
          break;

        case 'bucket-public-access':
          await this._inspectBucketPublicAccess(results);
          break;

        case 'bucket-lifecycle':
          await this._inspectBucketLifecycle(results);
          break;

        case 'bucket-cors':
          await this._inspectBucketCors(results);
          break;

        default:
          // 알 수 없는 항목인 경우 전체 검사로 폴백
          return this.performInspection(awsCredentials, inspectionConfig);
      }

      this.updateProgress('분석 완료 중', 95);
      results.findings = this.findings;
      return results;

    } catch (error) {
      this.recordError(error, { targetItem });
      throw error;
    }
  }

  /**
   * 전체 검사 수행
   */
  async performInspection(awsCredentials, inspectionConfig) {
    const results = {
      buckets: [],
      findings: []
    };

    try {
      // 1. 데이터 수집
      this.updateProgress('S3 버킷 정보 수집 중', 10);
      const data = await this.dataCollector.collectAllData();

      results.buckets = data.buckets;
      this.incrementResourceCount(data.buckets.length);

      if (data.buckets.length === 0) {
        const finding = new InspectionFinding({
          resourceId: 'no-s3-buckets',
          resourceType: 'S3Bucket',
          riskLevel: 'PASS',
          issue: 'S3 검사 - 통과 (버킷 없음)',
          recommendation: 'S3 버킷이 필요한 경우 보안 모범 사례를 적용하여 생성하세요.',
          details: {
            totalBuckets: 0,
            status: '현재 S3 관련 보안 위험이 없습니다'
          },
          category: 'COMPLIANCE'
        });
        this.addFinding(finding);
        return results;
      }

      // 2. 버킷 정책 검사
      this.updateProgress('버킷 정책 분석 중', 20);
      await this.checkers.bucketPolicy.runAllChecks(data.buckets);

      // 3. 암호화 검사
      this.updateProgress('버킷 암호화 분석 중', 35);
      await this.checkers.bucketEncryption.runAllChecks(data.buckets);

      // 4. 퍼블릭 액세스 검사
      this.updateProgress('퍼블릭 액세스 분석 중', 50);
      await this.checkers.bucketPublicAccess.runAllChecks(data.buckets);

      // 5. 버전 관리 검사
      this.updateProgress('버전 관리 분석 중', 65);
      await this.checkers.bucketVersioning.runAllChecks(data.buckets);

      // 6. 로깅 검사
      this.updateProgress('액세스 로깅 분석 중', 80);
      await this.checkers.bucketLogging.runAllChecks(data.buckets);

      // 7. 라이프사이클 검사
      this.updateProgress('라이프사이클 정책 분석 중', 90);
      await this.checkers.bucketLifecycle.runAllChecks(data.buckets);

      // 8. CORS 검사
      this.updateProgress('CORS 설정 분석 중', 95);
      await this.checkers.bucketCors.runAllChecks(data.buckets);

      this.updateProgress('검사 완료', 100);
      results.findings = this.findings;

      return results;

    } catch (error) {
      this.recordError(error, { phase: 'performInspection' });
      throw error;
    }
  }

  // 개별 검사 메서드들
  async _inspectBucketPolicy(results) {
    this.findings = [];

    this.updateProgress('S3 버킷 조회 중', 20);
    const buckets = await this.dataCollector.collectAllData();
    results.buckets = buckets.buckets;
    this.incrementResourceCount(buckets.buckets.length);

    this.updateProgress('버킷 정책 분석 중', 70);
    await this.checkers.bucketPolicy.runAllChecks(buckets.buckets);

    results.findings = this.findings;
  }

  async _inspectBucketEncryption(results) {
    this.findings = [];

    this.updateProgress('S3 버킷 조회 중', 20);
    const buckets = await this.dataCollector.collectAllData();
    results.buckets = buckets.buckets;
    this.incrementResourceCount(buckets.buckets.length);

    this.updateProgress('버킷 암호화 분석 중', 70);
    await this.checkers.bucketEncryption.runAllChecks(buckets.buckets);

    results.findings = this.findings;
  }

  async _inspectBucketVersioning(results) {
    this.findings = [];

    this.updateProgress('S3 버킷 조회 중', 20);
    const buckets = await this.dataCollector.collectAllData();
    results.buckets = buckets.buckets;
    this.incrementResourceCount(buckets.buckets.length);

    this.updateProgress('버전 관리 분석 중', 70);
    await this.checkers.bucketVersioning.runAllChecks(buckets.buckets);

    results.findings = this.findings;
  }

  async _inspectBucketLogging(results) {
    this.findings = [];

    this.updateProgress('S3 버킷 조회 중', 20);
    const buckets = await this.dataCollector.collectAllData();
    results.buckets = buckets.buckets;
    this.incrementResourceCount(buckets.buckets.length);

    this.updateProgress('액세스 로깅 분석 중', 70);
    await this.checkers.bucketLogging.runAllChecks(buckets.buckets);

    results.findings = this.findings;
  }

  async _inspectBucketPublicAccess(results) {
    this.findings = [];

    this.updateProgress('S3 버킷 조회 중', 20);
    const buckets = await this.dataCollector.collectAllData();
    results.buckets = buckets.buckets;
    this.incrementResourceCount(buckets.buckets.length);

    this.updateProgress('퍼블릭 액세스 분석 중', 70);
    await this.checkers.bucketPublicAccess.runAllChecks(buckets.buckets);

    results.findings = this.findings;
  }

  async _inspectBucketLifecycle(results) {
    this.findings = [];

    this.updateProgress('S3 버킷 조회 중', 20);
    const buckets = await this.dataCollector.collectAllData();
    results.buckets = buckets.buckets;
    this.incrementResourceCount(buckets.buckets.length);

    this.updateProgress('라이프사이클 정책 분석 중', 70);
    await this.checkers.bucketLifecycle.runAllChecks(buckets.buckets);

    results.findings = this.findings;
  }

  async _inspectBucketCors(results) {
    this.findings = [];

    this.updateProgress('S3 버킷 조회 중', 20);
    const buckets = await this.dataCollector.collectAllData();
    results.buckets = buckets.buckets;
    this.incrementResourceCount(buckets.buckets.length);

    this.updateProgress('CORS 설정 분석 중', 70);
    await this.checkers.bucketCors.runAllChecks(buckets.buckets);

    results.findings = this.findings;
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

  /**
   * 서비스별 특화 권장사항
   */
  getServiceSpecificRecommendations() {
    const recommendations = [];

    // 각 검사 모듈에서 권장사항 수집
    Object.values(this.checkers).forEach(checker => {
      if (checker.getRecommendations) {
        recommendations.push(...checker.getRecommendations(this.findings));
      }
    });

    return recommendations;
  }

  /**
   * 부분적 결과 반환
   */
  getPartialResults() {
    if (this.findings.length === 0) {
      return null;
    }

    const summary = {
      totalResources: this.resourceCount,
      criticalIssues: this.findings.filter(f => f.riskLevel === 'CRITICAL').length,
      highRiskIssues: this.findings.filter(f => f.riskLevel === 'HIGH').length,
      mediumRiskIssues: this.findings.filter(f => f.riskLevel === 'MEDIUM').length,
      lowRiskIssues: this.findings.filter(f => f.riskLevel === 'LOW').length,
      overallScore: this.calculateOverallScore(),
      partial: true,
      completedChecks: this.getCompletedChecks()
    };

    return {
      summary,
      findings: this.findings.map(f => f.toApiResponse ? f.toApiResponse() : f),
      recommendations: this.getServiceSpecificRecommendations(),
      metadata: {
        partial: true,
        completedAt: Date.now(),
        resourcesScanned: this.resourceCount,
        checksCompleted: this.getCompletedChecks().length
      }
    };
  }

  /**
   * 완료된 검사 항목들 반환
   */
  getCompletedChecks() {
    const completedChecks = [];

    if (this.metadata && this.metadata.bucketsAnalyzed) {
      completedChecks.push('S3 Buckets Analysis');
    }
    if (this.metadata && this.metadata.encryptionAnalyzed) {
      completedChecks.push('Encryption Analysis');
    }
    if (this.metadata && this.metadata.publicAccessAnalyzed) {
      completedChecks.push('Public Access Analysis');
    }

    return completedChecks;
  }

  mapSeverityToRiskLevel(severity) {
    const mapping = {
      'pass': 'PASS',
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
      // 'bucket-mfa-delete', // 중복 검사로 비활성화
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

  /**
   * 기존 메서드들 (하위 호환성 유지)
   */
  async collectBucketData() {
    return this.dataCollector ?
      (await this.dataCollector.collectAllData()).buckets :
      await this.dataCollector.getBuckets();
  }

  mapSeverityToRiskLevel(severity) {
    const mapping = {
      'pass': 'PASS',
      'high': 'HIGH',
      'medium': 'MEDIUM',
      'low': 'LOW',
      'info': 'LOW'
    };
    return mapping[severity] || 'MEDIUM';
  }
}

module.exports = S3Inspector;

module.exports = S3Inspector;