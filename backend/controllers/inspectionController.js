const inspectionService = require('../services/inspectionService');
const historyService = require('../services/historyService');
const inspectionItemService = require('../services/inspectionItemService');
const { ApiResponse, ApiError } = require('../models/ApiResponse');

/**
 * Inspection Controller
 * AWS 리소스 검사 관련 API 엔드포인트 구현
 * Requirements: 1.1, 1.2, 3.2, 6.3
 */

/**
 * 검사 시작
 * POST /api/inspections/start
 * Requirements: 1.1 - 승인된 고객이 AWS 서비스 검사를 요청
 */
const startInspection = async (req, res) => {
    try {

        
        const { serviceType, assumeRoleArn, inspectionConfig = {} } = req.body;
        const customerId = req.user.userId; // JWT 토큰에서 추출

        // 입력 검증
        if (!serviceType) {
            return res.status(400).json(ApiResponse.error({
                code: 'MISSING_SERVICE_TYPE',
                message: 'Service type is required',
                details: 'Please specify which AWS service to inspect (e.g., EC2, RDS, S3)'
            }));
        }

        if (!assumeRoleArn) {
            return res.status(400).json(ApiResponse.error({
                code: 'MISSING_ROLE_ARN',
                message: 'Assume role ARN is required',
                details: 'Please provide the ARN of the role to assume in your AWS account'
            }));
        }

        // 검사 시작
        const result = await inspectionService.startInspection(
            customerId,
            serviceType,
            assumeRoleArn,
            inspectionConfig
        );

        if (!result.success) {
            return res.status(500).json(ApiResponse.error({
                code: result.error?.code || 'INSPECTION_START_FAILED',
                message: result.error?.message || 'Failed to start inspection',
                details: result.error?.details || 'An error occurred while starting the inspection'
            }));
        }

        // 새로운 배치 방식 응답 처리
        if (result.data.batchId) {
            // 배치 방식 (여러 개별 검사)
            res.status(201).json(ApiResponse.success({
                message: result.data.message,
                batchId: result.data.batchId,
                inspectionJobs: result.data.inspectionJobs,
                serviceType: serviceType,
                totalJobs: result.data.inspectionJobs.length
            }));
        } else {
            // 기존 방식 (단일 검사) - 호환성 유지
            res.status(201).json(ApiResponse.success({
                message: 'Inspection started successfully',
                inspectionId: result.data.inspectionId,
                serviceType: serviceType,
                status: result.data.status,
                estimatedDuration: result.estimatedDuration
            }));
        }

    } catch (error) {
        console.error('Start inspection error:', error);
        res.status(500).json(ApiResponse.error({
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
            details: 'An unexpected error occurred while starting the inspection'
        }));
    }
};/**
 * 검사
 상세 조회
 * GET /api/inspections/:id
 * Requirements: 1.2 - 고객이 특정 검사 결과를 선택하여 상세 조회
 */
const getInspectionDetails = async (req, res) => {
    try {
        const { id: inspectionId } = req.params;
        const customerId = req.user.userId;

        if (!inspectionId) {
            return res.status(400).json(ApiResponse.error({
                code: 'MISSING_INSPECTION_ID',
                message: 'Inspection ID is required',
                details: 'Please provide a valid inspection ID'
            }));
        }

        // 검사 결과 조회
        const result = await inspectionService.getInspectionResult(inspectionId, customerId);

        if (!result.success) {
            if (result.error?.code === 'INSPECTION_NOT_FOUND') {
                return res.status(404).json(ApiResponse.error({
                    code: 'INSPECTION_NOT_FOUND',
                    message: 'Inspection not found',
                    details: 'The requested inspection could not be found or you do not have access to it'
                }));
            }

            return res.status(500).json(ApiResponse.error({
                code: result.error?.code || 'INSPECTION_RETRIEVAL_FAILED',
                message: result.error?.message || 'Failed to retrieve inspection details',
                details: result.error?.details || 'An error occurred while retrieving the inspection'
            }));
        }


        
        // 명시적으로 응답 구조 생성
        const responseData = {
            message: 'Inspection details retrieved successfully',
            inspectionId: result.inspection.inspectionId,
            serviceType: result.inspection.serviceType,
            status: result.inspection.status,
            startTime: result.inspection.startTime,
            endTime: result.inspection.endTime,
            duration: result.inspection.duration,
            results: result.inspection.results
        };
        
        // ApiResponse 생성 전 확인
        const apiResponse = ApiResponse.success(responseData);
        
        res.status(200).json(apiResponse);

    } catch (error) {
        console.error('Get inspection details error:', error);
        res.status(500).json(ApiResponse.error({
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
            details: 'An unexpected error occurred while retrieving inspection details'
        }));
    }
};

