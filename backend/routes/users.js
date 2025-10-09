const express = require('express');
const { authenticateToken, requireApprovedUser } = require('../middleware/auth');
const dynamoService = require('../services/dynamoService');

const router = express.Router();

/**
 * GET /api/users/profile
 * 사용자 프로필 조회
 * 
 * Headers:
 * - Authorization: Bearer <token>
 * 
 * 인증된 사용자만 접근 가능
 * Requirements: 4.2, 4.3, 4.4, 4.5
 */
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    // authenticateToken 미들웨어에서 설정한 req.user 사용
    const { userId } = req.user;
    
    // DynamoDB에서 완전한 사용자 정보 조회
    const userResult = await dynamoService.getUserById(userId);
    
    if (!userResult.success) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User profile not found',
          details: 'User metadata not found in database'
        }
      });
    }

    const user = userResult.user;
    
    // 사용자 상태에 따른 메시지 설정 (Requirements 4.3, 4.4, 4.5)
    let statusMessage = '';
    let accessLevel = 'none';
    
    switch (user.status) {
      case 'pending':
        statusMessage = 'Your account is waiting for administrator approval. You will be notified once your account is reviewed.';
        accessLevel = 'limited';
        break;
      case 'rejected':
        statusMessage = 'Your account has been rejected by an administrator. Please contact support for more information.';
        accessLevel = 'denied';
        break;
      case 'approved':
        statusMessage = 'Your account is active and you have full access to all features.';
        accessLevel = 'full';
        break;
      default:
        statusMessage = 'Unknown account status. Please contact support.';
        accessLevel = 'none';
    }

    // 성공 응답 (Requirement 4.2)
    res.json({
      success: true,
      message: 'Profile retrieved successfully',
      data: {
        userId: user.userId,
        username: user.username,
        companyName: user.companyName,
        roleArn: user.roleArn,
        status: user.status,
        statusMessage,
        accessLevel,
        arnValidation: user.arnValidation,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
    
  } catch (error) {
    // 테스트 환경이 아닐 때만 에러 로깅
    if (process.env.NODE_ENV !== 'test') {
      console.error('Profile retrieval error:', error);
    }
    
    // DynamoDB 관련 에러 처리
    if (error.message.includes('사용자를 찾을 수 없습니다') || error.message.includes('User not found')) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User profile not found',
          details: 'User account not found in database'
        }
      });
    }

    // 일반적인 서버 오류
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve profile',
        details: 'An error occurred while retrieving user profile'
      }
    });
  }
});

/**
 * GET /api/users/dashboard
 * 사용자 대시보드 (승인된 사용자만)
 * 
 * Headers:
 * - Authorization: Bearer <token>
 * 
 * 승인된 사용자만 접근 가능
 */
router.get('/dashboard', authenticateToken, requireApprovedUser, (req, res) => {
  try {
    const { userId, username, status } = req.user;
    
    res.json({
      success: true,
      message: 'Dashboard data retrieved successfully',
      data: {
        userId,
        username,
        status,
        message: 'Welcome to your dashboard! This route requires approved user status.',
        features: [
          'View profile information',
          'Access approved user features',
          'Manage account settings'
        ]
      }
    });
  } catch (error) {
    // 테스트 환경이 아닐 때만 에러 로깅
    if (process.env.NODE_ENV !== 'test') {
      console.error('Dashboard retrieval error:', error);
    }
    
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve dashboard',
        details: 'An error occurred while retrieving dashboard data'
      }
    });
  }
});

/**
 * PUT /api/users/password
 * 사용자 비밀번호 변경
 * 
 * Headers:
 * - Authorization: Bearer <token>
 * 
 * Body:
 * - currentPassword: string (required)
 * - newPassword: string (required, min 8 chars)
 * - confirmPassword: string (required, must match newPassword)
 */
router.put('/password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const { username } = req.user;

    // 입력 검증
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required fields',
          details: 'Current password, new password, and confirm password are required'
        }
      });
    }

    // 새 비밀번호 길이 검증
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Password too short',
          details: 'New password must be at least 8 characters long'
        }
      });
    }

    // 새 비밀번호 확인
    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Password confirmation mismatch',
          details: 'New password and confirm password do not match'
        }
      });
    }

    // 현재 비밀번호와 새 비밀번호가 같은지 확인
    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Same password',
          details: 'New password must be different from current password'
        }
      });
    }

    // Cognito에서 현재 비밀번호 검증을 위해 로그인 시도
    const cognitoService = require('../services/cognitoService');
    const loginResult = await cognitoService.authenticateUser(username, currentPassword);
    
    if (!loginResult.success) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CURRENT_PASSWORD',
          message: 'Current password is incorrect',
          details: 'The provided current password does not match'
        }
      });
    }

    // 새 비밀번호로 변경
    const changeResult = await cognitoService.changePassword(username, newPassword);
    
    if (!changeResult.success) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'PASSWORD_CHANGE_FAILED',
          message: 'Failed to change password',
          details: changeResult.error || 'An error occurred while changing password'
        }
      });
    }

    // DynamoDB에서 사용자 정보 업데이트 (updatedAt 필드)
    try {
      await dynamoService.updateUserTimestamp(req.user.userId);
    } catch (updateError) {
      // 타임스탬프 업데이트 실패는 치명적이지 않으므로 로그만 남김
      console.warn('Failed to update user timestamp:', updateError);
    }

    res.json({
      success: true,
      message: 'Password changed successfully',
      data: {
        message: 'Your password has been updated successfully'
      }
    });

  } catch (error) {
    console.error('Password change error:', error);
    
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to change password',
        details: 'An internal error occurred while changing password'
      }
    });
  }
});

module.exports = router;