/**
 * Key Pair Checker
 * EC2 키 페어 관련 검사를 담당하는 모듈
 */

const InspectionFinding = require('../../../../models/InspectionFinding');

class KeyPairChecker {
  constructor(inspector) {
    this.inspector = inspector;
  }

  /**
   * 모든 키 페어 검사 실행
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
        recommendation: 'EC2 인스턴스가 생성되면 키 페어 설정을 검토하세요',
        details: {
          totalInstances: instances.length,
          activeInstances: activeInstances.length,
          reason: '활성 상태의 EC2 인스턴스가 없어 키 페어 검사를 수행할 수 없습니다'
        },
        category: 'COMPLIANCE'
      });
      
      this.inspector.addFinding(finding);
      return;
    }

    for (const instance of activeInstances) {
      try {
        // 1. 키 페어 설정 검사
        this.checkKeyPairConfiguration(instance);

        // 2. 키 페어 보안 검사
        this.checkKeyPairSecurity(instance);

        // 3. 대체 접근 방법 검사
        this.checkAlternativeAccess(instance);

      } catch (error) {
        this.inspector.recordError(error, {
          operation: 'runAllChecks',
          instanceId: instance.InstanceId
        });
      }
    }

    // 전체 키 페어 사용 패턴 분석
    this.analyzeKeyPairUsagePatterns(activeInstances);
  }

  /**
   * 키 페어 설정 검사
   */
  checkKeyPairConfiguration(instance) {
    if (!instance.KeyName) {
      const finding = InspectionFinding.createEC2Finding(
        instance,
        'EC2 인스턴스에 키 페어가 설정되지 않았습니다',
        'SSH 접근을 위해 키 페어를 설정하거나 Session Manager를 사용하세요',
        'MEDIUM'
      );
      finding.details.hasKeyPair = false;
      finding.details.alternativeAccess = 'Session Manager 권장';

      this.inspector.addFinding(finding);
    } else {
      // 키 페어 이름 검사
      this.checkKeyPairNaming(instance);
    }
  }