/**
 * 검사 이력 조회
 * GET /api/inspections/history
 * Requirements: 3.2 - 고객이 검사 이력을 요청하여 날짜순으로 정렬된 검사 이력을 표시
 */
const getInspectionHistory = async (req, res) => {
    try {
        const customerId = req.user.userId;
        const { 
            serviceType, 
            limit = 20, 
            lastEvaluatedKey,
            startDate,
            endDate 
        } = req.query;

        // 쿼리 파라미터 검증
        const queryLimit = Math.min(parseInt(limit) || 20, 100); // 최대 100개로 제한

        const filters = {
            serviceType,
            startDate: startDate ? new Date(startDate).getTime() : undefined,
            endDate: endDate ? new Date(endDate).getTime() : undefined
        };

        // 검사 이력 조회 (단일 테이블 구조)
        const result = await historyService.getInspectionHistoryList(
            customerId,
            {
                limit: queryLimit,
                serviceType
            }
        );

        if (!result.success) {
            return res.status(500).json(ApiResponse.error({
                code: result.error?.code || 'HISTORY_RETRIEVAL_FAILED',
                message: result.error?.message || 'Failed to retrieve inspection history',
                details: result.error?.details || 'An error occurred while retrieving inspection history'
            }));
        }

        res.status(200).json(ApiResponse.success({
            message: 'Inspection history retrieved successfully',
            inspections: result.data.inspections,
            hasMore: result.data.hasMore,
            totalCount: result.data.count
        }));

    } catch (error) {
        console.error('Get inspection history error:', error);
        res.status(500).json(ApiResponse.error({
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
            details: 'An unexpected error occurred while retrieving inspection history'
        }));
    }
};/**
 *
 검사 상태 조회
 * GET /api/inspections/:id/status
 * Requirements: 6.3 - 검사 진행 상황을 실시간으로 확인
 */
const getInspectionStatus = async (req, res) => {
    try {
        const { id: inspectionId } = req.params;
        const customerId = req.user.userId;

        if (!inspectionId) {
            return res.status(400).json(ApiResponse.error({
                code: 'MISSING_INSPECTION_ID',
                message: 'Inspection ID is required',
                details: 'Please provide a valid inspection ID'
            }));
        }

        // 검사 상태 조회
        const result = await inspectionService.getInspectionStatus(inspectionId, customerId);

        if (!result.success) {
            if (result.error?.code === 'INSPECTION_NOT_FOUND') {
                return res.status(404).json(ApiResponse.error({
                    code: 'INSPECTION_NOT_FOUND',
                    message: 'Inspection not found',
                    details: 'The requested inspection could not be found or you do not have access to it'
                }));
            }

            return res.status(500).json(ApiResponse.error({
                code: result.error?.code || 'STATUS_RETRIEVAL_FAILED',
                message: result.error?.message || 'Failed to retrieve inspection status',
                details: result.error?.details || 'An error occurred while retrieving the inspection status'
            }));
        }

        res.status(200).json(ApiResponse.success({
            message: 'Inspection status retrieved successfully',
            inspectionId: result.inspectionId,
            status: result.status,
            progress: result.progress,
            estimatedTimeRemaining: result.estimatedTimeRemaining,
            currentStep: result.currentStep,
            startTime: result.startTime,
            lastUpdated: result.lastUpdated
        }));

    } catch (error) {
        console.error('Get inspection status error:', error);
        res.status(500).json(ApiResponse.error({
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
            details: 'An unexpected error occurred while retrieving inspection status'
        }));
    }
};

