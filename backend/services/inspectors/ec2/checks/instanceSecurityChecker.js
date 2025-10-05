/**
 * Instance Security Checker
 * EC2 인스턴스 보안 관련 검사를 담당하는 모듈
 */

const InspectionFinding = require('../../../../models/InspectionFinding');

class InstanceSecurityChecker {
  constructor(inspector) {
    this.inspector = inspector;
  }

  /**
   * 모든 인스턴스 보안 검사 실행
   */
  async runAllChecks(instances) {
    const activeInstances = instances.filter(instance => 
      instance.State?.Name !== 'terminated' && 
      instance.State?.Name !== 'terminating'
    );

    for (const instance of activeInstances) {
      try {
        // 1. 퍼블릭 IP 노출 검사
        this.checkPublicIPExposure(instance);

        // 2. 인스턴스 모니터링 검사
        this.checkInstanceMonitoring(instance);

        // 3. EBS 암호화 검사
        this.checkEBSEncryption(instance);

        // 4. 인스턴스 태그 검사
        this.checkInstanceTags(instance);

        // 5. 보안 그룹 과다 사용 검사
        this.checkSecurityGroupOveruse(instance);

        // 6. 인스턴스 유형 검사
        this.checkInstanceType(instance);

        // 7. 네트워크 인터페이스 검사
        this.checkNetworkInterfaces(instance);

      } catch (error) {
        this.inspector.recordError(error, {
          operation: 'runAllChecks',
          instanceId: instance.InstanceId
        });
      }
    }
  }

