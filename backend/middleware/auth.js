const { verifyToken } = require('../utils/jwt');

/**
 * JWT 토큰 검증 미들웨어
 * Authorization 헤더에서 Bearer 토큰을 추출하고 검증합니다.
 * 검증된 사용자 정보를 req.user에 저장합니다.
 */
const authenticateToken = (req, res, next) => {
  try {
    // Authorization 헤더에서 토큰 추출
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Access token is required',
          details: 'Authorization header is missing'
        }
      });
    }

    // Bearer 토큰 형식 확인
    const tokenParts = authHeader.split(' ');
    if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN_FORMAT',
          message: 'Invalid token format',
          details: 'Token must be in Bearer format'
        }
      });
    }

    const token = tokenParts[1];

    // 토큰 검증
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (jwtError) {
      // JWT 관련 에러를 조용히 처리 (로깅 없음)
      if (jwtError.message === 'TOKEN_EXPIRED') {
        return res.status(401).json({
          success: false,
          error: {
            code: 'TOKEN_EXPIRED',
            message: 'Token has expired',
            details: 'Please login again to get a new token'
          }
        });
      } else if (jwtError.message === 'INVALID_TOKEN') {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid token',
            details: 'Token signature verification failed'
          }
        });
      } else {
        return res.status(401).json({
          success: false,
          error: {
            code: 'TOKEN_VERIFICATION_FAILED',
            message: 'Token verification failed',
            details: 'Unable to verify token'
          }
        });
      }
    }
    
    // 토큰에서 필수 필드 확인
    if (!decoded.userId || !decoded.username) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN_PAYLOAD',
          message: 'Invalid token payload',
          details: 'Token is missing required user information'
        }
      });
    }

    // 검증된 사용자 정보를 req.user에 저장
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      status: decoded.status,
      isAdmin: decoded.isAdmin || false
    };

    next();

  } catch (error) {
    // 예상치 못한 서버 에러만 로깅 (인증 실패는 정상적인 동작이므로 로깅하지 않음)
    console.error('Unexpected authentication error:', error);
    
    // 일반적인 서버 오류
    return res.status(500).json({
      success: false,
      error: {
        code: 'AUTHENTICATION_ERROR',
        message: 'Authentication failed',
        details: 'An unexpected error occurred during authentication'
      }
    });
  }
};

/**
 * 관리자 권한 확인 미들웨어
 * authenticateToken 미들웨어 이후에 사용해야 합니다.
 * req.user.isAdmin이 true인지 확인합니다.
 */
const requireAdmin = (req, res, next) => {
  try {
    // authenticateToken 미들웨어가 먼저 실행되었는지 확인
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required',
          details: 'User must be authenticated before checking admin privileges'
        }
      });
    }

    // 관리자 권한 확인
    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'PERMISSION_DENIED',
          message: 'Admin privileges required',
          details: 'This operation requires administrator privileges'
        }
      });
    }

    // 관리자 권한이 확인되면 다음 미들웨어로 진행
    next();

  } catch (error) {
    // 예상치 못한 서버 에러만 로깅
    console.error('Unexpected admin verification error:', error);
    
    return res.status(500).json({
      success: false,
      error: {
        code: 'ADMIN_VERIFICATION_ERROR',
        message: 'Admin verification failed',
        details: 'An error occurred while verifying admin privileges'
      }
    });
  }
};

/**
 * 사용자 상태 확인 미들웨어
 * authenticateToken 미들웨어 이후에 사용해야 합니다.
 * 사용자 상태가 'approved'인지 확인합니다.
 */
const requireApprovedUser = (req, res, next) => {
  try {
    // authenticateToken 미들웨어가 먼저 실행되었는지 확인
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required',
          details: 'User must be authenticated before checking user status'
        }
      });
    }

    // 사용자 상태 확인
    if (req.user.status !== 'approved') {
      let message = 'Account access denied';
      let details = 'Your account status does not allow access to this resource';

      if (req.user.status === 'pending') {
        message = 'Account pending approval';
        details = 'Your account is waiting for administrator approval';
      } else if (req.user.status === 'rejected') {
        message = 'Account access rejected';
        details = 'Your account has been rejected by an administrator';
      }

      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_STATUS_DENIED',
          message: message,
          details: details
        }
      });
    }

    // 승인된 사용자이면 다음 미들웨어로 진행
    next();

  } catch (error) {
    // 예상치 못한 서버 에러만 로깅
    console.error('Unexpected user status verification error:', error);
    
    return res.status(500).json({
      success: false,
      error: {
        code: 'STATUS_VERIFICATION_ERROR',
        message: 'User status verification failed',
        details: 'An error occurred while verifying user status'
      }
    });
  }
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requireApprovedUser
};