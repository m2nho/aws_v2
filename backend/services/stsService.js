const { AssumeRoleCommand, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
const { stsClient } = require('../config/aws');

class STSService {
  constructor() {
    this.client = stsClient;
  }

  /**
   * AWS Role ARN 유효성 검증
   * @param {string} roleArn - 검증할 Role ARN
   * @param {string} sessionName - 세션 이름 (선택사항)
   * @returns {Promise<Object>} 검증 결과
   */
  async validateRoleArn(roleArn, sessionName = 'aws-user-management-validation') {
    try {
      // Role ARN 형식 기본 검증
      if (!this.isValidArnFormat(roleArn)) {
        return {
          success: false,
          isValid: false,
          error: 'Invalid ARN format',
          details: 'ARN must follow the format: arn:aws:iam::account-id:role/role-name',
        };
      }

      // STS AssumeRole을 통한 실제 검증
      const params = {
        RoleArn: roleArn,
        RoleSessionName: sessionName,
        DurationSeconds: 900, // 15분 (최소값)
      };

      const command = new AssumeRoleCommand(params);
      const result = await this.client.send(command);

      return {
        success: true,
        isValid: true,
        credentials: {
          accessKeyId: result.Credentials.AccessKeyId,
          secretAccessKey: result.Credentials.SecretAccessKey,
          sessionToken: result.Credentials.SessionToken,
          expiration: result.Credentials.Expiration,
        },
        assumedRoleUser: result.AssumedRoleUser,
        packedPolicySize: result.PackedPolicySize,
      };
    } catch (error) {


      // 에러 타입별 처리
      let errorMessage = error.message;
      let errorCode = error.name;

      if (error.name === 'AccessDenied') {
        errorMessage = 'Access denied: Cannot assume the specified role';
      } else if (error.name === 'InvalidParameterValue') {
        errorMessage = 'Invalid role ARN or parameter';
      } else if (error.name === 'MalformedPolicyDocument') {
        errorMessage = 'Malformed policy document';
      } else if (error.name === 'NoSuchEntity') {
        errorMessage = 'Role does not exist';
      }

      return {
        success: false,
        isValid: false,
        error: errorMessage,
        errorCode,
        details: error.message,
      };
    }
  }

  /**
   * 현재 AWS 자격증명 정보 조회
   * @returns {Promise<Object>} 자격증명 정보
   */
  async getCallerIdentity() {
    try {
      const command = new GetCallerIdentityCommand({});
      const result = await this.client.send(command);

      return {
        success: true,
        userId: result.UserId,
        account: result.Account,
        arn: result.Arn,
      };
    } catch (error) {

      throw new Error(`자격증명 조회 실패: ${error.message}`);
    }
  }

  /**
   * Role ARN 형식 검증
   * @param {string} arn - 검증할 ARN
   * @returns {boolean} 형식 유효성
   */
  isValidArnFormat(arn) {
    if (!arn || typeof arn !== 'string') {
      return false;
    }

    // ARN 형식: arn:aws:iam::account-id:role/role-name (role-name can include slashes for service roles)
    const arnRegex = /^arn:aws:iam::\d{12}:role\/[\w+=,.@\/-]+$/;
    return arnRegex.test(arn);
  }

  /**
   * Role ARN에서 계정 ID 추출
   * @param {string} arn - Role ARN
   * @returns {string|null} 계정 ID
   */
  extractAccountIdFromArn(arn) {
    try {
      if (!this.isValidArnFormat(arn)) {
        return null;
      }

      const parts = arn.split(':');
      return parts[4]; // arn:aws:iam::account-id:role/role-name에서 account-id 부분
    } catch (error) {

      return null;
    }
  }

  /**
   * Role ARN에서 역할 이름 추출
   * @param {string} arn - Role ARN
   * @returns {string|null} 역할 이름
   */
  extractRoleNameFromArn(arn) {
    try {
      if (!this.isValidArnFormat(arn)) {
        return null;
      }

      const parts = arn.split('/');
      return parts[parts.length - 1]; // role/role-name에서 role-name 부분
    } catch (error) {

      return null;
    }
  }

  /**
   * 배치로 여러 Role ARN 검증
   * @param {Array<string>} roleArns - 검증할 Role ARN 배열
   * @returns {Promise<Array<Object>>} 검증 결과 배열
   */
  async validateMultipleRoleArns(roleArns) {
    try {
      const validationPromises = roleArns.map(async (roleArn, index) => {
        const sessionName = `aws-user-management-batch-${index}`;
        const result = await this.validateRoleArn(roleArn, sessionName);
        return {
          roleArn,
          ...result,
        };
      });

      const results = await Promise.allSettled(validationPromises);
      
      return results.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            roleArn: roleArns[index],
            success: false,
            isValid: false,
            error: 'Validation failed',
            details: result.reason.message,
          };
        }
      });
    } catch (error) {

      throw new Error(`배치 ARN 검증 실패: ${error.message}`);
    }
  }
}

module.exports = new STSService();