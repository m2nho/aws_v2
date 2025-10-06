/**
 * EBS Encryption Checker
 * EBS 볼륨 암호화 관련 검사를 담당하는 모듈
 */

const InspectionFinding = require('../../../../models/InspectionFinding');

class EBSEncryptionChecker {
  constructor(inspector) {
    this.inspector = inspector;
  }

  /**
   * 모든 EBS 암호화 검사 실행
   */
  async runAllChecks(instances) {
    const activeInstances = instances.filter(instance => 
      instance.State?.Name !== 'terminated' && 
      instance.State?.Name !== 'terminating'
    );

    // 검사 대상이 없는 경우 정보성 finding 추가
    if (activeInstances.length === 0) {
      const finding = new InspectionFinding({
        resourceId: 'no-instances',
        resourceType: 'EC2Instance',
        riskLevel: 'PASS',
        issue: 'EBS 암호화 검사 - 통과 (인스턴스 없음)',
        recommendation: 'EC2 인스턴스가 생성되면 EBS 암호화 설정을 검토하세요',
        details: {
          totalInstances: instances.length,
          activeInstances: activeInstances.length,
          reason: '활성 상태의 EC2 인스턴스가 없어 EBS 암호화 검사를 수행할 수 없습니다'
        },
        category: 'COMPLIANCE'
      });
      
      this.inspector.addFinding(finding);
      return;
    }

    for (const instance of activeInstances) {
      try {
        // 통합된 EBS 암호화 검사
        this.checkInstanceEBSEncryptionComprehensive(instance);

      } catch (error) {
        this.inspector.recordError(error, {
          operation: 'runAllChecks',
          instanceId: instance.InstanceId
        });
      }
    }
  }

