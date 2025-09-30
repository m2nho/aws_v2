# 관리자 설정 가이드

이 문서는 AWS 사용자 관리 시스템에서 관리자 계정을 설정하는 방법을 설명합니다.

## 🚨 현재 시스템 개선사항

### 문제점 해결
1. **관리자 권한**: 하드코딩된 `username === 'admin'` 로직을 DynamoDB `isAdmin` 필드로 변경
2. **사용자 ID 매칭**: Cognito Sub와 DynamoDB userId 연결 구조 추가
3. **관리자 대시보드**: 적절한 권한 검증과 UI 접근 제어

## 📋 사전 준비사항

1. **DynamoDB 인덱스 설정**
   ```bash
   cd backend
   node scripts/setup-dynamodb-indexes.js
   ```

2. **환경 변수 확인**
   ```bash
   # backend/.env 파일에서 확인
   AWS_DYNAMODB_TABLE_NAME=aws_v2
   AWS_COGNITO_USER_POOL_ID=your_user_pool_id
   AWS_COGNITO_CLIENT_ID=your_client_id
   ```

## 👨‍💼 관리자 계정 생성

### 방법 1: 스크립트 사용 (권장)

```bash
cd backend
node scripts/create-admin-user.js admin@company.com AdminPassword123! "관리자회사"
```

**매개변수:**
- `username`: 관리자 이메일 (로그인 ID)
- `password`: 관리자 비밀번호
- `companyName`: 관리자 회사명

### 방법 2: 수동 설정

1. **일반 사용자로 회원가입**
   ```bash
   # 웹 UI에서 회원가입 또는 API 호출
   POST /api/auth/register
   {
     "username": "admin@company.com",
     "password": "AdminPassword123!",
     "companyName": "관리자회사",
     "roleArn": "arn:aws:iam::admin:role/AdminRole"
   }
   ```

2. **DynamoDB에서 관리자 권한 부여**
   ```javascript
   // AWS 콘솔 또는 스크립트로 실행
   await dynamoService.updateUserStatus(userId, 'approved');
   // isAdmin 필드를 true로 수동 변경 (AWS 콘솔에서)
   ```

## 🔐 관리자 권한 구조

### DynamoDB 스키마 변경사항

```javascript
{
  userId: "uuid-v4",
  cognitoSub: "cognito-sub-uuid",  // 새로 추가
  username: "admin@company.com",
  companyName: "관리자회사",
  roleArn: "arn:aws:iam::admin:role/AdminRole",
  status: "approved",
  isAdmin: true,                   // 새로 추가
  arnValidation: { ... },
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z"
}
```

### JWT 토큰 페이로드

```javascript
{
  userId: "dynamodb-user-id",
  username: "admin@company.com",
  status: "approved",
  cognitoSub: "cognito-sub-uuid",  // 새로 추가
  isAdmin: true,                   // 새로 추가
  iat: 1234567890,
  exp: 1234567890
}
```

## 🌐 관리자 대시보드 접근

### URL 경로
```
http://localhost:3000/admin
```

### 접근 조건
1. ✅ 로그인 상태 (`isAuthenticated: true`)
2. ✅ 관리자 권한 (`isAdmin: true`)
3. ✅ 승인된 상태 (`status: 'approved'`)

### 네비게이션 메뉴
- 관리자로 로그인하면 네비게이션에 "관리자 패널" 메뉴가 표시됩니다.
- 일반 사용자에게는 표시되지 않습니다.

## 🛠️ 관리자 기능

### 1. 사용자 목록 조회
- 모든 등록된 사용자 확인
- 상태별 필터링 (대기, 승인, 거부)
- 사용자 정보 상세 보기

### 2. 사용자 상태 관리
```javascript
PUT /api/admin/users/:userId/status
{
  "status": "approved" | "rejected"
}
```

### 3. AWS Role ARN 검증
```javascript
POST /api/admin/users/:userId/validate-arn
```

## 🔍 문제 해결

### 관리자 패널이 보이지 않는 경우

1. **로그인 상태 확인**
   ```javascript
   // 브라우저 개발자 도구에서 확인
   localStorage.getItem('authToken')
   ```

2. **관리자 권한 확인**
   ```javascript
   // API 호출로 확인
   GET /api/auth/verify
   // 응답에서 userInfo.role이 'admin'인지 확인
   ```

3. **DynamoDB 데이터 확인**
   ```bash
   # AWS CLI로 확인
   aws dynamodb get-item \
     --table-name aws_v2 \
     --key '{"userId":{"S":"your-user-id"}}'
   ```

### 인덱스 오류 발생 시

```bash
# 인덱스 재생성
cd backend
node scripts/setup-dynamodb-indexes.js
```

### Cognito Sub 매칭 오류

```javascript
// 사용자 데이터에 cognitoSub가 없는 경우
// 기존 사용자는 수동으로 Cognito Sub를 추가해야 합니다
```

## 📚 추가 참고사항

### 보안 고려사항
1. 관리자 비밀번호는 강력하게 설정
2. 관리자 계정은 최소한으로 유지
3. 정기적인 권한 검토 실시

### 모니터링
1. 관리자 로그인 로그 확인
2. 사용자 상태 변경 이력 추적
3. ARN 검증 결과 모니터링

### 백업 및 복구
1. DynamoDB 백업 설정
2. 관리자 계정 정보 안전한 보관
3. 재해 복구 계획 수립

---

## 🆘 지원

문제가 발생하면 다음을 확인해주세요:

1. **로그 확인**: `backend/logs/` 디렉토리
2. **AWS 콘솔**: DynamoDB 및 Cognito 상태
3. **네트워크**: API 엔드포인트 연결 상태

추가 지원이 필요하면 개발팀에 문의하세요.