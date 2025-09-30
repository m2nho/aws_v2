const express = require('express');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const dynamoService = require('../services/dynamoService');
const stsService = require('../services/stsService');

const router = express.Router();

/**
 * GET /api/admin/users
 * 관리자용 사용자 목록 조회
 * 
 * Headers:
 * - Authorization: Bearer <admin-token>
 * 
 * 관리자 권한 필요
 */
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // DynamoDB에서 모든 사용자 조회
    const result = await dynamoService.getAllUsers();
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to retrieve users from database',
          details: result.error || 'Database query failed'
        }
      });
    }

    // 사용자 목록을 요구사항에 맞는 형태로 변환
    const users = result.users.map(user => ({
      userId: user.userId,
      username: user.username,
      companyName: user.companyName,
      status: user.status,
      roleArn: user.roleArn,
      arnValidation: user.arnValidation || {
        isValid: null,
        lastChecked: null,
        error: null
      },
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      isAdmin: user.isAdmin || false
    }));

    res.json({
      success: true,
      message: 'User list retrieved successfully',
      data: users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve user list',
        details: 'An error occurred while retrieving user list'
      }
    });
  }
});

/**
 * PUT /api/admin/users/:userId/status
 * 사용자 상태 변경
 * 
 * Headers:
 * - Authorization: Bearer <admin-token>
 * 
 * Body:
 * - status: 'approved' | 'rejected'
 * 
 * 관리자 권한 필요
 */
router.put('/users/:userId/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;
    
    // 입력 데이터 검증
    if (!userId || userId.trim() === '') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'User ID is required',
          details: 'userId parameter is missing or empty'
        }
      });
    }
    
    if (!status) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Status is required',
          details: 'status field is missing in request body'
        }
      });
    }
    
    // 상태 값 검증
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid status value',
          details: 'Status must be either "approved" or "rejected"'
        }
      });
    }
    
    // DynamoDB에서 사용자 상태 업데이트
    const result = await dynamoService.updateUserStatus(userId, status);
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to update user status in database',
          details: result.error || 'Database update failed'
        }
      });
    }
    
    res.json({
      success: true,
      message: `User status updated to ${status}`,
      data: {
        userId,
        newStatus: status,
        updatedBy: req.user.username,
        updatedAt: result.user.updatedAt,
        user: {
          userId: result.user.userId,
          username: result.user.username,
          companyName: result.user.companyName,
          status: result.user.status,
          roleArn: result.user.roleArn,
          updatedAt: result.user.updatedAt
        }
      }
    });
  } catch (error) {
    // 사용자를 찾을 수 없는 경우
    if (error.message.includes('사용자를 찾을 수 없습니다')) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
          details: 'The specified user does not exist'
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update user status',
        details: 'An error occurred while updating user status'
      }
    });
  }
});

/**
 * POST /api/admin/users/:userId/validate-arn
 * AWS Role ARN 검증
 * 
 * Headers:
 * - Authorization: Bearer <admin-token>
 * 
 * 관리자 권한 필요
 */
router.post('/users/:userId/validate-arn', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // 입력 데이터 검증
    if (!userId || userId.trim() === '') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'User ID is required',
          details: 'userId parameter is missing or empty'
        }
      });
    }
    
    // 사용자 존재 여부 확인
    const userResult = await dynamoService.getUserById(userId);
    if (!userResult.success) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
          details: 'The specified user does not exist'
        }
      });
    }
    
    const user = userResult.user;
    
    // 사용자에게 Role ARN이 있는지 확인
    if (!user.roleArn) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_ARN',
          message: 'User does not have a Role ARN',
          details: 'Cannot validate ARN because user has no Role ARN configured'
        }
      });
    }
    
    // STS를 통한 ARN 검증 수행
    const validationResult = await stsService.validateRoleArn(
      user.roleArn, 
      `aws-user-management-${userId.substring(0, 8)}`
    );
    
    // 검증 결과를 DynamoDB에 저장
    const updateResult = await dynamoService.updateArnValidation(
      userId,
      validationResult.isValid,
      validationResult.isValid ? null : validationResult.error
    );
    
    if (!updateResult.success) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to save validation result',
          details: 'ARN validation completed but failed to save result to database'
        }
      });
    }
    
    // 성공 응답
    res.json({
      success: true,
      message: 'ARN validation completed',
      data: {
        userId,
        roleArn: user.roleArn,
        arnValid: validationResult.isValid,
        lastChecked: updateResult.user.arnValidation.lastChecked,
        validatedBy: req.user.username,
        error: validationResult.isValid ? null : validationResult.error,
        user: {
          userId: updateResult.user.userId,
          username: updateResult.user.username,
          companyName: updateResult.user.companyName,
          status: updateResult.user.status,
          roleArn: updateResult.user.roleArn,
          arnValidation: updateResult.user.arnValidation,
          updatedAt: updateResult.user.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('ARN validation error:', error);
    
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to validate ARN',
        details: 'An error occurred while validating AWS Role ARN'
      }
    });
  }
});

module.exports = router;