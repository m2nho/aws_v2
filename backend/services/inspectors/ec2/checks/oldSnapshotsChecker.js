/**
 * Old Snapshots Checker
 * 오래된 EBS 스냅샷을 검사하는 모듈
 */

const InspectionFinding = require('../../../../models/InspectionFinding');

class OldSnapshotsChecker {
  constructor(inspector) {
    this.inspector = inspector;
  }

  /**
   * 오래된 스냅샷 검사 실행
   */
  async runAllChecks(instances) {
    try {
      // 1. 스냅샷 정리 권장사항 (실제 API 호출 없이 추정)
      this.checkSnapshotCleanupRecommendations(instances);

      // 2. 스냅샷 보존 정책 권장사항
      this.checkSnapshotRetentionPolicy(instances);

      // 3. 자동 스냅샷 생성 권장사항
      this.checkAutomaticSnapshotRecommendations(instances);

    } catch (error) {
      this.inspector.recordError(error, {
        operation: 'runAllChecks'
      });
    }
  }

  /**
   * 스냅샷 정리 권장사항
   */
  checkSnapshotCleanupRecommendations(instances) {
    const instancesWithEbs = instances.filter(instance => 
      instance.BlockDeviceMappings && instance.BlockDeviceMappings.length > 0
    );

    if (instancesWithEbs.length > 0) {
      const finding = new InspectionFinding({
        resourceId: 'snapshot-cleanup-needed',
        resourceType: 'EBSSnapshot',
        riskLevel: 'MEDIUM',
        issue: `${instancesWithEbs.length}개의 인스턴스에 EBS 볼륨이 연결되어 있어 스냅샷 관리가 필요합니다 (기준: EBS 볼륨 보유 인스턴스)`,
        recommendation: '정기적으로 오래된 스냅샷을 확인하고 불필요한 스냅샷을 삭제하세요',
        details: {
          detectionCriteria: {
            method: 'EBS 볼륨 연결 상태 확인',
            condition: 'BlockDeviceMappings에 EBS 볼륨이 1개 이상 존재',
            recommendation: '90일 이상 된 스냅샷을 우선 검토 대상으로 권장'
          },
          instancesWithEbs: instancesWithEbs.length,
          totalVolumes: instancesWithEbs.reduce((sum, instance) => 
            sum + (instance.BlockDeviceMappings?.length || 0), 0
          ),
          snapshotManagementTasks: [
            'AWS 콘솔에서 스냅샷 목록 확인',
            '90일 이상 된 스냅샷 식별',
            '연결된 볼륨이 삭제된 스냅샷 확인',
            '중복 스냅샷 정리'
          ],
          costImpact: [
            '스냅샷 스토리지 비용 (GB당 $0.05/월)',
            '불필요한 스냅샷으로 인한 비용 증가',
            '관리 복잡성 증가'
          ],
          retentionGuidelines: {
            daily: '7일 보존',
            weekly: '4주 보존',
            monthly: '12개월 보존',
            yearly: '7년 보존 (규정에 따라)'
          }
        },
        category: 'COST_OPTIMIZATION'
      });

      this.inspector.addFinding(finding);
    }

    // 종료된 인스턴스의 스냅샷 정리 권장
    const terminatedInstances = instances.filter(instance => 
      instance.State?.Name === 'terminated'
    );

    if (terminatedInstances.length > 0) {
      const finding = new InspectionFinding({
        resourceId: 'terminated-instance-snapshots',
        resourceType: 'EBSSnapshot',
        riskLevel: 'HIGH',
        issue: `${terminatedInstances.length}개의 종료된 인스턴스와 관련된 스냅샷 정리가 필요할 수 있습니다 (기준: 인스턴스 상태가 'terminated')`,
        recommendation: '종료된 인스턴스의 스냅샷을 검토하고 불필요한 것들을 삭제하세요',
        details: {
          terminatedInstances: terminatedInstances.length,
          instances: terminatedInstances.map(instance => ({
            instanceId: instance.InstanceId,
            name: this.getInstanceName(instance),
            terminationDate: this.extractTerminationDate(instance.StateTransitionReason)
          })),
          cleanupActions: [
            '종료된 인스턴스 ID로 스냅샷 검색',
            '필요한 데이터 백업 확인',
            '불필요한 스냅샷 삭제',
            '스냅샷 태그 정리'
          ],
          potentialSavings: '종료된 인스턴스당 월 $5-50 절감 가능'
        },
        category: 'COST_OPTIMIZATION'
      });

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 스냅샷 보존 정책 권장사항
   */
  checkSnapshotRetentionPolicy(instances) {
    const productionInstances = instances.filter(instance => {
      const name = this.getInstanceName(instance).toLowerCase();
      const environment = this.getInstanceEnvironment(instance);
      return environment === 'production' || name.includes('prod');
    });

    if (productionInstances.length > 0) {
      const finding = new InspectionFinding({
        resourceId: 'snapshot-retention-policy',
        resourceType: 'EBSSnapshot',
        riskLevel: 'MEDIUM',
        issue: `${productionInstances.length}개의 프로덕션 인스턴스에 대한 스냅샷 보존 정책 수립이 필요합니다 (기준: 이름/태그에 'prod' 포함)`,
        recommendation: '환경별로 차별화된 스냅샷 보존 정책을 수립하고 자동화하세요',
        details: {
          productionInstances: productionInstances.length,
          recommendedPolicies: {
            production: {
              daily: '30일 보존',
              weekly: '12주 보존',
              monthly: '24개월 보존',
              disaster_recovery: '별도 리전에 복사'
            },
            development: {
              daily: '7일 보존',
              weekly: '4주 보존',
              monthly: '3개월 보존'
            },
            testing: {
              daily: '3일 보존',
              weekly: '2주 보존'
            }
          },
          automationOptions: [
            'AWS Backup 서비스 사용',
            'Lambda 함수를 통한 자동화',
            'AWS Data Lifecycle Manager 사용',
            'CloudFormation 템플릿 활용'
          ],
          complianceConsiderations: [
            '업계 규정 요구사항 확인',
            '데이터 보존 의무 기간',
            '감사 요구사항',
            '재해 복구 목표 시간'
          ]
        },
        category: 'COMPLIANCE'
      });

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 자동 스냅샷 생성 권장사항
   */
  checkAutomaticSnapshotRecommendations(instances) {
    const criticalInstances = instances.filter(instance => {
      const name = this.getInstanceName(instance).toLowerCase();
      return name.includes('db') || name.includes('database') || 
             name.includes('prod') || name.includes('critical');
    });

    if (criticalInstances.length > 0) {
      const finding = new InspectionFinding({
        resourceId: 'automatic-snapshot-setup',
        resourceType: 'EBSSnapshot',
        riskLevel: 'HIGH',
        issue: `${criticalInstances.length}개의 중요한 인스턴스에 자동 스냅샷 설정이 필요합니다 (기준: 이름에 'db', 'database', 'prod', 'critical' 포함)`,
        recommendation: '중요한 인스턴스에 대해 자동 스냅샷 생성을 설정하세요',
        details: {
          criticalInstances: criticalInstances.length,
          instances: criticalInstances.map(instance => ({
            instanceId: instance.InstanceId,
            name: this.getInstanceName(instance),
            instanceType: instance.InstanceType,
            volumeCount: instance.BlockDeviceMappings?.length || 0
          })),
          automationMethods: [
            {
              method: 'AWS Backup',
              pros: ['중앙 집중식 관리', '교차 리전 백업', '규정 준수 보고서'],
              cons: ['추가 비용', '설정 복잡성']
            },
            {
              method: 'Data Lifecycle Manager',
              pros: ['EBS 전용 최적화', '태그 기반 자동화', '비용 효율적'],
              cons: ['EBS만 지원', '제한된 기능']
            },
            {
              method: 'Lambda + CloudWatch Events',
              pros: ['완전한 커스터마이징', '세밀한 제어', '다른 서비스 통합'],
              cons: ['개발 및 유지보수 필요', '복잡성']
            }
          ],
          recommendedSchedule: {
            critical: '매 4시간',
            production: '매일 새벽 2시',
            development: '매주 일요일',
            testing: '수동 생성'
          }
        },
        category: 'RELIABILITY'
      });

      this.inspector.addFinding(finding);
    }
  }

  /**
   * 인스턴스 이름 추출
   */
  getInstanceName(instance) {
    const nameTag = instance.Tags?.find(tag => tag.Key === 'Name');
    return nameTag?.Value || 'Unnamed';
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
   * 종료 날짜 추출
   */
  extractTerminationDate(stateTransitionReason) {
    if (!stateTransitionReason) return 'Unknown';
    
    const match = stateTransitionReason.match(/\((\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : 'Unknown';
  }

  /**
   * 권장사항 생성
   */
  getRecommendations(findings) {
    const recommendations = [];
    const snapshotFindings = findings.filter(f => 
      f.resourceType === 'EBSSnapshot'
    );

    if (snapshotFindings.length > 0) {
      recommendations.push('EBS 스냅샷 보존 정책을 수립하고 정기적으로 정리하세요.');
      
      const cleanupFindings = snapshotFindings.filter(f => 
        f.issue.includes('정리') || f.issue.includes('종료된')
      );
      if (cleanupFindings.length > 0) {
        recommendations.push('불필요한 스냅샷을 정기적으로 삭제하여 비용을 절감하세요.');
      }

      const automationFindings = snapshotFindings.filter(f => 
        f.issue.includes('자동') || f.issue.includes('중요한')
      );
      if (automationFindings.length > 0) {
        recommendations.push('중요한 인스턴스에 자동 스냅샷 생성을 설정하세요.');
      }
    }

    return recommendations;
  }
}

module.exports = OldSnapshotsChecker;