/**
 * 사용 가능한 검사 서비스 목록 조회
 * GET /api/inspections/services
 * Requirements: 1.1 - 사용 가능한 검사 유형 목록을 표시
 */
const getAvailableServices = async (req, res) => {
    try {
        // 사용 가능한 AWS 서비스 목록
        const availableServices = [
            {
                id: 'EC2',
                name: 'Amazon EC2',
                description: 'EC2 인스턴스, 보안 그룹, 키 페어 등을 검사합니다',
                icon: '🖥️',
                categories: ['SECURITY', 'PERFORMANCE', 'COST'],
                estimatedDuration: '2-5분',
                features: [
                    '보안 그룹 규칙 분석',
                    '인스턴스 상태 확인',
                    '키 페어 보안 검사',
                    '네트워크 ACL 검토'
                ]
            },
            {
                id: 'RDS',
                name: 'Amazon RDS',
                description: 'RDS 데이터베이스 인스턴스의 보안 및 성능을 검사합니다',
                icon: '🗄️',
                categories: ['SECURITY', 'PERFORMANCE', 'RELIABILITY'],
                estimatedDuration: '3-7분',
                features: [
                    '데이터베이스 보안 설정',
                    '백업 구성 확인',
                    '성능 모니터링 설정',
                    '암호화 상태 검사'
                ]
            },
            {
                id: 'S3',
                name: 'Amazon S3',
                description: 'S3 버킷의 보안, 권한, 정책을 검사합니다',
                icon: '🪣',
                categories: ['SECURITY', 'COMPLIANCE', 'COST'],
                estimatedDuration: '1-3분',
                features: [
                    '버킷 정책 분석',
                    '퍼블릭 액세스 확인',
                    '암호화 설정 검토',
                    '버전 관리 상태'
                ]
            },
            {
                id: 'IAM',
                name: 'AWS IAM',
                description: 'IAM 사용자, 역할, 정책의 보안을 검사합니다',
                icon: '👤',
                categories: ['SECURITY', 'COMPLIANCE'],
                estimatedDuration: '2-4분',
                features: [
                    '사용자 권한 분석',
                    '역할 정책 검토',
                    'MFA 설정 확인',
                    '액세스 키 상태'
                ]
            },
            {
                id: 'VPC',
                name: 'Amazon VPC',
                description: 'VPC 네트워크 구성 및 보안을 검사합니다',
                icon: '🌐',
                categories: ['SECURITY', 'PERFORMANCE'],
                estimatedDuration: '3-6분',
                features: [
                    'VPC 구성 분석',
                    '서브넷 설정 검토',
                    '라우팅 테이블 확인',
                    'NAT 게이트웨이 상태'
                ]
            }
        ];

        res.status(200).json(ApiResponse.success({
            message: 'Available services retrieved successfully',
            services: availableServices,
            totalCount: availableServices.length
        }));

    } catch (error) {
        console.error('Get available services error:', error);
        res.status(500).json(ApiResponse.error({
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
            details: 'An unexpected error occurred while retrieving available services'
        }));
    }
};

/**
 * 서비스별 검사 항목 상태 조회
 * GET /api/inspections/services/:serviceType/items
 */
