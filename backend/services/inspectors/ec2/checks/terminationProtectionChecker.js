/**
 * Termination Protection Checker
 * 인스턴스 종료 보호 설정을 검사하는 모듈
 */

const { EC2Client, DescribeInstancesCommand, DescribeInstanceAttributeCommand } = require('@aws-sdk/client-ec2');
const InspectionFinding = require('../../../../models/InspectionFinding');

class TerminationProtectionChecker {
  constructor(inspector) {
    this.inspector = inspector;
  }

  /**
   * 종료 보호 검사 실행
   */
  async runAllChecks(instances) {
    const activeInstances = instances.filter(instance => 
      instance.State?.Name !== 'terminated' && 
      instance.State?.Name !== 'terminating'
    );

    if (activeInstances.length === 0) {
      const finding = new InspectionFinding({
        resourceId: 'no-instances',
        resourceType: 'EC2Instance',
        riskLevel: 'LOW',
        issue: '인스턴스가 없어 종료 보호 검사가 불필요합니다',
        recommendation: '중요한 인스턴스 생성 시 종료 보호를 활성화하세요',
        details: {
          totalInstances: instances.length,
          activeInstances: activeInstances.length,
          status: '현재 종료 보호 관련 위험이 없습니다',
          bestPractices: [
            '프로덕션 인스턴스에 종료 보호 필수',
            '데이터베이스 서버에 종료 보호 권장',
            '중요한 애플리케이션 서버 보호'
          ]
        },
        category: 'COMPLIANCE'
      });
      
      this.inspector.addFinding(finding);
      return;
    }

    let criticalInstances = 0;
    let protectedInstances = 0;

    for (const instance of activeInstances) {
      try {
        // 중요한 인스턴스인지 확인
        const isCritical = this.isCriticalInstance(instance);
        if (isCritical) {
          criticalInstances++;
          
          // 종료 보호 상태 확인 (실제 API 호출)
          const isProtected = await this.checkTerminationProtection(instance.InstanceId);
          
          if (isProtected) {
            protectedInstances++;
          } else {
            // 보호되지 않은 중요 인스턴스에 대한 권고사항 생성
            this.addTerminationProtectionFinding(instance);
          }
        }

      } catch (error) {
        this.inspector.recordError(error, {
          operation: 'runAllChecks',
          instanceId: instance.InstanceId
        });
      }
    }

    // 중요한 인스턴스가 없는 경우
    if (criticalInstances === 0) {
      const finding = new InspectionFinding({
        resourceId: 'no-critical-instances',
        resourceType: 'EC2Instance',
        riskLevel: 'LOW',
        issue: `${activeInstances.length}개의 인스턴스가 있지만 종료 보호가 필요한 중요 인스턴스는 없습니다`,
        recommendation: '중요한 인스턴스 생성 시 종료 보호를 활성화하세요',
        details: {
          totalInstances: activeInstances.length,
          criticalInstances: 0,
          status: '현재 중요한 인스턴스가 없어 종료 보호 위험이 낮습니다',
          criticalInstanceCriteria: [
            '이름에 prod, production, critical, important 포함',
            '데이터베이스 관련 키워드 포함',
            'Environment 태그가 production',
            '고비용 인스턴스 (xlarge 이상)'
          ]
        },
        category: 'COMPLIANCE'
      });
      
      this.inspector.addFinding(finding);
    }
    // 모든 중요 인스턴스가 보호되고 있는 경우
    else if (criticalInstances === protectedInstances) {
      const finding = new InspectionFinding({
        resourceId: 'all-critical-protected',
        resourceType: 'EC2Instance',
        riskLevel: 'LOW',
        issue: `${criticalInstances}개의 중요 인스턴스가 모두 종료 보호로 안전하게 보호되고 있습니다`,
        recommendation: '현재 보안 상태가 우수합니다. 새로운 중요 인스턴스 생성 시에도 종료 보호를 유지하세요',
        details: {
          totalInstances: activeInstances.length,
          criticalInstances: criticalInstances,
          protectedInstances: protectedInstances,
          status: '모든 중요 인스턴스가 종료 보호로 보호되어 보안 상태가 우수합니다',
          protectionBenefits: [
            '실수로 인한 인스턴스 삭제 방지',
            '중요한 데이터 및 서비스 보호',
            '비즈니스 연속성 보장',
            '복구 시간 및 비용 절약'
          ]
        },
        category: 'COMPLIANCE'
      });
      
      this.inspector.addFinding(finding);
    }
  }

