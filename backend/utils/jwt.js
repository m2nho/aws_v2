const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * JWT 토큰 생성
 * @param {Object} payload - 토큰에 포함할 데이터
 * @param {string} payload.userId - 사용자 ID
 * @param {string} payload.username - 사용자명
 * @param {string} payload.status - 사용자 상태
 * @param {boolean} payload.isAdmin - 관리자 여부 (선택사항)
 * @returns {string} JWT 토큰
 */
const generateToken = (payload) => {
  try {
    const tokenPayload = {
      userId: payload.userId,
      username: payload.username,
      status: payload.status,
      isAdmin: payload.isAdmin || false,
      iat: Math.floor(Date.now() / 1000),
    };

    return jwt.sign(tokenPayload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });
  } catch (error) {
    throw new Error('토큰 생성 실패');
  }
};

/**
 * JWT 토큰 검증
 * @param {string} token - 검증할 토큰
 * @returns {Object} 디코딩된 토큰 데이터
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch (error) {
    // JWT 에러는 정상적인 인증 실패이므로 로깅하지 않음
    // 대신 에러 타입에 따라 적절한 메시지 반환
    if (error.name === 'TokenExpiredError') {
      throw new Error('TOKEN_EXPIRED');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('INVALID_TOKEN');
    } else {
      throw new Error('TOKEN_VERIFICATION_FAILED');
    }
  }
};

/**
 * JWT 토큰 디코딩 (검증 없이)
 * @param {string} token - 디코딩할 토큰
 * @returns {Object} 디코딩된 토큰 데이터
 */
const decodeToken = (token) => {
  try {
    return jwt.decode(token);
  } catch (error) {
    throw new Error('토큰 디코딩 실패');
  }
};

module.exports = {
  generateToken,
  verifyToken,
  decodeToken,
};