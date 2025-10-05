/**
 * EC2 Data Collector
 * EC2 관련 데이터 수집을 담당하는 모듈
 */

const { DescribeInstancesCommand, DescribeSecurityGroupsCommand } = require('@aws-sdk/client-ec2');

class EC2DataCollector {
  constructor(ec2Client, inspector) {
    this.ec2Client = ec2Client;
    this.inspector = inspector;
  }

  /**
   * 모든 EC2 관련 데이터 수집
   */
  async collectAllData() {
    const [securityGroups, instances] = await Promise.all([
      this.getSecurityGroups(),
      this.getEC2Instances()
    ]);

    return {
      securityGroups,
      instances
    };
  }

  /**
   * 보안 그룹 목록 조회
   */
  async getSecurityGroups() {
    try {
      const command = new DescribeSecurityGroupsCommand({});
      const response = await this.inspector.retryableApiCall(
        () => this.ec2Client.send(command),
        'DescribeSecurityGroups'
      );

      return response.SecurityGroups || [];
    } catch (error) {
      this.inspector.recordError(error, { operation: 'getSecurityGroups' });
      return [];
    }
  }

  /**
   * EC2 인스턴스 목록 조회
   */
  async getEC2Instances() {
    try {
      const command = new DescribeInstancesCommand({});
      const response = await this.inspector.retryableApiCall(
        () => this.ec2Client.send(command),
        'DescribeInstances'
      );

      const instances = [];
      if (response.Reservations) {
        response.Reservations.forEach(reservation => {
          if (reservation.Instances) {
            instances.push(...reservation.Instances);
          }
        });
      }

      return instances;
    } catch (error) {
      this.inspector.recordError(error, { operation: 'getEC2Instances' });
      return [];
    }
  }

  /**
   * 특정 보안 그룹 조회
   */
  async getSecurityGroup(groupId) {
    try {
      const command = new DescribeSecurityGroupsCommand({
        GroupIds: [groupId]
      });
      const response = await this.inspector.retryableApiCall(
        () => this.ec2Client.send(command),
        'DescribeSecurityGroups'
      );

      return response.SecurityGroups?.[0] || null;
    } catch (error) {
      this.inspector.recordError(error, { 
        operation: 'getSecurityGroup',
        groupId 
      });
      return null;
    }
  }

  /**
   * 특정 인스턴스 조회
   */
  async getInstance(instanceId) {
    try {
      const command = new DescribeInstancesCommand({
        InstanceIds: [instanceId]
      });
      const response = await this.inspector.retryableApiCall(
        () => this.ec2Client.send(command),
        'DescribeInstances'
      );

      if (response.Reservations?.[0]?.Instances) {
        return response.Reservations[0].Instances[0];
      }
      return null;
    } catch (error) {
      this.inspector.recordError(error, { 
        operation: 'getInstance',
        instanceId 
      });
      return null;
    }
  }

  /**
   * 활성 인스턴스만 필터링
   */
  getActiveInstances(instances) {
    return instances.filter(instance => 
      instance.State?.Name !== 'terminated' && 
      instance.State?.Name !== 'terminating'
    );
  }

  /**
   * 퍼블릭 IP를 가진 인스턴스 필터링
   */
  getPublicInstances(instances) {
    return instances.filter(instance => 
      instance.PublicIpAddress || instance.PublicDnsName
    );
  }

  /**
   * 보안 그룹 사용 현황 분석
   */
  analyzeSecurityGroupUsage(instances, securityGroups) {
    const usedSecurityGroupIds = new Set();
    const securityGroupUsage = new Map();

    // 인스턴스에서 사용되는 보안 그룹 수집
    instances.forEach(instance => {
      if (instance.SecurityGroups) {
        instance.SecurityGroups.forEach(sg => {
          usedSecurityGroupIds.add(sg.GroupId);
          
          if (!securityGroupUsage.has(sg.GroupId)) {
            securityGroupUsage.set(sg.GroupId, []);
          }
          securityGroupUsage.get(sg.GroupId).push(instance.InstanceId);
        });
      }
    });

    // 사용되지 않는 보안 그룹 찾기
    const unusedSecurityGroups = securityGroups.filter(sg => 
      !usedSecurityGroupIds.has(sg.GroupId) && sg.GroupName !== 'default'
    );

    return {
      usedSecurityGroupIds,
      securityGroupUsage,
      unusedSecurityGroups
    };
  }
}

module.exports = EC2DataCollector;