  /**
   * 키 페어 이름 규칙 검사
   */
  checkKeyPairNaming(instance) {
    const keyName = instance.KeyName;
    
    // 기본 키 이름이나 의미없는 이름 검사
    const problematicNames = [
      'default', 'test', 'temp', 'temporary', 'key', 'keypair',
      'my-key', 'aws-key', 'ec2-key'
    ];

    if (problematicNames.includes(keyName.toLowerCase())) {
      const finding = InspectionFinding.createEC2Finding(
        instance,
        `키 페어 이름이 일반적이거나 의미가 없습니다: ${keyName}`,
        '키 페어 이름을 더 구체적이고 의미있게 설정하세요 (예: project-env-role)',
        'LOW'
      );
      finding.category = 'COMPLIANCE';
      finding.details.keyName = keyName;

      this.inspector.addFinding(finding);
    }

    // 키 이름에 환경이나 목적이 포함되어 있는지 검사
    const hasEnvironment = /\b(dev|test|staging|prod|production)\b/i.test(keyName);
    const hasPurpose = /\b(web|db|app|admin|bastion|jump)\b/i.test(keyName);

    if (!hasEnvironment && !hasPurpose) {
      const finding = InspectionFinding.createEC2Finding(
        instance,
        `키 페어 이름에 환경이나 목적이 명시되지 않았습니다: ${keyName}`,
        '키 페어 이름에 환경(dev/prod)이나 목적(web/db)을 포함하여 관리를 개선하세요',
        'LOW'
      );
      finding.category = 'COMPLIANCE';
      finding.details.keyName = keyName;

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 키 페어 보안 검사
   */
  checkKeyPairSecurity(instance) {
    if (!instance.KeyName) return;

    // 공유 키 페어 사용 검사는 전체 분석에서 수행
    
    // Windows 인스턴스에서 키 페어 사용 검사
    if (this.isWindowsInstance(instance) && instance.KeyName) {
      const finding = InspectionFinding.createEC2Finding(
        instance,
        'Windows 인스턴스에서 키 페어를 사용하고 있습니다',
        'Windows 인스턴스는 RDP를 사용하므로 키 페어가 필요하지 않을 수 있습니다',
        'LOW'
      );
      finding.category = 'COMPLIANCE';
      finding.details.platform = 'Windows';
      finding.details.keyName = instance.KeyName;

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 대체 접근 방법 검사
   */
  checkAlternativeAccess(instance) {
    // Session Manager 사용 가능성 검사
    if (instance.IamInstanceProfile) {
      // IAM 역할이 있으면 Session Manager 사용 가능
      if (!instance.KeyName) {
        const finding = InspectionFinding.createEC2Finding(
          instance,
          'IAM 역할이 있는 인스턴스에서 Session Manager 사용을 권장합니다',
          'SSH 키 대신 AWS Systems Manager Session Manager를 사용하여 보안을 강화하세요',
          'LOW'
        );
        finding.category = 'SECURITY';
        finding.details.hasIamRole = true;
        finding.details.sessionManagerRecommended = true;

        this.inspector.addFinding(finding);
      }
    } else if (instance.KeyName) {
      // IAM 역할이 없으면 Session Manager 사용 불가
      const finding = InspectionFinding.createEC2Finding(
        instance,
        'Session Manager 사용을 위해 IAM 역할이 필요합니다',
        'SSM Agent와 적절한 IAM 역할을 설정하여 Session Manager를 사용하세요',
        'LOW'
      );
      finding.category = 'SECURITY';
      finding.details.hasIamRole = false;
      finding.details.keyName = instance.KeyName;

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 키 페어 사용 패턴 분석
   */
  analyzeKeyPairUsagePatterns(instances) {
    const keyPairUsage = new Map();
    const instancesWithoutKeys = [];

    // 키 페어 사용 현황 수집
    instances.forEach(instance => {
      if (instance.KeyName) {
        if (!keyPairUsage.has(instance.KeyName)) {
          keyPairUsage.set(instance.KeyName, []);
        }
        keyPairUsage.get(instance.KeyName).push(instance);
      } else {
        instancesWithoutKeys.push(instance);
      }
    });

    // 과도하게 공유되는 키 페어 검사
    keyPairUsage.forEach((instanceList, keyName) => {
      if (instanceList.length > 10) {
        instanceList.forEach(instance => {
          const finding = InspectionFinding.createEC2Finding(
            instance,
            `키 페어 '${keyName}'이 ${instanceList.length}개의 인스턴스에서 공유되고 있습니다`,
            '보안을 위해 키 페어를 더 세분화하거나 Session Manager 사용을 고려하세요',
            'MEDIUM'
          );
          finding.details.keyName = keyName;
          finding.details.sharedInstanceCount = instanceList.length;

          this.inspector.addFinding(finding);
        });
      }
    });

    // 환경별 키 페어 분리 검사
    this.checkEnvironmentKeyPairSeparation(keyPairUsage);

    // 키 페어 없는 인스턴스 비율 검사
    if (instancesWithoutKeys.length > 0) {
      const totalInstances = instances.length;
      const noKeyPercentage = (instancesWithoutKeys.length / totalInstances) * 100;

      if (noKeyPercentage > 50) {
        // 대부분의 인스턴스에 키가 없으면 Session Manager 사용 권장
        instancesWithoutKeys.slice(0, 1).forEach(instance => {
          const finding = InspectionFinding.createEC2Finding(
            instance,
            `전체 인스턴스의 ${noKeyPercentage.toFixed(1)}%가 키 페어를 사용하지 않습니다`,
            'Session Manager나 다른 안전한 접근 방법을 표준화하는 것을 고려하세요',
            'LOW'
          );
          finding.category = 'COMPLIANCE';
          finding.details.noKeyPercentage = noKeyPercentage;

          this.inspector.addFinding(finding);
        });
      }
    }
  }

  /**
   * 환경별 키 페어 분리 검사
   */
  checkEnvironmentKeyPairSeparation(keyPairUsage) {
    keyPairUsage.forEach((instanceList, keyName) => {
      const environments = new Set();
      
      instanceList.forEach(instance => {
        // 태그에서 환경 정보 추출
        const envTag = instance.Tags?.find(tag => 
          ['Environment', 'Env', 'Stage'].includes(tag.Key)
        );
        
        if (envTag) {
          environments.add(envTag.Value.toLowerCase());
        } else {
          // 인스턴스 이름에서 환경 추정
          const nameTag = instance.Tags?.find(tag => tag.Key === 'Name');
          if (nameTag) {
            const name = nameTag.Value.toLowerCase();
            if (name.includes('prod')) environments.add('production');
            else if (name.includes('dev')) environments.add('development');
            else if (name.includes('test')) environments.add('test');
            else if (name.includes('staging')) environments.add('staging');
          }
        }
      });

      // 여러 환경에서 같은 키를 사용하는 경우
      if (environments.size > 1) {
        instanceList.slice(0, 1).forEach(instance => {
          const finding = InspectionFinding.createEC2Finding(
            instance,
            `키 페어 '${keyName}'이 여러 환경(${Array.from(environments).join(', ')})에서 사용됩니다`,
            '환경별로 별도의 키 페어를 사용하여 보안을 강화하세요',
            'MEDIUM'
          );
          finding.details.keyName = keyName;
          finding.details.environments = Array.from(environments);
          finding.details.crossEnvironmentUsage = true;

          this.inspector.addFinding(finding);
        });
      }
    });
  }

  /**
   * Windows 인스턴스 여부 확인
   */
  isWindowsInstance(instance) {
    // Platform 필드로 확인
    if (instance.Platform === 'windows') {
      return true;
    }

    // AMI 이름이나 설명으로 추정
    if (instance.ImageId) {
      // Windows AMI는 보통 ami-로 시작하고 특정 패턴을 가짐
      // 실제로는 DescribeImages API를 호출해야 하지만 여기서는 간단히 추정
    }

    // 인스턴스 유형으로 추정 (완벽하지 않음)
    const windowsLikelyTypes = ['m5.large', 'm5.xlarge', 'm5.2xlarge'];
    
    return false; // 기본값
  }

  /**
   * 키 페어 로테이션 권장사항 검사
   */
  checkKeyPairRotation(instances) {
    const keyPairUsage = new Map();
    
    instances.forEach(instance => {
      if (instance.KeyName) {
        if (!keyPairUsage.has(instance.KeyName)) {
          keyPairUsage.set(instance.KeyName, {
            instances: [],
            oldestLaunchTime: instance.LaunchTime,
            newestLaunchTime: instance.LaunchTime
          });
        }
        
        const usage = keyPairUsage.get(instance.KeyName);
        usage.instances.push(instance);
        
        if (instance.LaunchTime < usage.oldestLaunchTime) {
          usage.oldestLaunchTime = instance.LaunchTime;
        }
        if (instance.LaunchTime > usage.newestLaunchTime) {
          usage.newestLaunchTime = instance.LaunchTime;
        }
      }
    });

    // 오래된 키 페어 사용 검사
    keyPairUsage.forEach((usage, keyName) => {
      const oldestDate = new Date(usage.oldestLaunchTime);
      const daysSinceOldest = (Date.now() - oldestDate.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceOldest > 365) { // 1년 이상
        usage.instances.slice(0, 1).forEach(instance => {
          const finding = InspectionFinding.createEC2Finding(
            instance,
            `키 페어 '${keyName}'이 ${Math.floor(daysSinceOldest)}일 동안 사용되고 있습니다`,
            '보안을 위해 정기적인 키 페어 로테이션을 고려하세요',
            'LOW'
          );
          finding.category = 'SECURITY';
          finding.details.keyName = keyName;
          finding.details.daysSinceOldest = Math.floor(daysSinceOldest);

          this.inspector.addFinding(finding);
        });
      }
    });
  }

  /**
   * 권장사항 생성
   */
  getRecommendations(findings) {
    const recommendations = [];
    const keyPairFindings = findings.filter(f => 
      f.issue.includes('키 페어') || f.issue.includes('key pair') ||
      f.issue.includes('KeyName')
    );

    if (keyPairFindings.length > 0) {
      recommendations.push('키 페어 관리 정책을 수립하고 정기적인 로테이션을 실시하세요.');
      
      const sharedKeyFindings = keyPairFindings.filter(f => 
        f.issue.includes('공유') || f.issue.includes('shared')
      );
      if (sharedKeyFindings.length > 0) {
        recommendations.push('키 페어를 환경별, 역할별로 분리하여 보안을 강화하세요.');
      }

      const sessionManagerFindings = keyPairFindings.filter(f => 
        f.issue.includes('Session Manager')
      );
      if (sessionManagerFindings.length > 0) {
        recommendations.push('AWS Systems Manager Session Manager를 사용하여 키 기반 접근을 대체하세요.');
      }

      const namingFindings = keyPairFindings.filter(f => 
        f.issue.includes('이름') || f.issue.includes('naming')
      );
      if (namingFindings.length > 0) {
        recommendations.push('키 페어 명명 규칙을 수립하여 관리를 개선하세요.');
      }
    }

    return recommendations;
  }
}

module.exports = KeyPairChecker;