  /**
   * 종료 보호 상태 확인
   */
  async checkTerminationProtection(instanceId) {
    try {
      const command = new DescribeInstanceAttributeCommand({
        InstanceId: instanceId,
        Attribute: 'disableApiTermination'
      });
      
      const response = await this.inspector.ec2Client.send(command);
      return response.DisableApiTermination?.Value || false;
    } catch (error) {
      console.error(`인스턴스 ${instanceId} 종료 보호 상태 확인 실패:`, error);
      return false; // 확인할 수 없는 경우 보호되지 않은 것으로 간주
    }
  }

  /**
   * 종료 보호 권고사항 추가
   */
  addTerminationProtectionFinding(instance) {
    const instanceName = this.getInstanceName(instance);
    const environment = this.getInstanceEnvironment(instance);
    const criticalityReasons = this.getCriticalityReasons(instance);
    
    let riskLevel = 'MEDIUM';
    let issue = '중요한 인스턴스에 종료 보호 설정이 권장됩니다';
    
    if (this.isDatabaseInstance(instance)) {
      riskLevel = 'HIGH';
      issue = '데이터베이스 인스턴스에 종료 보호 설정이 필요합니다';
    } else if (environment === 'production') {
      riskLevel = 'HIGH';
      issue = '프로덕션 인스턴스에 종료 보호 설정이 필요합니다';
    }

    const finding = new InspectionFinding({
      resourceId: instance.InstanceId,
      resourceType: 'EC2Instance',
      riskLevel: riskLevel,
      issue: issue,
      recommendation: 'EC2 콘솔에서 인스턴스 선택 → Actions → Instance Settings → Change termination protection을 클릭하여 활성화하세요.',
      details: {
        instanceId: instance.InstanceId,
        instanceName: instanceName,
        instanceType: instance.InstanceType,
        environment: environment,
        criticalityReasons: criticalityReasons,
        currentProtectionStatus: 'DISABLED',
        riskFactors: [
          '실수로 인한 인스턴스 삭제 가능',
          '중요한 데이터 및 서비스 손실 위험',
          '비즈니스 연속성 중단 가능성',
          '복구 시간 및 비용 발생'
        ],
        howToEnable: [
          'AWS 콘솔: 인스턴스 선택 → Actions → Instance Settings → Change termination protection',
          'AWS CLI: aws ec2 modify-instance-attribute --instance-id ' + instance.InstanceId + ' --disable-api-termination',
          'CloudFormation: DeletionPolicy: Retain 설정',
          'Terraform: prevent_destroy = true 설정'
        ]
      },
      category: 'RELIABILITY'
    });

    this.inspector.addFinding(finding);
  }



  /**
   * 중요한 인스턴스 여부 확인
   */
  isCriticalInstance(instance) {
    const name = this.getInstanceName(instance).toLowerCase();
    const criticalKeywords = ['prod', 'production', 'critical', 'important', 'master', 'primary'];
    
    return criticalKeywords.some(keyword => name.includes(keyword));
  }

  /**
   * 데이터베이스 인스턴스 여부 확인
   */
  isDatabaseInstance(instance) {
    const name = this.getInstanceName(instance).toLowerCase();
    const dbKeywords = ['db', 'database', 'mysql', 'postgres', 'postgresql', 'oracle', 'mongo', 'redis'];
    
    return dbKeywords.some(keyword => name.includes(keyword));
  }

