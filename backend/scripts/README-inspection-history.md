# InspectionHistory DynamoDB 테이블 관리

이 디렉토리에는 AWS 리소스 검사 이력을 저장하는 InspectionHistory DynamoDB 테이블을 관리하는 스크립트들이 포함되어 있습니다.

## 테이블 구조

### Primary Key
- **Partition Key**: `customerId` (String) - 고객 식별자
- **Sort Key**: `inspectionId` (String) - 검사 고유 식별자

### Global Secondary Indexes
1. **ServiceTypeIndex**
   - Partition Key: `customerId` (String)
   - Sort Key: `serviceType` (String)
   - 용도: 고객별 특정 서비스 타입 검사 이력 조회

2. **TimestampIndex**
   - Partition Key: `customerId` (String)
   - Sort Key: `timestamp` (Number)
   - 용도: 고객별 시간순 검사 이력 조회

### 속성 정의
- `customerId`: 고객 ID (String)
- `inspectionId`: 검사 ID (String, UUID)
- `serviceType`: AWS 서비스 타입 (String, 예: EC2, RDS, S3)
- `timestamp`: 검사 시작 시간 (Number, Unix timestamp)
- `status`: 검사 상태 (String, PENDING/IN_PROGRESS/COMPLETED/FAILED)
- `startTime`: 검사 시작 시간 (Number)
- `endTime`: 검사 종료 시간 (Number)
- `duration`: 검사 소요 시간 (Number, milliseconds)
- `results`: 검사 결과 객체
- `assumeRoleArn`: 사용된 IAM Role ARN (String)
- `metadata`: 메타데이터 객체

## 스크립트 목록

### 1. 테이블 생성
```bash
node scripts/create-inspection-history-table.js
```
- InspectionHistory 테이블을 생성합니다
- 필요한 인덱스와 속성을 모두 설정합니다
- 테이블 생성 완료까지 대기합니다

### 2. 테이블 검증
```bash
node scripts/verify-inspection-history-table.js
```
- 테이블 구조가 올바른지 검증합니다
- 기본 CRUD 작업을 테스트합니다
- 인덱스 상태를 확인합니다

### 3. 테이블 상태 확인
```bash
node scripts/check-inspection-history-table.js
```
- 테이블의 현재 상태를 확인합니다
- 저장된 데이터의 샘플을 표시합니다
- 서비스별/상태별 통계를 제공합니다

### 4. 샘플 데이터 생성
```bash
node scripts/seed-inspection-history.js
```
- 테스트용 샘플 검사 이력을 생성합니다
- 다양한 서비스 타입과 위험도의 데이터를 포함합니다
- 개발 및 테스트 환경에서 사용합니다

### 5. 전체 초기화 (권장)
```bash
# 테이블만 생성
node scripts/init-inspection-history.js

# 샘플 데이터와 함께 생성
node scripts/init-inspection-history.js --with-sample-data
```
- 테이블 생성부터 검증까지 전체 프로세스를 실행합니다
- 선택적으로 샘플 데이터도 함께 생성할 수 있습니다

## 환경 변수 설정

`.env` 파일에 다음 변수들이 설정되어 있어야 합니다:

```env
# AWS 기본 설정
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# DynamoDB 테이블 설정
AWS_DYNAMODB_INSPECTION_HISTORY_TABLE=InspectionHistory
```

## 필요한 AWS 권한

DynamoDB 테이블을 관리하기 위해 다음 권한이 필요합니다:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:CreateTable",
        "dynamodb:DescribeTable",
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:BatchWriteItem",
        "dynamodb:BatchGetItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/InspectionHistory",
        "arn:aws:dynamodb:*:*:table/InspectionHistory/index/*"
      ]
    }
  ]
}
```

## 사용 예시

### 1. 새 환경 설정
```bash
# 1. 환경 변수 설정
cp .env.example .env
# .env 파일 편집

# 2. 테이블 초기화 (샘플 데이터 포함)
node scripts/init-inspection-history.js --with-sample-data

# 3. 상태 확인
node scripts/check-inspection-history-table.js
```

### 2. 기존 테이블 확인
```bash
# 테이블 상태 확인
node scripts/check-inspection-history-table.js

# 테이블 구조 검증
node scripts/verify-inspection-history-table.js
```

### 3. 개발 데이터 추가
```bash
# 샘플 데이터 생성
node scripts/seed-inspection-history.js
```

## 문제 해결

### 테이블 생성 실패
- AWS 자격 증명 확인
- DynamoDB 권한 확인
- 리전 설정 확인
- 테이블명 중복 확인

### 인덱스 생성 지연
- 인덱스 생성은 몇 분 소요될 수 있습니다
- `check-inspection-history-table.js`로 상태 확인
- AWS 콘솔에서 직접 확인 가능

### 권한 오류
- IAM 사용자/역할에 DynamoDB 권한 추가
- 리소스 ARN 확인
- 정책 문법 확인

## 다음 단계

테이블 설정이 완료되면:

1. **백엔드 서비스 구현**
   - `backend/services/historyService.js` 구현
   - DynamoDB 연동 로직 작성

2. **API 엔드포인트 개발**
   - 검사 이력 저장 API
   - 검사 이력 조회 API
   - 검사 결과 비교 API

3. **프론트엔드 연동**
   - 검사 이력 표시 컴포넌트
   - 검사 결과 대시보드
   - 이력 비교 기능