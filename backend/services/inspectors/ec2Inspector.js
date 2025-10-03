/**
 * EC2 Inspector Module
 * EC2 서비스에 대한 보안 및 모범 사례 검사
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

const BaseInspector = require('./baseInspector');
const InspectionFinding = require('../../models/InspectionFinding');
const { EC2Client, DescribeInstancesCommand, DescribeSecurityGroupsCommand } = require('@aws-sdk/client-ec2');

class EC2Inspector extends BaseInspector {
  constructor(options = {}) {
    super('EC2', options);
    this.ec2Client = null;
  }

  /**
   * Inspector 버전 반환
   * @returns {string} 버전 정보
   */
  getVersion() {
    return 'ec2-inspector-v1.0';
  }

  /**
   * 지원하는 검사 유형 목록 반환
   * @returns {Array<string>} 검사 유형 목록
   */
  getSupportedInspectionTypes() {
    return [
      'security-groups',
      'instance-security',
      'network-configuration',
      'access-control'
    ];
  }

  /**
   * 사전 검증
   * @param {Object} awsCredentials - AWS 자격 증명
   * @param {Object} inspectionConfig - 검사 설정
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

    this.logger.debug('EC2 client initialized successfully');
  }

  /**
   * 개별 항목 검사 수행
   * @param {Object} awsCredentials - AWS 자격 증명
   * @param {Object} inspectionConfig - 검사 설정
   * @returns {Promise<Object>} 검사 원시 결과
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
        case 'security_groups':
          this.updateProgress('Retrieving Security Groups', 20);
          const securityGroups = await this.getSecurityGroups();
          results.securityGroups = securityGroups;
          this.incrementResourceCount(securityGroups.length);
          
          this.updateProgress('Analyzing Security Groups', 60);
          await this.analyzeSecurityGroups(securityGroups);
          break;

        case 'key_pairs':
          this.updateProgress('Analyzing Key Pairs', 50);
          await this.analyzeKeyPairs();
          break;

        case 'instance_metadata':
          this.updateProgress('Retrieving EC2 Instances', 30);
          const instances = await this.getEC2Instances();
          results.instances = instances;
          this.incrementResourceCount(instances.length);
          
          this.updateProgress('Analyzing Instance Metadata', 70);
          await this.analyzeInstanceMetadata(instances);
          break;

        case 'public_access':
          this.updateProgress('Retrieving Resources', 25);
          const [sgList, instList] = await Promise.all([
            this.getSecurityGroups(),
            this.getEC2Instances()
          ]);
          results.securityGroups = sgList;
          results.instances = instList;
          this.incrementResourceCount(sgList.length + instList.length);
          
          this.updateProgress('Analyzing Public Access', 75);
          await this.analyzePublicAccess(instList, sgList);
          break;

        case 'network_access':
          this.updateProgress('Retrieving Network Configuration', 30);
          const [secGroups, ec2Instances] = await Promise.all([
            this.getSecurityGroups(),
            this.getEC2Instances()
          ]);
          results.securityGroups = secGroups;
          results.instances = ec2Instances;
          this.incrementResourceCount(secGroups.length + ec2Instances.length);
          
          this.updateProgress('Analyzing Network Access', 80);
          await this.analyzeNetworkAccessibility(ec2Instances, secGroups);
          break;

        default:
          // 알 수 없는 항목인 경우 전체 검사로 폴백
          return this.performInspection(awsCredentials, inspectionConfig);
      }

      this.updateProgress('Finalizing Analysis', 95);
      results.findings = this.findings;

      return results;

    } catch (error) {
      console.error(`❌ [EC2Inspector] Item inspection failed for ${targetItem}:`, error);
      throw error;
    }
  }

  /**
   * 실제 검사 수행 (향상된 진행률 보고)
   * @param {Object} awsCredentials - AWS 자격 증명
   * @param {Object} inspectionConfig - 검사 설정
   * @returns {Promise<Object>} 검사 원시 결과
   */
  async performInspection(awsCredentials, inspectionConfig) {
    const results = {
      securityGroups: [],
      instances: [],
      findings: []
    };

    try {
      // 1. 보안 그룹 검사
      this.updateProgress('Retrieving Security Groups', 5, {
        stepDetails: 'Fetching security group configurations from AWS'
      });

      const securityGroups = await this.getSecurityGroups();
      results.securityGroups = securityGroups;
      this.incrementResourceCount(securityGroups.length);

      this.updateProgress('Analyzing Security Groups', 15, {
        resourcesProcessed: 0,
        totalResources: securityGroups.length,
        stepDetails: `Found ${securityGroups.length} security groups to analyze`
      });

      await this.analyzeSecurityGroups(securityGroups);

      // 2. EC2 인스턴스 검사
      this.updateProgress('Retrieving EC2 Instances', 35, {
        stepDetails: 'Fetching EC2 instance configurations from AWS'
      });

      const instances = await this.getEC2Instances();
      results.instances = instances;
      this.incrementResourceCount(instances.length);

      this.updateProgress('Analyzing EC2 Instances', 45, {
        resourcesProcessed: 0,
        totalResources: instances.length,
        stepDetails: `Found ${instances.length} instances to analyze`
      });

      await this.analyzeEC2Instances(instances);

      // 3. 인스턴스-보안그룹 관계 검사
      this.updateProgress('Analyzing Instance-Security Group Relationships', 70, {
        stepDetails: 'Checking relationships between instances and security groups'
      });

      await this.analyzeInstanceSecurityRelationships(instances, securityGroups);

      // 4. 네트워크 접근성 검사
      this.updateProgress('Analyzing Network Accessibility', 85, {
        stepDetails: 'Evaluating network access patterns and risks'
      });

      await this.analyzeNetworkAccessibility(instances, securityGroups);

      // 5. 최종 결과 정리
      this.updateProgress('Finalizing Inspection Results', 95, {
        stepDetails: 'Compiling findings and generating recommendations'
      });

      this.updateProgress('Inspection Complete', 100, {
        stepDetails: `Inspection completed successfully. Found ${this.findings.length} findings.`
      });

    } catch (error) {
      this.recordError(error, { phase: 'performInspection' });
      throw error;
    }

    return results;
  }

  /**
   * 보안 그룹 목록 조회
   * @returns {Promise<Array>} 보안 그룹 목록
   */
  async getSecurityGroups() {
    try {
      const command = new DescribeSecurityGroupsCommand({});
      const response = await this.retryableApiCall(
        () => this.ec2Client.send(command),
        'DescribeSecurityGroups'
      );

      return response.SecurityGroups || [];
    } catch (error) {
      this.recordError(error, { operation: 'getSecurityGroups' });
      return [];
    }
  }

  /**
   * EC2 인스턴스 목록 조회
   * @returns {Promise<Array>} EC2 인스턴스 목록
   */
  async getEC2Instances() {
    try {
      const command = new DescribeInstancesCommand({});
      const response = await this.retryableApiCall(
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
      this.recordError(error, { operation: 'getEC2Instances' });
      return [];
    }
  }

  /**
   * 보안 그룹 분석
   * @param {Array} securityGroups - 보안 그룹 목록
   */
  async analyzeSecurityGroups(securityGroups) {
    for (const sg of securityGroups) {
      try {
        // 1. 과도하게 열린 포트 검사
        this.checkOverlyPermissiveRules(sg);

        // 2. SSH/RDP 접근 검사
        this.checkSSHRDPAccess(sg);

        // 3. 미사용 보안 그룹 검사
        this.checkUnusedSecurityGroup(sg);

        // 4. 기본 보안 그룹 사용 검사
        this.checkDefaultSecurityGroup(sg);

        // 5. 보안 그룹 설명 검사
        this.checkSecurityGroupDescription(sg);

      } catch (error) {
        this.recordError(error, {
          operation: 'analyzeSecurityGroups',
          securityGroupId: sg.GroupId
        });
      }
    }
  }

  /**
   * 과도하게 열린 포트 검사
   * @param {Object} securityGroup - 보안 그룹
   */
  checkOverlyPermissiveRules(securityGroup) {
    if (!securityGroup.IpPermissions) return;

    securityGroup.IpPermissions.forEach(rule => {
      // 0.0.0.0/0으로 열린 규칙 검사
      const hasOpenAccess = rule.IpRanges?.some(range => range.CidrIp === '0.0.0.0/0') ||
        rule.Ipv6Ranges?.some(range => range.CidrIpv6 === '::/0');

      if (hasOpenAccess) {
        const portRange = rule.FromPort === rule.ToPort ?
          rule.FromPort : `${rule.FromPort}-${rule.ToPort}`;

        const finding = InspectionFinding.createSecurityGroupFinding(
          securityGroup,
          `Security group allows unrestricted access (0.0.0.0/0) on port ${portRange}`,
          `모든 트래픽을 허용하는 대신 특정 IP 범위나 보안 그룹으로 접근을 제한하세요`
        );
        finding.riskLevel = 'HIGH';
        finding.details.affectedRule = rule;

        this.addFinding(finding);
      }
    });
  }

  /**
   * SSH/RDP 접근 검사
   * @param {Object} securityGroup - 보안 그룹
   */
  checkSSHRDPAccess(securityGroup) {
    if (!securityGroup.IpPermissions) return;

    const criticalPorts = [22, 3389]; // SSH, RDP

    securityGroup.IpPermissions.forEach(rule => {
      const ruleCoversPort = (port) => {
        return rule.FromPort <= port && rule.ToPort >= port;
      };

      criticalPorts.forEach(port => {
        if (ruleCoversPort(port)) {
          const hasOpenAccess = rule.IpRanges?.some(range => range.CidrIp === '0.0.0.0/0');

          if (hasOpenAccess) {
            const service = port === 22 ? 'SSH' : 'RDP';
            const finding = InspectionFinding.createSecurityGroupFinding(
              securityGroup,
              `${service} access (port ${port}) is open to the internet (0.0.0.0/0)`,
              `${service} 접근을 특정 IP 주소로 제한하거나 VPN/배스천 호스트를 사용하세요`
            );
            finding.riskLevel = 'CRITICAL';
            finding.details.affectedPort = port;
            finding.details.service = service;

            this.addFinding(finding);
          }
        }
      });
    });
  }

  /**
   * 미사용 보안 그룹 검사
   * @param {Object} securityGroup - 보안 그룹
   */
  checkUnusedSecurityGroup(securityGroup) {
    // 이 검사는 인스턴스 정보와 함께 수행되어야 하므로
    // analyzeInstanceSecurityRelationships에서 처리
  }

  /**
   * 기본 보안 그룹 사용 검사
   * @param {Object} securityGroup - 보안 그룹
   */
  checkDefaultSecurityGroup(securityGroup) {
    if (securityGroup.GroupName === 'default') {
      // 기본 보안 그룹에 커스텀 규칙이 있는지 검사
      const hasCustomRules = securityGroup.IpPermissions?.length > 0 ||
        securityGroup.IpPermissionsEgress?.some(rule =>
          !(rule.IpProtocol === '-1' &&
            rule.IpRanges?.some(range => range.CidrIp === '0.0.0.0/0'))
        );

      if (hasCustomRules) {
        const finding = InspectionFinding.createSecurityGroupFinding(
          securityGroup,
          'Default security group has custom rules configured',
          '기본 보안 그룹을 수정하는 대신 전용 보안 그룹을 생성하세요'
        );
        finding.riskLevel = 'MEDIUM';

        this.addFinding(finding);
      }
    }
  }

  /**
   * 보안 그룹 설명 검사
   * @param {Object} securityGroup - 보안 그룹
   */
  checkSecurityGroupDescription(securityGroup) {
    if (!securityGroup.Description ||
      securityGroup.Description.trim() === '' ||
      securityGroup.Description === 'default VPC security group') {

      const finding = InspectionFinding.createSecurityGroupFinding(
        securityGroup,
        'Security group lacks meaningful description',
        '이 보안 그룹의 목적과 범위를 식별하는 데 도움이 되는 설명 정보를 추가하세요'
      );
      finding.riskLevel = 'LOW';

      this.addFinding(finding);
    }
  }

  /**
   * EC2 인스턴스 분석
   * @param {Array} instances - EC2 인스턴스 목록
   */
  async analyzeEC2Instances(instances) {
    for (const instance of instances) {
      try {
        // 종료된 인스턴스는 건너뛰기
        if (instance.State?.Name === 'terminated') {
          continue;
        }

        // 1. 퍼블릭 IP 노출 검사
        this.checkPublicIPExposure(instance);

        // 2. 인스턴스 메타데이터 서비스 검사
        this.checkInstanceMetadataService(instance);

        // 3. 인스턴스 모니터링 검사
        this.checkInstanceMonitoring(instance);

        // 4. EBS 암호화 검사
        this.checkEBSEncryption(instance);

      } catch (error) {
        this.recordError(error, {
          operation: 'analyzeEC2Instances',
          instanceId: instance.InstanceId
        });
      }
    }
  }

  /**
   * 퍼블릭 IP 노출 검사
   * @param {Object} instance - EC2 인스턴스
   */
  checkPublicIPExposure(instance) {
    if (instance.PublicIpAddress) {
      const finding = InspectionFinding.createEC2Finding(
        instance,
        'Instance has a public IP address assigned',
        '더 나은 보안을 위해 NAT Gateway나 VPN과 함께 프라이빗 서브넷 사용을 고려하세요',
        'MEDIUM'
      );
      finding.details.publicIpAddress = instance.PublicIpAddress;

      this.addFinding(finding);
    }
  }

  /**
   * 인스턴스 메타데이터 서비스 검사
   * @param {Object} instance - EC2 인스턴스
   */
  checkInstanceMetadataService(instance) {
    const metadataOptions = instance.MetadataOptions;

    if (!metadataOptions) {
      const finding = InspectionFinding.createEC2Finding(
        instance,
        'Instance metadata service configuration is not available',
        '향상된 보안을 위해 IMDSv2가 강제로 적용되도록 하세요',
        'MEDIUM'
      );

      this.addFinding(finding);
      return;
    }

    // IMDSv1이 허용되는지 검사
    if (metadataOptions.HttpTokens !== 'required') {
      const finding = InspectionFinding.createEC2Finding(
        instance,
        'Instance allows IMDSv1 (Instance Metadata Service version 1)',
        '더 나은 보안을 위해 HttpTokens를 "required"로 설정하여 IMDSv2를 강제하세요',
        'HIGH'
      );
      finding.details.metadataOptions = metadataOptions;

      this.addFinding(finding);
    }

    // 메타데이터 서비스가 완전히 비활성화되지 않았는지 검사
    if (metadataOptions.HttpEndpoint === 'disabled') {
      const finding = InspectionFinding.createEC2Finding(
        instance,
        'Instance metadata service is completely disabled',
        '메타데이터 서비스를 완전히 비활성화하는 대신 IMDSv2 활성화를 고려하세요',
        'LOW'
      );

      this.addFinding(finding);
    }
  }

  /**
   * 인스턴스 모니터링 검사
   * @param {Object} instance - EC2 인스턴스
   */
  checkInstanceMonitoring(instance) {
    if (!instance.Monitoring || instance.Monitoring.State !== 'enabled') {
      const finding = InspectionFinding.createEC2Finding(
        instance,
        'Detailed monitoring is not enabled for this instance',
        '인스턴스 성능에 대한 더 나은 가시성을 위해 세부 모니터링을 활성화하세요',
        'LOW'
      );
      finding.category = 'PERFORMANCE';

      this.addFinding(finding);
    }
  }

  /**
   * EBS 암호화 검사
   * @param {Object} instance - EC2 인스턴스
   */
  checkEBSEncryption(instance) {
    if (instance.BlockDeviceMappings) {
      instance.BlockDeviceMappings.forEach(mapping => {
        if (mapping.Ebs && !mapping.Ebs.Encrypted) {
          const finding = InspectionFinding.createEC2Finding(
            instance,
            `EBS volume ${mapping.Ebs.VolumeId} is not encrypted`,
            '저장 데이터 보호를 위해 EBS 암호화를 활성화하세요',
            'HIGH'
          );
          finding.details.unencryptedVolume = mapping.Ebs;

          this.addFinding(finding);
        }
      });
    }
  }

  /**
   * 인스턴스-보안그룹 관계 분석
   * @param {Array} instances - EC2 인스턴스 목록
   * @param {Array} securityGroups - 보안 그룹 목록
   */
  async analyzeInstanceSecurityRelationships(instances, securityGroups) {
    // 사용되지 않는 보안 그룹 찾기
    const usedSecurityGroupIds = new Set();

    instances.forEach(instance => {
      if (instance.SecurityGroups) {
        instance.SecurityGroups.forEach(sg => {
          usedSecurityGroupIds.add(sg.GroupId);
        });
      }
    });

    // 미사용 보안 그룹 검사
    securityGroups.forEach(sg => {
      if (!usedSecurityGroupIds.has(sg.GroupId) && sg.GroupName !== 'default') {
        const finding = InspectionFinding.createSecurityGroupFinding(
          sg,
          'Security group is not attached to any instances',
          '공격 표면을 줄이고 관리를 개선하기 위해 사용하지 않는 보안 그룹을 제거하세요'
        );
        finding.riskLevel = 'LOW';
        finding.category = 'COST';

        this.addFinding(finding);
      }
    });

    // 인스턴스별 보안 그룹 과다 사용 검사
    instances.forEach(instance => {
      if (instance.SecurityGroups && instance.SecurityGroups.length > 5) {
        const finding = InspectionFinding.createEC2Finding(
          instance,
          `Instance has ${instance.SecurityGroups.length} security groups attached`,
          '관리를 단순화하기 위해 보안 그룹 통합을 고려하세요',
          'LOW'
        );
        finding.category = 'RELIABILITY';

        this.addFinding(finding);
      }
    });
  }

  /**
   * 네트워크 접근성 분석
   * @param {Array} instances - EC2 인스턴스 목록
   * @param {Array} securityGroups - 보안 그룹 목록
   */
  async analyzeNetworkAccessibility(instances, securityGroups) {
    // 보안 그룹 ID로 매핑 생성
    const sgMap = new Map();
    securityGroups.forEach(sg => {
      sgMap.set(sg.GroupId, sg);
    });

    instances.forEach(instance => {
      if (instance.PublicIpAddress && instance.SecurityGroups) {
        // 퍼블릭 인스턴스의 보안 그룹 검사
        instance.SecurityGroups.forEach(instanceSg => {
          const sg = sgMap.get(instanceSg.GroupId);
          if (sg && sg.IpPermissions) {
            // 위험한 포트 조합 검사
            this.checkDangerousPortCombinations(instance, sg);
          }
        });
      }
    });
  }

  /**
   * 위험한 포트 조합 검사
   * @param {Object} instance - EC2 인스턴스
   * @param {Object} securityGroup - 보안 그룹
   */
  checkDangerousPortCombinations(instance, securityGroup) {
    const dangerousPorts = [21, 23, 135, 139, 445, 1433, 3306, 5432, 6379, 27017];

    securityGroup.IpPermissions.forEach(rule => {
      const hasOpenAccess = rule.IpRanges?.some(range => range.CidrIp === '0.0.0.0/0');

      if (hasOpenAccess) {
        dangerousPorts.forEach(port => {
          if (rule.FromPort <= port && rule.ToPort >= port) {
            const services = {
              21: 'FTP',
              23: 'Telnet',
              135: 'RPC',
              139: 'NetBIOS',
              445: 'SMB',
              1433: 'SQL Server',
              3306: 'MySQL',
              5432: 'PostgreSQL',
              6379: 'Redis',
              27017: 'MongoDB'
            };

            const finding = InspectionFinding.createEC2Finding(
              instance,
              `Instance with public IP allows ${services[port]} access (port ${port}) from anywhere`,
              `${services[port]} 접근을 특정 IP 범위로 제한하거나 프라이빗 네트워킹을 사용하세요`,
              'CRITICAL'
            );
            finding.details.dangerousPort = port;
            finding.details.service = services[port];
            finding.details.securityGroupId = securityGroup.GroupId;

            this.addFinding(finding);
          }
        });
      }
    });
  }

  /**
   * 서비스별 특화 권장사항
   * @returns {Array<string>} EC2 특화 권장사항
   */
  getServiceSpecificRecommendations() {
    const recommendations = [];
    const riskGroups = InspectionFinding.groupByRiskLevel(this.findings);

    // 보안 그룹 관련 권장사항
    const securityGroupFindings = this.findings.filter(f => f.resourceType === 'SecurityGroup');
    if (securityGroupFindings.length > 0) {
      recommendations.push('보안 그룹 규칙을 정기적으로 검토하고 최소 권한 원칙을 적용하세요.');
    }

    // 퍼블릭 IP 관련 권장사항
    const publicIpFindings = this.findings.filter(f =>
      f.issue.includes('public IP') || f.issue.includes('퍼블릭')
    );
    if (publicIpFindings.length > 0) {
      recommendations.push('가능한 한 프라이빗 서브넷을 사용하고 NAT Gateway를 통해 인터넷 접근을 제어하세요.');
    }

    // 암호화 관련 권장사항
    const encryptionFindings = this.findings.filter(f =>
      f.issue.includes('encrypted') || f.issue.includes('암호화')
    );
    if (encryptionFindings.length > 0) {
      recommendations.push('모든 EBS 볼륨에 대해 암호화를 활성화하여 데이터를 보호하세요.');
    }

    // IMDSv2 관련 권장사항
    const imdsFindings = this.findings.filter(f =>
      f.issue.includes('IMDS') || f.issue.includes('metadata')
    );
    if (imdsFindings.length > 0) {
      recommendations.push('모든 EC2 인스턴스에서 IMDSv2를 강제로 사용하도록 설정하세요.');
    }

    return recommendations;
  }

  /**
   * 부분적 결과 반환 (검사 실패 시 사용)
   * @returns {Object|null} 부분적 검사 결과
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
   * 키 페어 분석
   */
  async analyzeKeyPairs() {
    try {
      // 키 페어 관련 검사는 인스턴스 정보에서 추출
      const instances = await this.getEC2Instances();
      
      instances.forEach(instance => {
        if (!instance.KeyName) {
          this.addFinding(InspectionFinding.createEC2Finding(
            instance,
            'EC2 인스턴스에 키 페어가 설정되지 않았습니다',
            'SSH 접근을 위해 키 페어를 설정하거나 Session Manager를 사용하세요',
            'MEDIUM'
          ));
        }
      });
    } catch (error) {
      console.error('키 페어 분석 실패:', error);
    }
  }

  /**
   * 인스턴스 메타데이터 분석
   */
  async analyzeInstanceMetadata(instances) {
    instances.forEach(instance => {
      // IMDSv2 강제 사용 확인
      if (instance.MetadataOptions?.HttpTokens !== 'required') {
        this.addFinding(InspectionFinding.createEC2Finding(
          instance,
          'EC2 인스턴스에서 IMDSv2가 강제되지 않습니다',
          'Instance Metadata Service v2 (IMDSv2)를 강제로 사용하도록 설정하세요',
          'HIGH'
        ));
      }

      // 메타데이터 홉 제한 확인
      if (instance.MetadataOptions?.HttpPutResponseHopLimit > 1) {
        this.addFinding(InspectionFinding.createEC2Finding(
          instance,
          'EC2 인스턴스의 메타데이터 홉 제한이 너무 높습니다',
          '메타데이터 홉 제한을 1로 설정하여 보안을 강화하세요',
          'MEDIUM'
        ));
      }
    });
  }

  /**
   * 퍼블릭 접근 분석
   */
  async analyzePublicAccess(instances, securityGroups) {
    // 퍼블릭 IP를 가진 인스턴스 확인
    instances.forEach(instance => {
      if (instance.PublicIpAddress) {
        this.addFinding(InspectionFinding.createEC2Finding(
          instance,
          'EC2 인스턴스가 퍼블릭 IP 주소를 가지고 있습니다',
          '필요하지 않은 경우 퍼블릭 IP를 제거하고 NAT Gateway나 VPC 엔드포인트를 사용하세요',
          'MEDIUM'
        ));
      }
    });

    // 퍼블릭 접근이 가능한 보안 그룹 확인
    securityGroups.forEach(sg => {
      sg.IpPermissions?.forEach(rule => {
        rule.IpRanges?.forEach(ipRange => {
          if (ipRange.CidrIp === '0.0.0.0/0') {
            this.addFinding(InspectionFinding.createSecurityGroupFinding(
              sg,
              `보안 그룹이 모든 IP(0.0.0.0/0)에서의 접근을 허용합니다 (포트: ${rule.FromPort}-${rule.ToPort})`,
              '필요한 IP 범위로만 접근을 제한하세요'
            ));
          }
        });
      });
    });
  }

  /**
   * 완료된 검사 항목들 반환
   * @returns {Array<string>} 완료된 검사 항목 목록
   */
  getCompletedChecks() {
    const completedChecks = [];

    // 각 검사 단계별로 완료 여부 확인
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