const getServiceItemStatus = async (req, res) => {
    try {
        const { serviceType } = req.params;
        const customerId = req.user.userId;

        if (!serviceType) {
            return res.status(400).json(ApiResponse.error({
                code: 'MISSING_SERVICE_TYPE',
                message: 'Service type is required',
                details: 'Please specify the service type (EC2, RDS, S3, IAM)'
            }));
        }

        const result = await inspectionItemService.getServiceItemResults(customerId, serviceType);

        if (!result.success) {
            return res.status(500).json(ApiResponse.error({
                code: 'ITEM_STATUS_RETRIEVAL_FAILED',
                message: 'Failed to retrieve item status',
                details: result.error
            }));
        }

        res.status(200).json(ApiResponse.success({
            message: 'Service item status retrieved successfully',
            serviceType,
            items: result.data
        }));

    } catch (error) {
        console.error('Get service item status error:', error);
        res.status(500).json(ApiResponse.error({
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
            details: 'An unexpected error occurred while retrieving service item status'
        }));
    }
};

/**
 * 검사 항목별 히스토리 조회
 * GET /api/inspections/items/history
 */
const getItemHistory = async (req, res) => {
    try {
        const customerId = req.user.userId;
        const { 
            serviceType, 
            limit = 50, 
            startDate,
            endDate 
        } = req.query;



        // 검사 항목 히스토리 조회
        const result = await inspectionItemService.getItemHistory(customerId, {
            serviceType,
            limit: parseInt(limit),
            startDate,
            endDate
        });
        
        if (!result.success) {
            return res.status(500).json(ApiResponse.error({
                code: 'ITEM_HISTORY_RETRIEVAL_FAILED',
                message: 'Failed to retrieve item history',
                details: result.error
            }));
        }

        // 응답 형태로 변환
        const formattedItems = result.data.map(item => ({
            ...item,
            type: 'item',
            displayTime: item.lastInspectionTime,
            displayId: `${item.serviceType}-${item.itemId}-${item.lastInspectionTime}`
        }));

        res.status(200).json(ApiResponse.success({
            message: 'Item history retrieved successfully',
            items: formattedItems,
            totalCount: result.count,
            hasMore: result.hasMore
        }));

    } catch (error) {
        console.error('Get item history error:', error);
        res.status(500).json(ApiResponse.error({
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
            details: 'An unexpected error occurred while retrieving item history'
        }));
    }
};

/**
 * 모든 서비스의 검사 항목 상태 조회
 * GET /api/inspections/items/status
 */
const getAllItemStatus = async (req, res) => {
    try {
        const customerId = req.user.userId;
        console.log(`🔍 [InspectionController] Getting all item status for customer ${customerId}`);


        // 단일 테이블 구조에서 최신 검사 결과 조회
        const historyService = require('../services/historyService');
        const result = await historyService.getLatestInspectionResults(customerId);
        
        console.log(`🔍 [InspectionController] History service result:`, {
            success: result.success,
            hasData: !!result.data,
            serviceCount: Object.keys(result.data?.services || {}).length
        });


        if (!result.success) {
            console.error(`❌ [InspectionController] Failed to get item status for ${customerId}`);
            return res.status(500).json(ApiResponse.error({
                code: 'ALL_ITEM_STATUS_RETRIEVAL_FAILED',
                message: 'Failed to retrieve all item status',
                details: result.error
            }));
        }

        console.log(`✅ [InspectionController] Returning item status for ${customerId}`, {
            serviceTypes: Object.keys(result.data.services),
            totalItems: Object.values(result.data.services).reduce((sum, service) => sum + Object.keys(service).length, 0)
        });

        // 캐시 무효화 헤더 추가
        res.set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        
        res.status(200).json(ApiResponse.success(result.data));

    } catch (error) {
        console.error(`❌ [InspectionController] Get all item status error for customer:`, error);
        res.status(500).json(ApiResponse.error({
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
            details: 'An unexpected error occurred while retrieving all item status'
        }));
    }
};

/**
 * 항목별 검사 이력 조회
 * GET /api/inspections/items/history
 */
