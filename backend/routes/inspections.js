const express = require('express');
const { authenticateToken, requireApprovedUser } = require('../middleware/auth');
const { validateInspectionStart } = require('../middleware/validation');
const { inspectionLimiter } = require('../middleware/rateLimiter');
const inspectionController = require('../controllers/inspectionController');

const router = express.Router();

// 검사 관련 API에 별도의 Rate Limiting 적용
router.use(inspectionLimiter);

// 모든 inspection 라우트는 인증과 승인된 사용자 상태가 필요
// Requirements: 1.1 - 승인된 고객만 AWS 서비스 검사를 요청할 수 있음
router.use(authenticateToken);
router.use(requireApprovedUser);

/**
 * GET /api/inspections/services
 * 사용 가능한 검사 서비스 목록 조회
 * Requirements: 1.1 - 사용 가능한 검사 유형 목록을 표시
 */
router.get('/services', inspectionController.getAvailableServices);

/**
 * POST /api/inspections/start
 * 검사 시작
 * Requirements: 1.1 - 승인된 고객이 AWS 서비스 검사를 요청
 */
router.post('/start', validateInspectionStart, inspectionController.startInspection);

/**
 * GET /api/inspections/history
 * 검사 이력 조회
 * Requirements: 3.2 - 고객이 검사 이력을 요청하여 날짜순으로 정렬된 검사 이력을 표시
 * 
 * Note: 구체적인 경로들은 /:id 보다 먼저 정의해야 함 (라우트 우선순위)
 */
router.get('/history', inspectionController.getInspectionHistory);

/**
 * GET /api/inspections/items/history
 * 검사 항목별 히스토리 조회
 * 각 검사 항목별로 개별 기록을 시간순으로 표시
 */
router.get('/items/history', inspectionController.getItemInspectionHistory);

/**
 * GET /api/inspections/items/status
 * 모든 서비스의 검사 항목 상태 조회
 * Trusted Advisor 스타일 - 각 검사 항목별 최근 상태
 */
router.get('/items/status', inspectionController.getAllItemStatus);

/**
 * GET /api/inspections/services/:serviceType/items
 * 특정 서비스의 검사 항목 상태 조회
 * Trusted Advisor 스타일 - 서비스별 검사 항목 상태
 */
router.get('/services/:serviceType/items', inspectionController.getServiceItemStatus);

/**
 * GET /api/inspections/:id
 * 검사 상세 조회
 * Requirements: 1.2 - 고객이 특정 검사 결과를 선택하여 상세 조회
 */
router.get('/:id', inspectionController.getInspectionDetails);

/**
 * GET /api/inspections/:id/status
 * 검사 상태 조회
 * Requirements: 6.3 - 검사 진행 상황을 실시간으로 확인
 */
router.get('/:id/status', inspectionController.getInspectionStatus);

/**
 * GET /api/inspections/:id/consistency
 * 검사 데이터 일관성 검증
 */
router.get('/:id/consistency', inspectionController.validateDataConsistency);

/**
 * POST /api/inspections/:id/recover
 * 검사 데이터 일관성 복구
 */
router.post('/:id/recover', inspectionController.recoverDataConsistency);

module.exports = router;