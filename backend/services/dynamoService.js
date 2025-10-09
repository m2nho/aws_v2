const {
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
  QueryCommand,
} = require('@aws-sdk/lib-dynamodb');
const { dynamoDBDocClient } = require('../config/aws');
const { v4: uuidv4 } = require('uuid');

class DynamoService {
  constructor() {
    this.client = dynamoDBDocClient;
    this.tableName = process.env.AWS_DYNAMODB_TABLE_NAME || 'aws_v2';
  }

  /**
   * 새 사용자 메타데이터 생성
   * @param {Object} userData - 사용자 데이터
   * @returns {Promise<Object>} 생성 결과
   */
  async createUser(userData) {
    try {
      const userId = uuidv4();
      const timestamp = new Date().toISOString();

      const userRecord = {
        userId,
        username: userData.username,
        companyName: userData.companyName,
        roleArn: userData.roleArn,
        status: 'pending', // 기본 상태는 승인 대기
        isAdmin: userData.isAdmin || false, // 관리자 권한 필드 (기본값: false)
        arnValidation: {
          isValid: null,
          lastChecked: null,
          error: null,
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      const params = {
        TableName: this.tableName,
        Item: userRecord,
        ConditionExpression: 'attribute_not_exists(userId)',
      };

      const command = new PutCommand(params);
      await this.client.send(command);

      return {
        success: true,
        userId,
        user: userRecord,
      };
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new Error('사용자가 이미 존재합니다');
      }
      throw new Error(`사용자 생성 실패: ${error.message}`);
    }
  }

  /**
   * 사용자 정보 조회 (userId로)
   * @param {string} userId - 사용자 ID
   * @returns {Promise<Object>} 사용자 정보
   */
  async getUserById(userId) {
    try {
      const params = {
        TableName: this.tableName,
        Key: { userId },
      };

      const command = new GetCommand(params);
      const result = await this.client.send(command);

      if (!result.Item) {
        return { success: false, error: '사용자를 찾을 수 없습니다' };
      }

      return {
        success: true,
        user: result.Item,
      };
    } catch (error) {
      throw new Error(`사용자 조회 실패: ${error.message}`);
    }
  }

  /**
   * 사용자 정보 조회 (username으로)
   * @param {string} username - 사용자명
   * @returns {Promise<Object>} 사용자 정보
   */
  async getUserByUsername(username) {
    try {
      const params = {
        TableName: this.tableName,
        IndexName: 'username-index',
        KeyConditionExpression: 'username = :username',
        ExpressionAttributeValues: {
          ':username': username,
        },
      };

      const command = new QueryCommand(params);
      const result = await this.client.send(command);

      if (!result.Items || result.Items.length === 0) {
        return { success: false, error: '사용자를 찾을 수 없습니다' };
      }

      return {
        success: true,
        user: result.Items[0],
      };
    } catch (error) {
      throw new Error(`사용자 조회 실패: ${error.message}`);
    }
  }



  /**
   * 사용자 상태 업데이트
   * @param {string} userId - 사용자 ID
   * @param {string} status - 새로운 상태 (pending, approved, rejected)
   * @returns {Promise<Object>} 업데이트 결과
   */
  async updateUserStatus(userId, status) {
    try {
      const timestamp = new Date().toISOString();

      const params = {
        TableName: this.tableName,
        Key: { userId },
        UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': status,
          ':updatedAt': timestamp,
        },
        ConditionExpression: 'attribute_exists(userId)',
        ReturnValues: 'ALL_NEW',
      };

      const command = new UpdateCommand(params);
      const result = await this.client.send(command);

      return {
        success: true,
        user: result.Attributes,
      };
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new Error('사용자를 찾을 수 없습니다');
      }
      throw new Error(`사용자 상태 업데이트 실패: ${error.message}`);
    }
  }

  /**
   * ARN 검증 결과 업데이트
   * @param {string} userId - 사용자 ID
   * @param {boolean} isValid - ARN 유효성
   * @param {string} error - 오류 메시지 (있는 경우)
   * @returns {Promise<Object>} 업데이트 결과
   */
  async updateArnValidation(userId, isValid, error = null) {
    try {
      const timestamp = new Date().toISOString();

      const params = {
        TableName: this.tableName,
        Key: { userId },
        UpdateExpression: 'SET arnValidation = :arnValidation, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':arnValidation': {
            isValid,
            lastChecked: timestamp,
            error,
          },
          ':updatedAt': timestamp,
        },
        ConditionExpression: 'attribute_exists(userId)',
        ReturnValues: 'ALL_NEW',
      };

      const command = new UpdateCommand(params);
      const result = await this.client.send(command);

      return {
        success: true,
        user: result.Attributes,
      };
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new Error('사용자를 찾을 수 없습니다');
      }
      throw new Error(`ARN 검증 결과 업데이트 실패: ${error.message}`);
    }
  }

  /**
   * 모든 사용자 목록 조회
   * @returns {Promise<Object>} 사용자 목록
   */
  async getAllUsers() {
    try {
      const params = {
        TableName: this.tableName,
      };

      const command = new ScanCommand(params);
      const result = await this.client.send(command);

      return {
        success: true,
        users: result.Items || [],
        count: result.Count || 0,
      };
    } catch (error) {
      throw new Error(`사용자 목록 조회 실패: ${error.message}`);
    }
  }

  /**
   * 상태별 사용자 목록 조회
   * @param {string} status - 조회할 상태 (pending, approved, rejected)
   * @returns {Promise<Object>} 사용자 목록
   */
  async getUsersByStatus(status) {
    try {
      const params = {
        TableName: this.tableName,
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': status,
        },
      };

      const command = new ScanCommand(params);
      const result = await this.client.send(command);

      return {
        success: true,
        users: result.Items || [],
        count: result.Count || 0,
      };
    } catch (error) {
      throw new Error(`상태별 사용자 조회 실패: ${error.message}`);
    }
  }

  /**
   * 사용자 삭제
   * @param {string} userId - 사용자 ID
   * @returns {Promise<Object>} 삭제 결과
   */
  async deleteUser(userId) {
    try {
      const params = {
        TableName: this.tableName,
        Key: { userId },
        ConditionExpression: 'attribute_exists(userId)',
      };

      const command = new DeleteCommand(params);
      await this.client.send(command);

      return { success: true };
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new Error('사용자를 찾을 수 없습니다');
      }
      throw new Error(`사용자 삭제 실패: ${error.message}`);
    }
  }

  /**
   * 사용자 타임스탬프 업데이트 (비밀번호 변경 등)
   * @param {string} userId - 사용자 ID
   * @returns {Promise<Object>} 업데이트 결과
   */
  async updateUserTimestamp(userId) {
    try {
      const timestamp = new Date().toISOString();
      
      const params = {
        TableName: this.tableName,
        Key: { userId },
        UpdateExpression: 'SET updatedAt = :timestamp',
        ExpressionAttributeValues: {
          ':timestamp': timestamp
        },
        ConditionExpression: 'attribute_exists(userId)'
      };

      await this.client.send(new UpdateCommand(params));
      return { success: true };
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new Error('사용자를 찾을 수 없습니다');
      }
      throw new Error(`사용자 타임스탬프 업데이트 실패: ${error.message}`);
    }
  }
}

module.exports = new DynamoService();