  /**
   * 인스턴스별 통합 EBS 암호화 검사
   */
  checkInstanceEBSEncryptionComprehensive(instance) {
    if (!instance.BlockDeviceMappings || instance.BlockDeviceMappings.length === 0) {
      // 볼륨이 없는 인스턴스
      const finding = new InspectionFinding({
        resourceId: instance.InstanceId,
        resourceType: 'EC2Instance',
        riskLevel: 'PASS',
        issue: 'EBS 암호화 상태 - 통과 (볼륨 없음)',
        recommendation: '현재 인스턴스에 EBS 볼륨이 없어 암호화 관련 위험이 없습니다.',
        details: {
          instanceId: instance.InstanceId,
          instanceType: instance.InstanceType,
          state: instance.State?.Name,
          volumeCount: 0,
          status: 'EBS 볼륨이 없어 암호화 위험 없음'
        },
        category: 'SECURITY'
      });
      this.inspector.addFinding(finding);
      return;
    }

    const issues = [];
    const volumeDetails = [];
    let encryptedCount = 0;
    let unencryptedCount = 0;
    let rootVolumeEncrypted = true;
    let criticalIssues = 0;
    let highIssues = 0;
    let mediumIssues = 0;

    // 각 볼륨 분석
    instance.BlockDeviceMappings.forEach(mapping => {
      if (mapping.Ebs) {
        const volumeDetail = {
          volumeId: mapping.Ebs.VolumeId,
          deviceName: mapping.DeviceName,
          volumeSize: mapping.Ebs.VolumeSize,
          encrypted: mapping.Ebs.Encrypted,
          isRootVolume: mapping.DeviceName === instance.RootDeviceName,
          issues: []
        };

        if (!mapping.Ebs.Encrypted) {
          unencryptedCount++;
          volumeDetail.issues.push('암호화되지 않음');
          
          // 루트 볼륨인지 확인
          if (mapping.DeviceName === instance.RootDeviceName) {
            rootVolumeEncrypted = false;
            criticalIssues++;
            volumeDetail.issues.push('루트 볼륨 암호화 필요');
            issues.push('루트 볼륨이 암호화되지 않음');
          } else {
            highIssues++;
            issues.push(`데이터 볼륨 ${mapping.DeviceName}이 암호화되지 않음`);
          }
          
          // 스냅샷 관련 위험
          mediumIssues++;
          volumeDetail.issues.push('스냅샷도 암호화되지 않을 위험');
        } else {
          encryptedCount++;
        }

        volumeDetails.push(volumeDetail);
      }
    });

    // 전체 위험도 결정
    let riskLevel = 'PASS';
    let status = 'EBS 암호화 상태 양호';
    let recommendation = '모든 EBS 볼륨이 안전하게 암호화되어 있습니다. 현재 설정을 유지하세요.';

    if (criticalIssues > 0) {
      riskLevel = 'CRITICAL';
      status = '즉시 조치 필요 - 루트 볼륨 암호화 안됨';
      recommendation = '루트 볼륨 암호화를 즉시 활성화하여 시스템 데이터를 보호하세요.';
    } else if (highIssues > 0) {
      riskLevel = 'HIGH';
      status = '데이터 볼륨 암호화 필요';
      recommendation = '암호화되지 않은 데이터 볼륨에 암호화를 활성화하여 저장 데이터를 보호하세요.';
    } else if (mediumIssues > 0) {
      riskLevel = 'MEDIUM';
      status = '스냅샷 암호화 검토 필요';
      recommendation = '기존 스냅샷의 암호화 상태를 확인하고 필요시 암호화된 복사본을 생성하세요.';
    }

    // 결과 생성
    const finding = new InspectionFinding({
      resourceId: instance.InstanceId,
      resourceType: 'EC2Instance',
      riskLevel: riskLevel,
      issue: issues.length > 0 ? 
        `EBS 암호화 상태 - ${status}: ${issues.join(', ')}` : 
        'EBS 암호화 상태 - 통과',
      recommendation: recommendation,
      details: {
        instanceId: instance.InstanceId,
        instanceType: instance.InstanceType,
        state: instance.State?.Name,
        status: status,
        totalVolumes: instance.BlockDeviceMappings.length,
        encryptedVolumes: encryptedCount,
        unencryptedVolumes: unencryptedCount,
        rootVolumeEncrypted: rootVolumeEncrypted,
        volumeDetails: volumeDetails,
        summary: {
          criticalIssues: criticalIssues,
          highIssues: highIssues,
          mediumIssues: mediumIssues,
          encryptionRate: Math.round((encryptedCount / instance.BlockDeviceMappings.length) * 100)
        },
        actionItems: [
          !rootVolumeEncrypted ? '루트 볼륨 암호화 활성화 (최우선)' : null,
          unencryptedCount > 0 ? `${unencryptedCount}개의 데이터 볼륨 암호화` : null,
          unencryptedCount > 0 ? '기존 스냅샷 암호화 상태 확인' : null
        ].filter(Boolean),
        securityBenefits: encryptedCount > 0 ? [
          '저장 데이터 암호화로 데이터 유출 위험 감소',
          '규정 준수 요구사항 충족',
          '스냅샷 자동 암호화',
          '성능 영향 최소화'
        ] : []
      },
      category: 'SECURITY'
    });

    this.inspector.addFinding(finding);
  }

  /**
   * EBS 볼륨 암호화 검사 (개별 함수 - 더 이상 사용하지 않음)
   */


  /**
   * 권장사항 생성
   */
  getRecommendations(findings) {
    const recommendations = [];
    
    if (!findings || findings.length === 0) {
      return recommendations;
    }

    const criticalFindings = findings.filter(f => f.riskLevel === 'CRITICAL');
    const highRiskFindings = findings.filter(f => f.riskLevel === 'HIGH');
    
    if (criticalFindings.length > 0) {
      recommendations.push('루트 볼륨 암호화를 즉시 활성화하세요.');
    }
    
    if (highRiskFindings.length > 0) {
      recommendations.push('암호화되지 않은 데이터 볼륨에 암호화를 활성화하세요.');
    }
    
    if (criticalFindings.length > 0 || highRiskFindings.length > 0) {
      recommendations.push('기존 스냅샷의 암호화 상태를 확인하고 필요시 암호화된 복사본을 생성하세요.');
    }
    
    return recommendations;
  }
}

module.exports = EBSEncryptionChecker;