# History Service

AWS 리소스 검사 이력 관리를 위한 서비스입니다. DynamoDB를 사용하여 검사 결과를 저장하고 조회하며, 검사 결과 간의 비교 분석 기능을 제공합니다.

## 주요 기능

### 1. 검사 이력 저장 (Requirements 3.1)
- 검사 완료 후 결과를 DynamoDB에 저장
- 고유한 검사 ID 생성 및 타임스탬프 관리
- 검사 메타데이터 및 상세 결과 저장

### 2. 검사 이력 조회 및 필터링 (Requirements 3.2)
- 고객별 검사 이력 목록 조회 (날짜순 정렬)
- 서비스 타입별 검사 이력 조회
- 다양한 조건으로 검사 이력 필터링
- 페이지네이션 지원

### 3. 검사 결과 비교 분석 (Requirements 3.3, 3.4)
- 현재 검사와 이전 검사 결과 비교
- 새로운 이슈, 해결된 이슈, 지속되는 이슈 분류
- 보안 점수 변화 및 트렌드 분석
- 비교 기반 권장사항 생성

## API 메서드

### saveInspectionHistory(inspectionData)
검사 결과를 DynamoDB에 저장합니다.

```javascript
const result = await historyService.saveInspectionHistory({
  customerId: 'customer-123',
  serviceType: 'EC2',
  results: {
    summary: { totalResources: 10, highRiskIssues: 2 },
    findings: [...]
  },
  assumeRoleArn: 'arn:aws:iam::123456789012:role/InspectionRole',
  metadata: { inspectorVersion: 'ec2-inspector-v1.0' }
});
```

### getInspectionHistory(customerId, inspectionId)
특정 검사 이력을 조회합니다.

```javascript
const result = await historyService.getInspectionHistory('customer-123', 'inspection-456');
```

### getInspectionHistoryList(customerId, options)
고객의 검사 이력 목록을 조회합니다.

```javascript
const result = await historyService.getInspectionHistoryList('customer-123', {
  limit: 20,
  ascending: false // 최신순
});
```

### compareInspectionResults(customerId, currentInspectionId, previousInspectionId)
두 검사 결과를 비교 분석합니다.

```javascript
const result = await historyService.compareInspectionResults(
  'customer-123',
  'current-inspection-id',
  'previous-inspection-id' // 선택사항
);
```

## 데이터 구조

### DynamoDB 테이블 스키마
- **Primary Key**: customerId (HASH), inspectionId (RANGE)
- **GSI 1**: ServiceTypeIndex - customerId (HASH), serviceType (RANGE)
- **GSI 2**: TimestampIndex - customerId (HASH), timestamp (RANGE)

### 검사 레코드 구조
```javascript
{
  customerId: "customer-123",
  inspectionId: "inspection-uuid",
  serviceType: "EC2",
  status: "COMPLETED",
  startTime: 1640995200000,
  endTime: 1640995800000,
  duration: 600000,
  timestamp: 1640995800000,
  createdAt: "2022-01-01T00:00:00.000Z",
  results: {
    summary: {
      totalResources: 25,
      highRiskIssues: 3,
      mediumRiskIssues: 7,
      lowRiskIssues: 2,
      overallScore: 75
    },
    findings: [...],
    recommendations: [...]
  },
  assumeRoleArn: "arn:aws:iam::123456789012:role/InspectionRole",
  metadata: {
    version: "1.0",
    inspectorVersion: "ec2-inspector-v1.2"
  }
}
```

## 비교 분석 결과

### 요약 비교
- 리소스 수 변화
- 위험도별 이슈 수 변화
- 전체 보안 점수 변화

### 발견사항 분류
- **새로운 이슈**: 이전 검사에 없던 새로운 보안 이슈
- **해결된 이슈**: 이전 검사에 있었지만 현재는 해결된 이슈
- **지속되는 이슈**: 이전 검사부터 계속 존재하는 이슈

### 트렌드 분석
- **improved**: 보안 상태 개선
- **degraded**: 보안 상태 악화
- **stable**: 보안 상태 안정 유지

## 사용 예제

```javascript
const historyService = require('./services/historyService');

// 1. 검사 결과 저장
const saveResult = await historyService.saveInspectionHistory(inspectionData);

// 2. 검사 이력 조회
const history = await historyService.getInspectionHistoryList('customer-123');

// 3. 검사 결과 비교
const comparison = await historyService.compareInspectionResults(
  'customer-123',
  'current-id'
);

// 4. 통계 조회
const stats = await historyService.getInspectionStatistics('customer-123', { days: 30 });
```

## 테스트

```bash
# 단위 테스트 실행
npm test -- --testPathPattern=historyService.test.js

# 통합 테스트 실행
npm test -- --testPathPattern=historyService.integration.test.js

# 모든 History Service 테스트 실행
npm test -- --testPathPattern=historyService
```

## 환경 변수

```bash
AWS_DYNAMODB_INSPECTION_HISTORY_TABLE=InspectionHistory
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

## 의존성

- `@aws-sdk/lib-dynamodb`: DynamoDB 문서 클라이언트
- `uuid`: 고유 ID 생성
- `../config/aws`: AWS 클라이언트 설정

## 에러 처리

모든 메서드는 표준화된 에러 처리를 제공합니다:

```javascript
{
  success: false,
  error: "에러 메시지",
  details: { /* 추가 에러 정보 */ }
}
```

성공 시:

```javascript
{
  success: true,
  data: { /* 결과 데이터 */ }
}
```