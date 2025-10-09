const {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminInitiateAuthCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminDeleteUserCommand,
  ListUsersCommand,
} = require('@aws-sdk/client-cognito-identity-provider');
const { cognitoClient } = require('../config/aws');

class CognitoService {
  constructor() {
    this.client = cognitoClient;
    this.userPoolId = process.env.AWS_COGNITO_USER_POOL_ID;
    this.clientId = process.env.AWS_COGNITO_CLIENT_ID;
  }

  /**
   * 새 사용자 생성
   * @param {string} username - 사용자명 (이메일 형식)
   * @param {string} password - 비밀번호
   * @param {string} email - 이메일 (선택사항, username과 동일할 수 있음)
   * @returns {Promise<Object>} 생성된 사용자 정보
   */
  async createUser(username, password, email = null) {
    try {
      // username이 이메일 형식이므로 email이 없으면 username을 사용
      const userEmail = email || username;
      
      const params = {
        UserPoolId: this.userPoolId,
        Username: username, // 이메일 형식의 사용자명
        TemporaryPassword: password,
        MessageAction: 'SUPPRESS', // 이메일 발송 억제
        UserAttributes: [
          {
            Name: 'email',
            Value: userEmail,
          },
          {
            Name: 'email_verified',
            Value: 'true',
          },
        ],
      };

      const createCommand = new AdminCreateUserCommand(params);
      const createResult = await this.client.send(createCommand);

      // 임시 비밀번호를 영구 비밀번호로 설정
      const setPasswordParams = {
        UserPoolId: this.userPoolId,
        Username: username,
        Password: password,
        Permanent: true,
      };

      const setPasswordCommand = new AdminSetUserPasswordCommand(setPasswordParams);
      await this.client.send(setPasswordCommand);

      return {
        success: true,
        user: createResult.User,
        userId: createResult.User.Username,
      };
    } catch (error) {
      throw new Error(`사용자 생성 실패: ${error.message}`);
    }
  }

  /**
   * 사용자 인증
   * @param {string} username - 사용자명
   * @param {string} password - 비밀번호
   * @returns {Promise<Object>} 인증 결과 및 토큰
   */
  async authenticateUser(username, password) {
    try {
      const params = {
        UserPoolId: this.userPoolId,
        ClientId: this.clientId,
        AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
        AuthParameters: {
          USERNAME: username,
          PASSWORD: password,
        },
      };

      const command = new AdminInitiateAuthCommand(params);
      const result = await this.client.send(command);

      return {
        success: true,
        accessToken: result.AuthenticationResult.AccessToken,
        idToken: result.AuthenticationResult.IdToken,
        refreshToken: result.AuthenticationResult.RefreshToken,
        expiresIn: result.AuthenticationResult.ExpiresIn,
      };
    } catch (error) {
      throw new Error(`인증 실패: ${error.message}`);
    }
  }

  /**
   * 사용자 정보 조회
   * @param {string} username - 사용자명
   * @returns {Promise<Object>} 사용자 정보
   */
  async getUser(username) {
    try {
      const params = {
        UserPoolId: this.userPoolId,
        Username: username,
      };

      const command = new AdminGetUserCommand(params);
      const result = await this.client.send(command);

      return {
        success: true,
        user: {
          username: result.Username,
          attributes: result.UserAttributes,
          enabled: result.Enabled,
          userStatus: result.UserStatus,
          createdDate: result.UserCreateDate,
          lastModifiedDate: result.UserLastModifiedDate,
        },
      };
    } catch (error) {
      throw new Error(`사용자 조회 실패: ${error.message}`);
    }
  }

  /**
   * 사용자 속성 업데이트
   * @param {string} username - 사용자명
   * @param {Array} attributes - 업데이트할 속성 배열
   * @returns {Promise<Object>} 업데이트 결과
   */
  async updateUserAttributes(username, attributes) {
    try {
      const params = {
        UserPoolId: this.userPoolId,
        Username: username,
        UserAttributes: attributes,
      };

      const command = new AdminUpdateUserAttributesCommand(params);
      await this.client.send(command);

      return { success: true };
    } catch (error) {
      throw new Error(`사용자 속성 업데이트 실패: ${error.message}`);
    }
  }

  /**
   * 사용자 삭제
   * @param {string} username - 사용자명
   * @returns {Promise<Object>} 삭제 결과
   */
  async deleteUser(username) {
    try {
      const params = {
        UserPoolId: this.userPoolId,
        Username: username,
      };

      const command = new AdminDeleteUserCommand(params);
      await this.client.send(command);

      return { success: true };
    } catch (error) {
      throw new Error(`사용자 삭제 실패: ${error.message}`);
    }
  }

  /**
   * 모든 사용자 목록 조회
   * @param {number} limit - 조회할 사용자 수 제한
   * @returns {Promise<Object>} 사용자 목록
   */
  async listUsers(limit = 60) {
    try {
      const params = {
        UserPoolId: this.userPoolId,
        Limit: limit,
      };

      const command = new ListUsersCommand(params);
      const result = await this.client.send(command);

      return {
        success: true,
        users: result.Users.map(user => ({
          username: user.Username,
          attributes: user.Attributes,
          enabled: user.Enabled,
          userStatus: user.UserStatus,
          createdDate: user.UserCreateDate,
          lastModifiedDate: user.UserLastModifiedDate,

        })),
      };
    } catch (error) {
      throw new Error(`사용자 목록 조회 실패: ${error.message}`);
    }
  }

  /**
   * 사용자 비밀번호 변경
   * @param {string} username - 사용자명
   * @param {string} newPassword - 새 비밀번호
   * @returns {Promise<Object>} 변경 결과
   */
  async changePassword(username, newPassword) {
    try {
      const params = {
        UserPoolId: this.userPoolId,
        Username: username,
        Password: newPassword,
        Permanent: true
      };

      const command = new AdminSetUserPasswordCommand(params);
      await this.client.send(command);

      return {
        success: true,
        message: 'Password changed successfully'
      };
    } catch (error) {
      console.error('Password change error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }


}

module.exports = new CognitoService();