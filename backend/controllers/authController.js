const cognitoService = require('../services/cognitoService');
const dynamoService = require('../services/dynamoService');
const { generateToken } = require('../utils/jwt');

/**
 * 회원가입 처리
 * POST /api/auth/register
 */
const register = async (req, res) => {
    try {
        const { username, password, roleArn, companyName } = req.body;

        // 1. 먼저 DynamoDB에서 사용자명 중복 확인
        const existingUser = await dynamoService.getUserByUsername(username);
        if (existingUser.success) {
            return res.status(409).json({
                success: false,
                error: {
                    code: 'USER_EXISTS',
                    message: 'Username already exists',
                    details: 'A user with this username already exists in the system'
                }
            });
        }

        // 2. AWS Cognito에 사용자 생성
        const cognitoResult = await cognitoService.createUser(username, password);

        if (!cognitoResult.success) {
            return res.status(500).json({
                success: false,
                error: {
                    code: 'COGNITO_ERROR',
                    message: 'Failed to create user in Cognito',
                    details: 'User creation in AWS Cognito failed'
                }
            });
        }

        // 3. DynamoDB에 사용자 메타데이터 저장
        const dynamoResult = await dynamoService.createUser({
            username,
            companyName,
            roleArn,
            isAdmin: false // 회원가입 시 항상 일반 사용자로 설정
        });

        if (!dynamoResult.success) {
            // Cognito에서 사용자 생성은 성공했지만 DynamoDB 저장 실패 시 롤백
            try {
                await cognitoService.deleteUser(username);
            } catch (rollbackError) {
                // Rollback failed - continue with original error response
            }

            return res.status(500).json({
                success: false,
                error: {
                    code: 'DATABASE_ERROR',
                    message: 'Failed to save user metadata',
                    details: 'User metadata could not be saved to database'
                }
            });
        }

        // 4. 성공 응답
        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            userId: dynamoResult.userId,
            data: {
                username: dynamoResult.user.username,
                companyName: dynamoResult.user.companyName,
                status: dynamoResult.user.status,
                createdAt: dynamoResult.user.createdAt
            }
        });

    } catch (error) {
        // 에러 타입에 따른 적절한 응답
        if (error.message.includes('사용자가 이미 존재합니다') || error.message.includes('already exists')) {
            return res.status(409).json({
                success: false,
                error: {
                    code: 'USER_EXISTS',
                    message: 'User already exists',
                    details: error.message
                }
            });
        }

        if (error.message.includes('사용자 생성 실패') || error.message.includes('Cognito')) {
            return res.status(500).json({
                success: false,
                error: {
                    code: 'AUTH_FAILED',
                    message: 'Authentication service error',
                    details: 'Failed to create user in authentication service'
                }
            });
        }

        // 일반적인 서버 오류
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Internal server error',
                details: 'An unexpected error occurred during registration'
            }
        });
    }
};

/**
 * 로그인 처리
 * POST /api/auth/login
 */
const login = async (req, res) => {
    try {
        const { username, password } = req.body;

        // 1. AWS Cognito를 통한 사용자 인증
        const cognitoResult = await cognitoService.authenticateUser(username, password);

        if (!cognitoResult.success) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'AUTH_FAILED',
                    message: 'Authentication failed',
                    details: 'Invalid username or password'
                }
            });
        }

        // 2. DynamoDB에서 사용자 상태 및 메타데이터 조회
        const userResult = await dynamoService.getUserByUsername(username);

        if (!userResult.success) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'USER_NOT_FOUND',
                    message: 'User not found',
                    details: 'User metadata not found in database'
                }
            });
        }

        const user = userResult.user;

        // 3. JWT 토큰 생성
        const tokenPayload = {
            userId: user.userId,
            username: user.username,
            status: user.status,
            isAdmin: user.isAdmin || false // DynamoDB의 isAdmin 필드 사용
        };

        const jwtToken = generateToken(tokenPayload);

        // 4. 성공 응답 (사용자 상태 포함)
        res.status(200).json({
            success: true,
            message: 'Login successful',
            token: jwtToken,
            userStatus: user.status,
            data: {
                userId: user.userId,
                username: user.username,
                companyName: user.companyName,
                status: user.status,
                roleArn: user.roleArn,
                arnValidation: user.arnValidation,
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        // 에러 타입에 따른 적절한 응답
        if (error.message.includes('인증 실패') || error.message.includes('Authentication failed')) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'AUTH_FAILED',
                    message: 'Authentication failed',
                    details: 'Invalid username or password'
                }
            });
        }

        if (error.message.includes('사용자를 찾을 수 없습니다') || error.message.includes('User not found')) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'USER_NOT_FOUND',
                    message: 'User not found',
                    details: 'User account not found'
                }
            });
        }

        if (error.message.includes('토큰 생성 실패') || error.message.includes('JWT')) {
            return res.status(500).json({
                success: false,
                error: {
                    code: 'TOKEN_ERROR',
                    message: 'Token generation failed',
                    details: 'Failed to generate authentication token'
                }
            });
        }

        // 일반적인 서버 오류
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Internal server error',
                details: 'An unexpected error occurred during login'
            }
        });
    }
};

/**
 * 토큰 검증 처리
 * GET /api/auth/verify
 */
const verify = async (req, res) => {
    try {
        // 미들웨어에서 이미 토큰을 검증하고 사용자 정보를 req.user에 저장했음
        const { userId, username, status } = req.user;

        // DynamoDB에서 최신 사용자 정보 조회
        const userResult = await dynamoService.getUserByUsername(username);

        if (!userResult.success) {
            return res.status(404).json({
                success: false,
                valid: false,
                error: {
                    code: 'USER_NOT_FOUND',
                    message: 'User not found',
                    details: 'User metadata not found in database'
                }
            });
        }

        const user = userResult.user;

        // 토큰 검증 성공 응답
        res.status(200).json({
            success: true,
            valid: true,
            message: 'Token is valid',
            userInfo: {
                userId: user.userId,
                username: user.username,
                companyName: user.companyName,
                status: user.status,
                role: user.isAdmin ? 'admin' : 'user',
                roleArn: user.roleArn,
                arnValidation: user.arnValidation,
                createdAt: user.createdAt
            }
        });

    } catch (error) {

        
        res.status(500).json({
            success: false,
            valid: false,
            error: {
                code: 'VERIFICATION_ERROR',
                message: 'Token verification failed',
                details: 'An error occurred while verifying the token'
            }
        });
    }
};

module.exports = {
    register,
    login,
    verify
};