const express = require('express');
const { validateRegistration, validateLogin } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');
const { register, login, verify } = require('../controllers/authController');

const router = express.Router();

/**
 * POST /api/auth/register
 * 사용자 회원가입
 * 
 * Body:
 * - username: string (required, min 3 chars)
 * - password: string (required, min 8 chars)
 * - roleArn: string (required, valid AWS ARN format)
 * - companyName: string (required, min 2 chars)
 */
router.post('/register', validateRegistration, register);

/**
 * POST /api/auth/login
 * 사용자 로그인
 * 
 * Body:
 * - username: string (required)
 * - password: string (required)
 */
router.post('/login', validateLogin, login);

/**
 * GET /api/auth/verify
 * JWT 토큰 검증
 * 
 * Headers:
 * - Authorization: Bearer <token>
 */
router.get('/verify', authenticateToken, verify);

module.exports = router;