  /**
   * 고비용 인스턴스 여부 확인
   */
  isHighCostInstance(instance) {
    const instanceType = instance.InstanceType;
    
    // xlarge 이상 또는 특수 인스턴스 타입
    const highCostPatterns = [
      /\.(xlarge|2xlarge|4xlarge|8xlarge|12xlarge|16xlarge|24xlarge)$/,
      /^(c5n|m5n|r5n|i3|x1|z1d|p3|p4|g4|inf1)\./,
      /^(t3|t4g)\.(xlarge|2xlarge)$/
    ];

    return highCostPatterns.some(pattern => pattern.test(instanceType));
  }

  /**
   * 데이터베이스 타입 추정
   */
  guessDatabaseType(instance) {
    const name = this.getInstanceName(instance).toLowerCase();
    
    if (name.includes('mysql')) return 'MySQL';
    if (name.includes('postgres') || name.includes('postgresql')) return 'PostgreSQL';
    if (name.includes('oracle')) return 'Oracle';
    if (name.includes('mongo')) return 'MongoDB';
    if (name.includes('redis')) return 'Redis';
    if (name.includes('elastic')) return 'Elasticsearch';
    
    return 'Unknown Database';
  }

  /**
   * 시간당 비용 추정
   */
  estimateHourlyCost(instanceType) {
    // 대략적인 비용 추정 (실제 비용은 리전별로 다름)
    const costMap = {
      't3.micro': '$0.0104',
      't3.small': '$0.0208',
      't3.medium': '$0.0416',
      't3.large': '$0.0832',
      't3.xlarge': '$0.1664',
      'm5.large': '$0.096',
      'm5.xlarge': '$0.192',
      'm5.2xlarge': '$0.384',
      'c5.large': '$0.085',
      'c5.xlarge': '$0.17',
      'r5.large': '$0.126',
      'r5.xlarge': '$0.252'
    };

    return costMap[instanceType] || '$0.10+';
  }

  /**
   * 인스턴스 환경 추정
   */
  getInstanceEnvironment(instance) {
    const tags = instance.Tags || [];
    const envTag = tags.find(tag => 
      tag.Key.toLowerCase().includes('environment') || 
      tag.Key.toLowerCase().includes('env')
    );

    if (envTag) {
      const env = envTag.Value.toLowerCase();
      if (env.includes('prod')) return 'production';
      if (env.includes('dev')) return 'development';
      if (env.includes('test')) return 'testing';
      if (env.includes('stage')) return 'staging';
    }

    const name = this.getInstanceName(instance).toLowerCase();
    if (name.includes('prod')) return 'production';
    if (name.includes('dev')) return 'development';
    if (name.includes('test')) return 'testing';

    return 'unknown';
  }

  /**
   * 중요도 이유 반환
   */
  getCriticalityReasons(instance) {
    const reasons = [];
    const name = this.getInstanceName(instance).toLowerCase();
    
    if (name.includes('prod') || name.includes('production')) {
      reasons.push('프로덕션 환경');
    }
    if (name.includes('critical') || name.includes('important')) {
      reasons.push('중요 시스템으로 명명');
    }
    if (name.includes('master') || name.includes('primary')) {
      reasons.push('마스터/주요 서버');
    }
    if (this.isDatabaseInstance(instance)) {
      reasons.push('데이터베이스 서버');
    }
    if (this.isHighCostInstance(instance)) {
      reasons.push('고비용 인스턴스');
    }

    return reasons.length > 0 ? reasons : ['일반적인 보호 권장'];
  }

  /**
   * 인스턴스 이름 추출
   */
  getInstanceName(instance) {
    const nameTag = instance.Tags?.find(tag => tag.Key === 'Name');
    return nameTag?.Value || 'Unnamed';
  }


}

module.exports = TerminationProtectionChecker;