  /**
   * 퍼블릭 IP 노출 검사
   */
  checkPublicIPExposure(instance) {
    if (instance.PublicIpAddress) {
      const finding = InspectionFinding.createEC2Finding(
        instance,
        '인스턴스에 퍼블릭 IP 주소가 할당되어 있습니다',
        '더 나은 보안을 위해 NAT Gateway나 VPN과 함께 프라이빗 서브넷 사용을 고려하세요',
        'MEDIUM'
      );
      finding.details.publicIpAddress = instance.PublicIpAddress;
      finding.details.publicDnsName = instance.PublicDnsName;

      this.inspector.addFinding(finding);
    }

    // Elastic IP 사용 검사
    if (instance.PublicIpAddress && instance.PublicIpAddress === instance.PrivateIpAddress) {
      const finding = InspectionFinding.createEC2Finding(
        instance,
        '인스턴스가 Elastic IP를 사용하고 있습니다',
        'Elastic IP 사용이 필요한지 검토하고, 불필요한 경우 제거하여 비용을 절약하세요',
        'LOW'
      );
      finding.category = 'COST';

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 인스턴스 모니터링 검사
   */
  checkInstanceMonitoring(instance) {
    if (!instance.Monitoring || instance.Monitoring.State !== 'enabled') {
      const finding = InspectionFinding.createEC2Finding(
        instance,
        '이 인스턴스에 대해 세부 모니터링이 활성화되지 않았습니다',
        '인스턴스 성능에 대한 더 나은 가시성을 위해 세부 모니터링을 활성화하세요',
        'LOW'
      );
      finding.category = 'PERFORMANCE';

      this.inspector.addFinding(finding);
    }
  }

  /**
   * EBS 암호화 검사
   */
  checkEBSEncryption(instance) {
    if (instance.BlockDeviceMappings) {
      instance.BlockDeviceMappings.forEach(mapping => {
        if (mapping.Ebs && !mapping.Ebs.Encrypted) {
          const finding = InspectionFinding.createEC2Finding(
            instance,
            `EBS 볼륨 ${mapping.Ebs.VolumeId}이 암호화되지 않았습니다`,
            '저장 데이터 보호를 위해 EBS 암호화를 활성화하세요',
            'HIGH'
          );
          finding.details.unencryptedVolume = {
            volumeId: mapping.Ebs.VolumeId,
            deviceName: mapping.DeviceName,
            volumeSize: mapping.Ebs.VolumeSize
          };

          this.inspector.addFinding(finding);
        }
      });
    }

    // 루트 볼륨 암호화 검사
    const rootDevice = instance.BlockDeviceMappings?.find(mapping => 
      mapping.DeviceName === instance.RootDeviceName
    );

    if (rootDevice && rootDevice.Ebs && !rootDevice.Ebs.Encrypted) {
      const finding = InspectionFinding.createEC2Finding(
        instance,
        '루트 EBS 볼륨이 암호화되지 않았습니다',
        '루트 볼륨 암호화를 활성화하여 시스템 데이터를 보호하세요',
        'HIGH'
      );
      finding.details.rootVolumeId = rootDevice.Ebs.VolumeId;

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 인스턴스 태그 검사
   */
  checkInstanceTags(instance) {
    const requiredTags = ['Environment', 'Owner', 'Purpose', 'Name'];
    const existingTags = instance.Tags?.map(tag => tag.Key) || [];
    
    const missingTags = requiredTags.filter(tag => !existingTags.includes(tag));

    if (missingTags.length > 0) {
      const finding = InspectionFinding.createEC2Finding(
        instance,
        `인스턴스에 필수 태그가 누락되었습니다: ${missingTags.join(', ')}`,
        '리소스 관리와 비용 추적을 위해 필수 태그를 추가하세요',
        'LOW'
      );
      finding.category = 'COMPLIANCE';
      finding.details.missingTags = missingTags;

      this.inspector.addFinding(finding);
    }

    // Name 태그 특별 검사
    const nameTag = instance.Tags?.find(tag => tag.Key === 'Name');
    if (!nameTag || !nameTag.Value || nameTag.Value.trim() === '') {
      const finding = InspectionFinding.createEC2Finding(
        instance,
        '인스턴스에 Name 태그가 없거나 비어있습니다',
        '인스턴스 식별을 위해 의미 있는 Name 태그를 추가하세요',
        'LOW'
      );
      finding.category = 'COMPLIANCE';

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 보안 그룹 과다 사용 검사
   */
  checkSecurityGroupOveruse(instance) {
    if (instance.SecurityGroups && instance.SecurityGroups.length > 5) {
      const finding = InspectionFinding.createEC2Finding(
        instance,
        `인스턴스에 ${instance.SecurityGroups.length}개의 보안 그룹이 연결되어 있습니다`,
        '관리를 단순화하기 위해 보안 그룹 통합을 고려하세요',
        'LOW'
      );
      finding.category = 'RELIABILITY';
      finding.details.securityGroupCount = instance.SecurityGroups.length;
      finding.details.securityGroups = instance.SecurityGroups.map(sg => ({
        groupId: sg.GroupId,
        groupName: sg.GroupName
      }));

      this.inspector.addFinding(finding);
    }

    // 기본 보안 그룹 사용 검사
    const hasDefaultSG = instance.SecurityGroups?.some(sg => sg.GroupName === 'default');
    if (hasDefaultSG) {
      const finding = InspectionFinding.createEC2Finding(
        instance,
        '인스턴스가 기본 보안 그룹을 사용하고 있습니다',
        '보안을 강화하기 위해 전용 보안 그룹을 생성하여 사용하세요',
        'MEDIUM'
      );

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 인스턴스 유형 검사
   */
  checkInstanceType(instance) {
    // 이전 세대 인스턴스 유형 검사
    const oldGenerationTypes = ['t1', 't2.nano', 't2.micro', 'm1', 'm2', 'm3', 'c1', 'c3', 'r3', 'i2', 'd2'];
    const instanceFamily = instance.InstanceType?.split('.')[0];

    if (oldGenerationTypes.includes(instanceFamily) || oldGenerationTypes.includes(instance.InstanceType)) {
      const finding = InspectionFinding.createEC2Finding(
        instance,
        `인스턴스가 이전 세대 유형(${instance.InstanceType})을 사용하고 있습니다`,
        '더 나은 성능과 비용 효율성을 위해 최신 세대 인스턴스 유형으로 업그레이드를 고려하세요',
        'LOW'
      );
      finding.category = 'PERFORMANCE';
      finding.details.instanceType = instance.InstanceType;

      this.inspector.addFinding(finding);
    }

    // 버스터블 인스턴스 크레딧 검사 (T 시리즈)
    if (instance.InstanceType?.startsWith('t')) {
      const finding = InspectionFinding.createEC2Finding(
        instance,
        `버스터블 인스턴스(${instance.InstanceType})를 사용하고 있습니다`,
        'CPU 크레딧 사용량을 모니터링하고 필요시 무제한 모드를 고려하세요',
        'LOW'
      );
      finding.category = 'PERFORMANCE';
      finding.details.instanceType = instance.InstanceType;

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 네트워크 인터페이스 검사
   */
  checkNetworkInterfaces(instance) {
    if (instance.NetworkInterfaces && instance.NetworkInterfaces.length > 1) {
      const finding = InspectionFinding.createEC2Finding(
        instance,
        `인스턴스에 ${instance.NetworkInterfaces.length}개의 네트워크 인터페이스가 연결되어 있습니다`,
        '복잡한 네트워크 구성이 필요한지 검토하고 불필요한 인터페이스는 제거하세요',
        'LOW'
      );
      finding.category = 'RELIABILITY';
      finding.details.networkInterfaceCount = instance.NetworkInterfaces.length;

      this.inspector.addFinding(finding);
    }

    // 소스/대상 확인 비활성화 검사
    instance.NetworkInterfaces?.forEach((eni, index) => {
      if (eni.SourceDestCheck === false) {
        const finding = InspectionFinding.createEC2Finding(
          instance,
          `네트워크 인터페이스 ${index + 1}에서 소스/대상 확인이 비활성화되어 있습니다`,
          'NAT 인스턴스나 라우터가 아닌 경우 소스/대상 확인을 활성화하세요',
          'MEDIUM'
        );
        finding.details.networkInterfaceId = eni.NetworkInterfaceId;

        this.inspector.addFinding(finding);
      }
    });
  }

  /**
   * 인스턴스 상태 검사
   */
  checkInstanceState(instance) {
    // 중지된 인스턴스 장기간 방치 검사
    if (instance.State?.Name === 'stopped') {
      const stateTransitionTime = new Date(instance.StateTransitionReason);
      const daysStopped = (Date.now() - stateTransitionTime.getTime()) / (1000 * 60 * 60 * 24);

      if (daysStopped > 30) {
        const finding = InspectionFinding.createEC2Finding(
          instance,
          `인스턴스가 ${Math.floor(daysStopped)}일 동안 중지 상태입니다`,
          '장기간 사용하지 않는 인스턴스는 종료를 고려하여 비용을 절약하세요',
          'LOW'
        );
        finding.category = 'COST';
        finding.details.daysStopped = Math.floor(daysStopped);

        this.inspector.addFinding(finding);
      }
    }
  }

  /**
   * 권장사항 생성
   */
  getRecommendations(findings) {
    const recommendations = [];
    const instanceFindings = findings.filter(f => f.resourceType === 'EC2Instance');

    if (instanceFindings.length > 0) {
      // 암호화 관련 권장사항
      const encryptionFindings = instanceFindings.filter(f =>
        f.issue.includes('암호화') || f.issue.includes('encrypted')
      );
      if (encryptionFindings.length > 0) {
        recommendations.push('모든 EBS 볼륨에 대해 암호화를 활성화하여 데이터를 보호하세요.');
      }

      // 퍼블릭 IP 관련 권장사항
      const publicIpFindings = instanceFindings.filter(f =>
        f.issue.includes('퍼블릭') || f.issue.includes('public')
      );
      if (publicIpFindings.length > 0) {
        recommendations.push('가능한 한 프라이빗 서브넷을 사용하고 NAT Gateway를 통해 인터넷 접근을 제어하세요.');
      }

      // 모니터링 관련 권장사항
      const monitoringFindings = instanceFindings.filter(f =>
        f.issue.includes('모니터링') || f.issue.includes('monitoring')
      );
      if (monitoringFindings.length > 0) {
        recommendations.push('CloudWatch 세부 모니터링을 활성화하여 인스턴스 성능을 추적하세요.');
      }

      // 태그 관련 권장사항
      const tagFindings = instanceFindings.filter(f =>
        f.issue.includes('태그') || f.issue.includes('tag')
      );
      if (tagFindings.length > 0) {
        recommendations.push('일관된 태깅 전략을 구현하여 리소스 관리와 비용 추적을 개선하세요.');
      }
    }

    return recommendations;
  }
}

module.exports = InstanceSecurityChecker;