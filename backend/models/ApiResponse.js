/**
 * Common API Response Format
 * 공통 응답 형식 및 에러 모델 정의
 * Requirements: 1.1, 2.3, 5.1
 */

class ApiResponse {
  constructor(success = true, data = null, error = null, metadata = {}) {
    this.success = success;
    this.timestamp = new Date().toISOString();
    
    if (data !== null) {
      this.data = data;
    }
    
    if (error !== null) {
      this.error = error;
    }

    if (Object.keys(metadata).length > 0) {
      this.metadata = metadata;
    }
  }

  /**
   * 성공 응답 생성
   * @param {*} data - 응답 데이터
   * @param {Object} metadata - 추가 메타데이터
   * @returns {ApiResponse} 성공 응답 객체
   */
  static success(data, metadata = {}) {
    return new ApiResponse(true, data, null, metadata);
  }

  /**
   * 오류 응답 생성
   * @param {string|Object} error - 오류 정보
   * @param {Object} metadata - 추가 메타데이터
   * @returns {ApiResponse} 오류 응답 객체
   */
  static error(error, metadata = {}) {
    let errorObj;
    
    if (typeof error === 'string') {
      errorObj = new ApiError('GENERIC_ERROR', error);
    } else if (error instanceof ApiError) {
      errorObj = error;
    } else {
      errorObj = new ApiError(
        error.code || 'UNKNOWN_ERROR',
        error.message || 'An unknown error occurred',
        error.details
      );
    }

    return new ApiResponse(false, null, errorObj.toObject(), metadata);
  }

  /**
   * 페이지네이션이 포함된 성공 응답 생성
   * @param {Array} items - 데이터 배열
   * @param {Object} pagination - 페이지네이션 정보
   * @param {Object} metadata - 추가 메타데이터
   * @returns {ApiResponse} 페이지네이션 응답 객체
   */
  static paginated(items, pagination, metadata = {}) {
    const data = {
      items,
      pagination: {
        page: pagination.page || 1,
        limit: pagination.limit || 10,
        total: pagination.total || items.length,
        totalPages: Math.ceil((pagination.total || items.length) / (pagination.limit || 10))
      }
    };

    return new ApiResponse(true, data, null, metadata);
  }

  /**
   * Express.js 응답으로 전송
   * @param {Object} res - Express response 객체
   * @param {number} statusCode - HTTP 상태 코드
   */
  send(res, statusCode = null) {
    const status = statusCode || (this.success ? 200 : 400);
    res.status(status).json(this);
  }
}

class ApiError {
  constructor(code, message, details = null) {
    this.code = code;
    this.message = message;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  /**
   * 객체 형태로 변환
   * @returns {Object} 오류 객체
   */
  toObject() {
    const obj = {
      code: this.code,
      message: this.message,
      timestamp: this.timestamp
    };

    if (this.details) {
      obj.details = this.details;
    }

    return obj;
  }

  /**
   * 인증 오류 생성
   * @param {string} message - 오류 메시지
   * @param {Object} details - 상세 정보
   * @returns {ApiError} 인증 오류 객체
   */
  static authentication(message = 'Authentication failed', details = null) {
    return new ApiError('AUTHENTICATION_ERROR', message, details);
  }

  /**
   * 권한 오류 생성
   * @param {string} message - 오류 메시지
   * @param {Object} details - 상세 정보
   * @returns {ApiError} 권한 오류 객체
   */
  static authorization(message = 'Access denied', details = null) {
    return new ApiError('AUTHORIZATION_ERROR', message, details);
  }

  /**
   * 유효성 검증 오류 생성
   * @param {string} message - 오류 메시지
   * @param {Array|Object} details - 유효성 검증 오류 상세
   * @returns {ApiError} 유효성 검증 오류 객체
   */
  static validation(message = 'Validation failed', details = null) {
    return new ApiError('VALIDATION_ERROR', message, details);
  }

  /**
   * 리소스 없음 오류 생성
   * @param {string} message - 오류 메시지
   * @param {Object} details - 상세 정보
   * @returns {ApiError} 리소스 없음 오류 객체
   */
  static notFound(message = 'Resource not found', details = null) {
    return new ApiError('NOT_FOUND', message, details);
  }

  /**
   * AWS 관련 오류 생성
   * @param {string} message - 오류 메시지
   * @param {Object} details - AWS 오류 상세 정보
   * @returns {ApiError} AWS 오류 객체
   */
  static aws(message = 'AWS service error', details = null) {
    return new ApiError('AWS_ERROR', message, details);
  }

  /**
   * Assume Role 오류 생성
   * @param {string} roleArn - 역할 ARN
   * @param {string} reason - 실패 이유
   * @returns {ApiError} Assume Role 오류 객체
   */
  static assumeRole(roleArn, reason = 'Access denied') {
    return new ApiError('ASSUME_ROLE_FAILED', 'Failed to assume role in customer account', {
      roleArn,
      reason
    });
  }

  /**
   * 검사 오류 생성
   * @param {string} serviceType - 서비스 타입
   * @param {string} message - 오류 메시지
   * @param {Object} details - 상세 정보
   * @returns {ApiError} 검사 오류 객체
   */
  static inspection(serviceType, message = 'Inspection failed', details = null) {
    return new ApiError('INSPECTION_ERROR', message, {
      serviceType,
      ...details
    });
  }

  /**
   * 데이터베이스 오류 생성
   * @param {string} message - 오류 메시지
   * @param {Object} details - 상세 정보
   * @returns {ApiError} 데이터베이스 오류 객체
   */
  static database(message = 'Database operation failed', details = null) {
    return new ApiError('DATABASE_ERROR', message, details);
  }

  /**
   * 시간 초과 오류 생성
   * @param {string} operation - 시간 초과된 작업
   * @param {number} timeout - 시간 초과 값 (ms)
   * @returns {ApiError} 시간 초과 오류 객체
   */
  static timeout(operation = 'Operation', timeout = null) {
    return new ApiError('TIMEOUT_ERROR', `${operation} timed out`, {
      operation,
      timeout
    });
  }

  /**
   * 내부 서버 오류 생성
   * @param {string} message - 오류 메시지
   * @param {Object} details - 상세 정보
   * @returns {ApiError} 내부 서버 오류 객체
   */
  static internal(message = 'Internal server error', details = null) {
    return new ApiError('INTERNAL_ERROR', message, details);
  }
}

module.exports = { ApiResponse, ApiError };