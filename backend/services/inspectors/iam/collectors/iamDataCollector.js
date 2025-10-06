/**
 * IAM Data Collector
 * IAM 리소스 데이터를 수집하는 모듈
 */

const { 
  ListUsersCommand, 
  ListRolesCommand, 
  ListPoliciesCommand,
  GetAccountSummaryCommand,
  ListAccessKeysCommand,
  ListMFADevicesCommand,
  GetUserCommand,
  GetAccessKeyLastUsedCommand
} = require('@aws-sdk/client-iam');

class IAMDataCollector {
  constructor(iamClient, inspector) {
    this.iamClient = iamClient;
    this.inspector = inspector;
  }

  /**
   * 모든 IAM 데이터 수집
   */
  async collectAllData() {
    const data = {
      users: [],
      roles: [],
      policies: [],
      accountSummary: null
    };

    try {
      // 병렬로 데이터 수집
      const [users, roles, policies, accountSummary] = await Promise.all([
        this.getUsers(),
        this.getRoles(),
        this.getPolicies(),
        this.getAccountSummary()
      ]);

      data.users = users;
      data.roles = roles;
      data.policies = policies;
      data.accountSummary = accountSummary;

      return data;

    } catch (error) {
      this.inspector.recordError(error, { operation: 'collectAllData' });
      throw error;
    }
  }

  /**
   * IAM 사용자 목록 조회
   */
  async getUsers() {
    try {
      const command = new ListUsersCommand({});
      const response = await this.iamClient.send(command);
      
      // 각 사용자에 대한 추가 정보 수집
      const usersWithDetails = await Promise.all(
        response.Users.map(async (user) => {
          try {
            // 액세스 키 정보
            const accessKeysCommand = new ListAccessKeysCommand({
              UserName: user.UserName
            });
            const accessKeysResponse = await this.iamClient.send(accessKeysCommand);

            // MFA 디바이스 정보
            const mfaCommand = new ListMFADevicesCommand({
              UserName: user.UserName
            });
            const mfaResponse = await this.iamClient.send(mfaCommand);

            // 액세스 키 마지막 사용 정보
            const accessKeyUsage = await Promise.all(
              accessKeysResponse.AccessKeyMetadata.map(async (key) => {
                try {
                  const usageCommand = new GetAccessKeyLastUsedCommand({
                    AccessKeyId: key.AccessKeyId
                  });
                  const usageResponse = await this.iamClient.send(usageCommand);
                  return {
                    accessKeyId: key.AccessKeyId,
                    status: key.Status,
                    createDate: this.formatDate(key.CreateDate),
                    lastUsed: usageResponse.AccessKeyLastUsed ? {
                      ...usageResponse.AccessKeyLastUsed,
                      LastUsedDate: this.formatDate(usageResponse.AccessKeyLastUsed.LastUsedDate)
                    } : null
                  };
                } catch (error) {
                  return {
                    accessKeyId: key.AccessKeyId,
                    status: key.Status,
                    createDate: this.formatDate(key.CreateDate),
                    lastUsed: null,
                    error: error.message
                  };
                }
              })
            );

            return {
              ...user,
              AccessKeys: accessKeyUsage,
              MFADevices: mfaResponse.MFADevices
            };
          } catch (error) {
            this.inspector.recordError(error, { 
              operation: 'getUserDetails', 
              userName: user.UserName 
            });
            return {
              ...user,
              AccessKeys: [],
              MFADevices: [],
              error: error.message
            };
          }
        })
      );

      return usersWithDetails;

    } catch (error) {
      this.inspector.recordError(error, { operation: 'getUsers' });
      return [];
    }
  }

  /**
   * IAM 역할 목록 조회
   */
  async getRoles() {
    try {
      const command = new ListRolesCommand({});
      const response = await this.iamClient.send(command);
      return response.Roles || [];

    } catch (error) {
      this.inspector.recordError(error, { operation: 'getRoles' });
      return [];
    }
  }

  /**
   * IAM 정책 목록 조회 (관리형 정책만)
   */
  async getPolicies() {
    try {
      const command = new ListPoliciesCommand({
        Scope: 'Local', // 고객 관리형 정책만
        MaxItems: 100
      });
      const response = await this.iamClient.send(command);
      return response.Policies || [];

    } catch (error) {
      this.inspector.recordError(error, { operation: 'getPolicies' });
      return [];
    }
  }

  /**
   * 계정 요약 정보 조회
   */
  async getAccountSummary() {
    try {
      const command = new GetAccountSummaryCommand({});
      const response = await this.iamClient.send(command);
      return response.SummaryMap || {};

    } catch (error) {
      this.inspector.recordError(error, { operation: 'getAccountSummary' });
      return {};
    }
  }

  /**
   * 특정 사용자의 상세 정보 조회
   */
  async getUserDetails(userName) {
    try {
      const command = new GetUserCommand({
        UserName: userName
      });
      const response = await this.iamClient.send(command);
      return response.User;

    } catch (error) {
      this.inspector.recordError(error, { 
        operation: 'getUserDetails', 
        userName 
      });
      return null;
    }
  }
  /**
   * 날짜를 안전하게 ISO 문자열로 변환
   */
  formatDate(date) {
    if (!date) return null;
    if (typeof date === 'string') return date;
    if (date instanceof Date) return date.toISOString();
    if (typeof date.toISOString === 'function') return date.toISOString();
    return date.toString();
  }
}

module.exports = IAMDataCollector;