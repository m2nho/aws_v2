/**
 * EC2 Inspector Main Module
 * EC2 서비스에 대한 보안 및 모범 사례 검사
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

const BaseInspector = require('../baseInspector');
const { EC2Client } = require('@aws-sdk/client-ec2');

// 검사 항목별 모듈 import
const SecurityGroupChecker = require('./checks/securityGroupChecker');
const DangerousPortsChecker = require('./checks/dangerousPortsChecker');
const EBSEncryptionChecker = require('./checks/ebsEncryptionChecker');
const PublicIpChecker = require('./checks/publicIpChecker');
const UnusedSecurityGroupsChecker = require('./checks/unusedSecurityGroupsChecker');
const UnusedElasticIpChecker = require('./checks/unusedElasticIpChecker');
const OldSnapshotsChecker = require('./checks/oldSnapshotsChecker');
const EBSVolumeVersionChecker = require('./checks/ebsVolumeVersionChecker');
const TerminationProtectionChecker = require('./checks/terminationProtectionChecker');
const StoppedInstancesChecker = require('./checks/stoppedInstancesChecker');

// 데이터 수집 모듈
const EC2DataCollector = require('./collectors/ec2DataCollector');

class EC2Inspector extends BaseInspector {
  constructor(options = {}) {
    super('EC2', options);
    this.ec2Client = null;
    this.dataCollector = null;

    // 검사 모듈들 초기화
    this.checkers = {
      securityGroup: new SecurityGroupChecker(this),
      dangerousPorts: new DangerousPortsChecker(this),
      ebsEncryption: new EBSEncryptionChecker(this),
      publicIp: new PublicIpChecker(this),
      unusedSecurityGroups: new UnusedSecurityGroupsChecker(this),
      unusedElasticIp: new UnusedElasticIpChecker(this),
      oldSnapshots: new OldSnapshotsChecker(this),
      ebsVolumeVersion: new EBSVolumeVersionChecker(this),
      terminationProtection: new TerminationProtectionChecker(this),
      stoppedInstances: new StoppedInstancesChecker(this)
    };
  }

  /**
   * Inspector 버전 반환
   */
  getVersion() {
    return 'ec2-inspector-v2.0';
  }

  /**
   * 지원하는 검사 유형 목록 반환
   */
  getSupportedInspectionTypes() {
    return [
      'dangerous-ports',
      'ebs-encryption',
      'public-ip-exposure',
      'unused-security-groups',
      'unused-elastic-ip',
      'old-snapshots',
      'ebs-volume-version',
      'termination-protection',
      'stopped-instances'
    ];
  }

  /**
   * 사전 검증
   */
  async preInspectionValidation(awsCredentials, inspectionConfig) {
    await super.preInspectionValidation(awsCredentials, inspectionConfig);

    // EC2 클라이언트 초기화
    this.ec2Client = new EC2Client({
      region: awsCredentials.region || 'us-east-1',
      credentials: {
        accessKeyId: awsCredentials.accessKeyId,
        secretAccessKey: awsCredentials.secretAccessKey,
        sessionToken: awsCredentials.sessionToken
      }
    });

    // 데이터 수집기 초기화
    this.dataCollector = new EC2DataCollector(this.ec2Client, this);

    this.logger.debug('EC2 client and data collector initialized successfully');
  }

  /**
   * 개별 항목 검사 수행
   */
  async performItemInspection(awsCredentials, inspectionConfig) {
    const targetItem = inspectionConfig.targetItem;
    const results = {
      securityGroups: [],
      instances: [],
      findings: []
    };

    try {
      switch (targetItem) {
        case 'dangerous_ports':
          await this._inspectDangerousPorts(results);
          break;

        case 'ebs_encryption':
          await this._inspectEBSEncryption(results);
          break;

        case 'public_ip_exposure':
          await this._inspectPublicIpExposure(results);
          break;

        case 'unused_security_groups':
          await this._inspectUnusedSecurityGroups(results);
          break;

        case 'unused_elastic_ip':
          await this._inspectUnusedElasticIp(results);
          break;

        case 'old_snapshots':
          await this._inspectOldSnapshots(results);
          break;

        case 'ebs_volume_version':
          await this._inspectEBSVolumeVersion(results);
          break;

        case 'termination-protection':
          await this._inspectTerminationProtection(results);
          break;

        case 'stopped-instances':
          await this._inspectStoppedInstances(results);
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
      securityGroups: [],
      instances: [],
      findings: []
    };

    try {
      // 1. 데이터 수집
      this.updateProgress('AWS 리소스 정보 수집 중', 10);
      const data = await this.dataCollector.collectAllData();

      results.securityGroups = data.securityGroups;
      results.instances = data.instances;
      this.incrementResourceCount(data.securityGroups.length + data.instances.length);

      // 2. 위험한 포트 검사 (SSH, RDP, DB 포트 등)
      this.updateProgress('위험한 포트 분석 중', 20);
      await this.checkers.dangerousPorts.runAllChecks(data.securityGroups);

      // 3. EBS 암호화 검사
      this.updateProgress('EBS 암호화 분석 중', 30);
      await this.checkers.ebsEncryption.runAllChecks(data.instances);

      // 4. 퍼블릭 IP 노출 검사
      this.updateProgress('퍼블릭 IP 노출 분석 중', 40);
      await this.checkers.publicIp.runAllChecks(data.instances);

      // 5. 미사용 보안 그룹 검사
      this.updateProgress('미사용 보안 그룹 분석 중', 55);
      await this.checkers.unusedSecurityGroups.runAllChecks(data.securityGroups, data.instances);

      // 6. 미사용 Elastic IP 검사
      this.updateProgress('미사용 Elastic IP 분석 중', 70);
      await this.checkers.unusedElasticIp.runAllChecks(data.instances);

      // 7. 오래된 스냅샷 검사
      this.updateProgress('오래된 스냅샷 분석 중', 80);
      await this.checkers.oldSnapshots.runAllChecks(data.instances);

      // 8. EBS 볼륨 버전 검사
      this.updateProgress('EBS 볼륨 버전 분석 중', 80);
      await this.checkers.ebsVolumeVersion.runAllChecks(data.instances);

      // 9. 종료 보호 검사
      this.updateProgress('종료 보호 설정 분석 중', 90);
      await this.checkers.terminationProtection.runAllChecks(data.instances);

      // 10. 중지된 인스턴스 검사
      this.updateProgress('중지된 인스턴스 분석 중', 95);
      await this.checkers.stoppedInstances.runAllChecks(data.instances);

      this.updateProgress('검사 완료', 100);
      results.findings = this.findings;

      return results;

    } catch (error) {
      this.recordError(error, { phase: 'performInspection' });
      throw error;
    }
  }

  // 개별 검사 메서드들
  async _inspectDangerousPorts(results) {
    this.updateProgress('보안 그룹 조회 중', 20);
    const securityGroups = await this.dataCollector.getSecurityGroups();
    results.securityGroups = securityGroups;
    this.incrementResourceCount(securityGroups.length);

    this.updateProgress('위험한 포트 분석 중', 70);
    await this.checkers.dangerousPorts.runAllChecks(securityGroups);
    
    results.findings = this.findings;
  }

  async _inspectEBSEncryption(results) {
    this.updateProgress('EC2 인스턴스 조회 중', 30);
    const instances = await this.dataCollector.getEC2Instances();
    results.instances = instances;
    this.incrementResourceCount(instances.length);

    this.updateProgress('EBS 암호화 분석 중', 70);
    await this.checkers.ebsEncryption.runAllChecks(instances);
    
    results.findings = this.findings;
  }

  async _inspectPublicIpExposure(results) {
    this.updateProgress('EC2 인스턴스 조회 중', 30);
    const instances = await this.dataCollector.getEC2Instances();
    results.instances = instances;
    this.incrementResourceCount(instances.length);

    this.updateProgress('퍼블릭 IP 노출 분석 중', 70);
    await this.checkers.publicIp.runAllChecks(instances);
    
    results.findings = this.findings;
  }

  async _inspectUnusedSecurityGroups(results) {
    this.updateProgress('리소스 조회 중', 25);
    const [securityGroups, instances] = await Promise.all([
      this.dataCollector.getSecurityGroups(),
      this.dataCollector.getEC2Instances()
    ]);

    results.securityGroups = securityGroups;
    results.instances = instances;
    this.incrementResourceCount(securityGroups.length + instances.length);

    this.updateProgress('미사용 보안 그룹 분석 중', 70);
    await this.checkers.unusedSecurityGroups.runAllChecks(securityGroups, instances);
    
    results.findings = this.findings;
  }

  async _inspectUnusedElasticIp(results) {
    this.updateProgress('EC2 인스턴스 조회 중', 30);
    const instances = await this.dataCollector.getEC2Instances();
    results.instances = instances;
    this.incrementResourceCount(instances.length);

    this.updateProgress('미사용 Elastic IP 분석 중', 70);
    await this.checkers.unusedElasticIp.runAllChecks(instances);
    
    results.findings = this.findings;
  }

  async _inspectOldSnapshots(results) {
    this.updateProgress('EC2 인스턴스 조회 중', 30);
    const instances = await this.dataCollector.getEC2Instances();
    results.instances = instances;
    this.incrementResourceCount(instances.length);

    this.updateProgress('오래된 스냅샷 분석 중', 70);
    await this.checkers.oldSnapshots.runAllChecks(instances);
    
    results.findings = this.findings;
  }

  async _inspectEBSVolumeVersion(results) {
    this.updateProgress('EC2 인스턴스 조회 중', 30);
    const instances = await this.dataCollector.getEC2Instances();
    results.instances = instances;
    this.incrementResourceCount(instances.length);

    this.updateProgress('EBS 볼륨 버전 분석 중', 70);
    await this.checkers.ebsVolumeVersion.runAllChecks(instances);
    
    results.findings = this.findings;
  }

  async _inspectTerminationProtection(results) {
    this.updateProgress('EC2 인스턴스 조회 중', 30);
    const instances = await this.dataCollector.getEC2Instances();
    results.instances = instances;
    this.incrementResourceCount(instances.length);

    this.updateProgress('종료 보호 설정 분석 중', 70);
    await this.checkers.terminationProtection.runAllChecks(instances);
    
    results.findings = this.findings;
  }

  async _inspectStoppedInstances(results) {
    this.updateProgress('EC2 인스턴스 조회 중', 30);
    const instances = await this.dataCollector.getEC2Instances();
    results.instances = instances;
    this.incrementResourceCount(instances.length);

    this.updateProgress('중지된 인스턴스 분석 중', 70);
    await this.checkers.stoppedInstances.runAllChecks(instances);
    
    results.findings = this.findings;
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

    if (this.metadata && this.metadata.securityGroupsAnalyzed) {
      completedChecks.push('Security Groups Analysis');
    }
    if (this.metadata && this.metadata.instancesAnalyzed) {
      completedChecks.push('EC2 Instances Analysis');
    }
    if (this.metadata && this.metadata.networkAnalyzed) {
      completedChecks.push('Network Configuration Analysis');
    }

    return completedChecks;
  }
}

module.exports = EC2Inspector;