const getItemInspectionHistory = async (req, res) => {
    try {
        const customerId = req.user.userId;
        const { 
            serviceType, 
            limit = 50,
            startDate,
            endDate,
            status,
            historyMode
        } = req.query;



        // 쿼리 파라미터 검증
        const queryLimit = Math.min(parseInt(limit) || 50, 100); // 최대 100개로 제한

        // 항목별 검사 이력 조회
        const result = await historyService.getItemInspectionHistory(
            customerId,
            {
                limit: queryLimit,
                serviceType,
                startDate,
                endDate,
                status,
                historyMode
            }
        );

        if (!result.success) {
            return res.status(500).json(ApiResponse.error({
                code: result.error?.code || 'ITEM_HISTORY_RETRIEVAL_FAILED',
                message: result.error?.message || 'Failed to retrieve item inspection history',
                details: result.error?.details || 'An error occurred while retrieving item inspection history'
            }));
        }

        res.status(200).json(ApiResponse.success({
            message: 'Item inspection history retrieved successfully',
            items: result.data.items,
            totalCount: result.data.count
        }));

    } catch (error) {
        console.error('Get item inspection history error:', error);
        res.status(500).json(ApiResponse.error({
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
            details: 'An unexpected error occurred while retrieving item inspection history'
        }));
    }
};

/**
 * 데이터 일관성 검증
 * GET /api/inspections/:id/consistency
 */
const validateDataConsistency = async (req, res) => {
    try {
        const { id: inspectionId } = req.params;
        const customerId = req.user.userId;

        if (!inspectionId) {
            return res.status(400).json(ApiResponse.error({
                code: 'MISSING_INSPECTION_ID',
                message: 'Inspection ID is required',
                details: 'Please provide a valid inspection ID'
            }));
        }

        const dataConsistencyService = require('../services/dataConsistencyService');
        const result = await dataConsistencyService.validateInspectionConsistency(
            customerId, 
            inspectionId
        );

        if (!result.success) {
            return res.status(500).json(ApiResponse.error({
                code: 'CONSISTENCY_VALIDATION_FAILED',
                message: 'Failed to validate data consistency',
                details: result.error
            }));
        }

        res.status(200).json(ApiResponse.success({
            message: 'Data consistency validation completed',
            inspectionId,
            isConsistent: result.isConsistent,
            issues: result.issues || [],
            analysis: result.analysis,
            canRecover: result.canRecover
        }));

    } catch (error) {
        console.error('Validate data consistency error:', error);
        res.status(500).json(ApiResponse.error({
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
            details: 'An unexpected error occurred while validating data consistency'
        }));
    }
};

/**
 * 데이터 일관성 복구
 * POST /api/inspections/:id/recover
 */
const recoverDataConsistency = async (req, res) => {
    try {
        const { id: inspectionId } = req.params;
        const customerId = req.user.userId;
        const recoveryOptions = req.body || {};

        if (!inspectionId) {
            return res.status(400).json(ApiResponse.error({
                code: 'MISSING_INSPECTION_ID',
                message: 'Inspection ID is required',
                details: 'Please provide a valid inspection ID'
            }));
        }

        const dataConsistencyService = require('../services/dataConsistencyService');
        const result = await dataConsistencyService.recoverDataConsistency(
            customerId, 
            inspectionId,
            recoveryOptions
        );

        if (!result.success) {
            return res.status(500).json(ApiResponse.error({
                code: 'CONSISTENCY_RECOVERY_FAILED',
                message: 'Failed to recover data consistency',
                details: result.error
            }));
        }

        res.status(200).json(ApiResponse.success({
            message: result.message,
            inspectionId,
            actionsPerformed: result.actionsPerformed,
            finalConsistencyStatus: result.finalConsistencyStatus,
            remainingIssues: result.remainingIssues
        }));

    } catch (error) {
        console.error('Recover data consistency error:', error);
        res.status(500).json(ApiResponse.error({
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
            details: 'An unexpected error occurred while recovering data consistency'
        }));
    }
};

module.exports = {
    startInspection,
    getInspectionDetails,
    getInspectionHistory,
    getInspectionStatus,
    getAvailableServices,
    getServiceItemStatus,
    getAllItemStatus,
    getItemHistory,
    getItemInspectionHistory,
    validateDataConsistency,
    recoverDataConsistency
};