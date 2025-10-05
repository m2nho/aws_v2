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
        riskLevel: 'LOW',
        issue: '검사할 EC2 인스턴스가 없습니다',
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
        // 1. EBS 볼륨 암호화 검사
        this.checkEBSVolumeEncryption(instance);

        // 2. 루트 볼륨 암호화 검사
        this.checkRootVolumeEncryption(instance);

        // 3. 스냅샷 암호화 검사
        this.checkSnapshotEncryption(instance);

      } catch (error) {
        this.inspector.recordError(error, {
          operation: 'runAllChecks',
          instanceId: instance.InstanceId
        });
      }
    }
  }

  /**
   * EBS 볼륨 암호화 검사
   */
  checkEBSVolumeEncryption(instance) {
    if (!instance.BlockDeviceMappings) return;

    let unencryptedVolumes = [];
    let encryptedVolumes = [];

    instance.BlockDeviceMappings.forEach(mapping => {
      if (mapping.Ebs) {
        if (!mapping.Ebs.Encrypted) {
          unencryptedVolumes.push({
            volumeId: mapping.Ebs.VolumeId,
            deviceName: mapping.DeviceName,
            volumeSize: mapping.Ebs.VolumeSize
          });
        } else {
          encryptedVolumes.push(mapping.Ebs.VolumeId);
        }
      }
    });

    // 암호화되지 않은 볼륨이 있는 경우
    if (unencryptedVolumes.length > 0) {
      const finding = new InspectionFinding({
        resourceId: instance.InstanceId,
        resourceType: 'EC2Instance',
        riskLevel: 'HIGH',
        issue: `${unencryptedVolumes.length}개의 EBS 볼륨이 암호화되지 않았습니다`,
        recommendation: '저장 데이터 보호를 위해 모든 EBS 볼륨에 암호화를 활성화하세요',
        details: {
          instanceId: instance.InstanceId,
          unencryptedVolumes: unencryptedVolumes,
          encryptedVolumes: encryptedVolumes,
          totalVolumes: instance.BlockDeviceMappings.length
        },
        category: 'SECURITY'
      });

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 루트 볼륨 암호화 검사
   */
  checkRootVolumeEncryption(instance) {
    if (!instance.BlockDeviceMappings || !instance.RootDeviceName) return;

    const rootDevice = instance.BlockDeviceMappings.find(mapping => 
      mapping.DeviceName === instance.RootDeviceName
    );

    if (rootDevice && rootDevice.Ebs && !rootDevice.Ebs.Encrypted) {
      const finding = new InspectionFinding({
        resourceId: instance.InstanceId,
        resourceType: 'EC2Instance',
        riskLevel: 'CRITICAL',
        issue: '루트 EBS 볼륨이 암호화되지 않았습니다',
        recommendation: '루트 볼륨 암호화를 활성화하여 시스템 데이터를 보호하세요',
        details: {
          instanceId: instance.InstanceId,
          rootVolumeId: rootDevice.Ebs.VolumeId,
          rootDeviceName: instance.RootDeviceName,
          volumeSize: rootDevice.Ebs.VolumeSize
        },
        category: 'SECURITY'
      });

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 스냅샷 암호화 검사 (간접적)
   */
  checkSnapshotEncryption(instance) {
    if (!instance.BlockDeviceMappings) return;

    // EBS 볼륨이 암호화되지 않은 경우 스냅샷도 암호화되지 않을 가능성이 높음
    const unencryptedVolumes = instance.BlockDeviceMappings.filter(mapping => 
      mapping.Ebs && !mapping.Ebs.Encrypted
    );

    if (unencryptedVolumes.length > 0) {
      const finding = new InspectionFinding({
        resourceId: instance.InstanceId,
        resourceType: 'EC2Instance',
        riskLevel: 'MEDIUM',
        issue: '암호화되지 않은 볼륨의 스냅샷도 암호화되지 않을 수 있습니다',
        recommendation: '볼륨 암호화를 활성화하고 기존 스냅샷의 암호화 상태를 확인하세요',
        details: {
          instanceId: instance.InstanceId,
          unencryptedVolumeCount: unencryptedVolumes.length,
          affectedVolumes: unencryptedVolumes.map(v => v.Ebs.VolumeId)
        },
        category: 'SECURITY'
      });

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 권장사항 생성
   */
  getRecommendations(findings) {
    const recommendations = [];
    const ebsFindings = findings.filter(f => 
      f.issue.includes('EBS') || f.issue.includes('볼륨') || f.issue.includes('암호화')
    );

    if (ebsFindings.length > 0) {
      recommendations.push('모든 EBS 볼륨에 대해 암호화를 활성화하여 데이터를 보호하세요.');
      
      const rootVolumeFindings = ebsFindings.filter(f => 
        f.issue.includes('루트') || f.issue.includes('root')
      );
      if (rootVolumeFindings.length > 0) {
        recommendations.push('루트 볼륨 암호화는 특히 중요하므로 우선적으로 처리하세요.');
      }

      const snapshotFindings = ebsFindings.filter(f => 
        f.issue.includes('스냅샷') || f.issue.includes('snapshot')
      );
      if (snapshotFindings.length > 0) {
        recommendations.push('기존 스냅샷의 암호화 상태를 확인하고 필요시 암호화된 복사본을 생성하세요.');
      }
    }

    return recommendations;
  }
}

module.exports = EBSEncryptionChecker;