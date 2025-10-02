# Data Models Documentation

이 디렉토리는 AWS 리소스 검사 시스템의 핵심 데이터 모델들을 포함합니다.

## 모델 개요

### 1. InspectionResult
검사 결과를 저장하고 관리하는 메인 모델입니다.

```javascript
const { InspectionResult } = require('./models');

// 새 검사 결과 생성
const result = new InspectionResult({
  customerId: 'customer-123',
  inspectionId: 'inspection-456',
  serviceType: 'EC2',
  assumeRoleArn: 'arn:aws:iam::123456789012:role/InspectionRole'
});

// 검사 완료 처리
result.complete({
  summary: { totalResources: 25, highRiskIssues: 3 },
  findings: [...]
});

// DynamoDB 저장용 변환
const dynamoItem = result.toDynamoDBItem();
```

### 2. InspectionStatus
검사 진행 상태와 진행률을 관리하는 모델입니다.

```javascript
const { InspectionStatus } = require('./models');

// 상태 객체 생성
const status = new InspectionStatus({
  inspectionId: 'inspection-456'
});

// 검사 시작
status.start('Initializing EC2 inspection');

// 진행률 업데이트
status.updateProgress({
  currentStep: 'Analyzing Security Groups',
  completedSteps: 3,
  totalSteps: 10,
  percentage: 30,
  estimatedTimeRemaining: 120000
});

// API 응답용 변환
const apiResponse = status.toApiResponse();
```

### 3. InspectionFinding
개별 검사 결과 항목을 나타내는 모델입니다.

```javascript
const { InspectionFinding } = require('./models');

// Finding 생성
const finding = new InspectionFinding({
  resourceId: 'sg-123456',
  resourceType: 'SecurityGroup',
  riskLevel: 'HIGH',
  issue: 'Security group allows unrestricted access (0.0.0.0/0) on port 22',
  recommendation: 'Restrict SSH access to specific IP ranges',
  details: {
    groupId: 'sg-123456',
    rules: [...]
  }
});

// 보안 그룹 Finding 생성 헬퍼
const sgFinding = InspectionFinding.createSecurityGroupFinding(
  securityGroup,
  'Unrestricted SSH access',
  'Restrict SSH access to specific IP ranges'
);

// 여러 Finding 요약 생성
const summary = InspectionFinding.generateSummary(findings);
```

### 4. ApiResponse
표준화된 API 응답 형식을 제공하는 모델입니다.

```javascript
const { ApiResponse } = require('./models');

// 성공 응답
const successResponse = ApiResponse.success({
  inspectionId: 'inspection-456',
  status: 'COMPLETED'
});

// 오류 응답
const errorResponse = ApiResponse.error('Inspection failed');

// 페이지네이션 응답
const paginatedResponse = ApiResponse.paginated(
  items,
  { page: 1, limit: 10, total: 100 }
);

// Express.js에서 사용
successResponse.send(res, 200);
```

### 5. ApiError
다양한 오류 상황을 위한 표준화된 오류 모델입니다.

```javascript
const { ApiError } = require('./models');

// 인증 오류
const authError = ApiError.authentication('Invalid token');

// Assume Role 오류
const roleError = ApiError.assumeRole(
  'arn:aws:iam::123456789012:role/InspectionRole',
  'Access denied'
);

// 검사 오류
const inspectionError = ApiError.inspection('EC2', 'Failed to analyze security groups');

// 유효성 검증 오류
const validationError = ApiError.validation('Invalid input', {
  field: 'serviceType',
  message: 'serviceType is required'
});
```

## 사용 예시

### 완전한 검사 플로우

```javascript
const {
  InspectionResult,
  InspectionStatus,
  InspectionFinding,
  ApiResponse,
  ApiError
} = require('./models');

async function performInspection(customerId, serviceType, assumeRoleArn) {
  const inspectionId = generateUUID();
  
  // 1. 검사 결과 객체 생성
  const result = new InspectionResult({
    customerId,
    inspectionId,
    serviceType,
    assumeRoleArn
  });

  // 2. 상태 객체 생성 및 시작
  const status = new InspectionStatus({ inspectionId });
  status.start(`Starting ${serviceType} inspection`);

  try {
    // 3. 검사 수행 (예: EC2 보안 그룹 검사)
    const findings = [];
    
    status.updateProgress({
      currentStep: 'Analyzing Security Groups',
      completedSteps: 1,
      totalSteps: 5,
      percentage: 20
    });

    // 검사 로직...
    const securityGroups = await getSecurityGroups();
    
    for (const sg of securityGroups) {
      if (hasUnrestrictedAccess(sg)) {
        const finding = InspectionFinding.createSecurityGroupFinding(
          sg,
          'Unrestricted SSH access detected',
          'Restrict SSH access to specific IP ranges'
        );
        findings.push(finding);
      }
    }

    // 4. 검사 완료
    const summary = InspectionFinding.generateSummary(findings);
    result.complete({ summary, findings });
    status.complete();

    // 5. 성공 응답 반환
    return ApiResponse.success({
      inspectionId,
      status: result.status,
      summary,
      findings: findings.map(f => f.toApiResponse())
    });

  } catch (error) {
    // 6. 오류 처리
    result.fail(error.message);
    status.fail(error.message);

    return ApiResponse.error(
      ApiError.inspection(serviceType, error.message)
    );
  }
}
```

## 유효성 검증

모든 모델은 `validate()` 메서드를 제공하여 데이터 무결성을 보장합니다:

```javascript
const result = new InspectionResult({});
const validation = result.validate();

if (!validation.isValid) {
  console.log('Validation errors:', validation.errors);
  // ['customerId is required', 'inspectionId is required', ...]
}
```

## DynamoDB 연동

InspectionResult는 DynamoDB와의 연동을 위한 메서드를 제공합니다:

```javascript
// DynamoDB 저장용 변환
const dynamoItem = result.toDynamoDBItem();

// DynamoDB 아이템에서 객체 생성
const result = InspectionResult.fromDynamoDBItem(dynamoItem);
```

## 테스트

모델의 동작을 확인하려면 테스트 스크립트를 실행하세요:

```bash
cd backend
node tests/models.test.js
```

## 확장성

새로운 AWS 서비스 검사를 추가할 때:

1. `InspectionFinding`에 새로운 헬퍼 메서드 추가
2. 필요시 새로운 오류 타입을 `ApiError`에 추가
3. 서비스별 특수한 데이터가 필요하면 `details` 필드 활용

이 모델들은 Requirements 1.1, 2.3, 5.1을 충족하며, 확장 가능하고 유지보수가 용이한 구조로 설계되었습니다.