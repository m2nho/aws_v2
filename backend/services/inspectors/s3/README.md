# S3 Inspector 구조화 문서

## 개요
S3 Inspector는 AWS S3 서비스에 대한 보안 및 모범 사례 검사를 수행하는 모듈입니다. 
검사 항목별로 모듈을 분리하여 유지보수성과 확장성을 향상시켰습니다.

## 디렉토리 구조

```
backend/services/inspectors/s3/
├── index.js                           # 메인 S3 Inspector 클래스
├── collectors/
│   └── s3DataCollector.js            # AWS S3 데이터 수집 모듈
├── checks/
│   ├── bucketPolicyChecker.js        # 버킷 정책 검사 모듈
│   ├── bucketEncryptionChecker.js    # 버킷 암호화 검사 모듈
│   ├── bucketPublicAccessChecker.js  # 퍼블릭 액세스 검사 모듈
│   ├── bucketVersioningChecker.js    # 버전 관리 검사 모듈
│   ├── bucketLoggingChecker.js       # 액세스 로깅 검사 모듈
│   ├── bucketLifecycleChecker.js     # 라이프사이클 정책 검사 모듈
│   └── bucketCorsChecker.js          # CORS 설정 검사 모듈
└── README.md                         # 이 문서
```

## 주요 구성 요소

### 1. 메인 Inspector (index.js)
- 전체 검사 프로세스 조율
- 개별 검사 모듈들의 통합 관리
- 진행률 보고 및 오류 처리

### 2. 데이터 수집기 (collectors/s3DataCollector.js)
- AWS S3 API 호출 담당
- 버킷 정보, 설정, 정책 등 수집
- 데이터 필터링 및 전처리

### 3. 검사 모듈들 (checks/)

#### BucketPolicyChecker
- **목적**: 버킷 정책 보안 검사
- **주요 검사 항목**:
  - 퍼블릭 액세스 허용 정책
  - 위험한 S3 액션 권한
  - 조건 없는 광범위한 액세스
  - 최소 권한 원칙 준수

#### BucketEncryptionChecker
- **목적**: 서버 측 암호화 설정 검사
- **주요 검사 항목**:
  - 암호화 활성화 여부
  - 암호화 알고리즘 (AES-256, KMS)
  - 고객 관리형 KMS 키 사용
  - S3 Bucket Key 활용

#### BucketPublicAccessChecker
- **목적**: 퍼블릭 액세스 차단 설정 검사
- **주요 검사 항목**:
  - 퍼블릭 액세스 차단 설정
  - ACL을 통한 퍼블릭 권한
  - 인증된 사용자 그룹 권한
  - 정책을 통한 퍼블릭 액세스

#### BucketVersioningChecker
- **목적**: 버전 관리 및 MFA Delete 검사
- **주요 검사 항목**:
  - 버전 관리 활성화 여부
  - MFA Delete 설정
  - 데이터 보호 수준
  - 비용 최적화 고려사항

#### BucketLoggingChecker
- **목적**: 액세스 로깅 설정 검사
- **주요 검사 항목**:
  - 액세스 로깅 활성화
  - 로그 대상 버킷 설정
  - 보안 모니터링 준비
  - 감사 요구사항 충족

#### BucketLifecycleChecker
- **목적**: 라이프사이클 정책 검사
- **주요 검사 항목**:
  - 라이프사이클 정책 설정
  - 비용 최적화 기회
  - 자동 삭제 규칙
  - Intelligent Tiering 활용

#### BucketCorsChecker
- **목적**: CORS 설정 보안 검사
- **주요 검사 항목**:
  - CORS 규칙 존재 여부
  - 와일드카드 오리진 사용
  - 허용된 메서드 및 헤더
  - 크로스 오리진 보안

## 사용 방법

### 기본 사용법
```javascript
const S3Inspector = require('./s3/index');

const inspector = new S3Inspector();
await inspector.preInspectionValidation(awsCredentials, config);
const results = await inspector.performInspection(awsCredentials, config);
```

### 개별 항목 검사
```javascript
// 암호화 설정만 검사
const config = { targetItem: 'bucket-encryption' };
const results = await inspector.performItemInspection(awsCredentials, config);

// 퍼블릭 액세스만 검사
const config = { targetItem: 'bucket-public-access' };
const results = await inspector.performItemInspection(awsCredentials, config);
```

## 지원하는 검사 유형

- `bucket-policy`: 버킷 정책 보안 검사
- `bucket-encryption`: 서버 측 암호화 검사
- `bucket-public-access`: 퍼블릭 액세스 차단 검사
- `bucket-versioning`: 버전 관리 및 MFA Delete 검사
- `bucket-logging`: 액세스 로깅 검사
- `bucket-lifecycle`: 라이프사이클 정책 검사
- `bucket-cors`: CORS 설정 검사

## 개별 검사 항목

### 보안 관련
- `bucket-policy`: 버킷 정책 보안 분석
- `bucket-public-access`: 퍼블릭 액세스 보안 분석
- `bucket-encryption`: 암호화 설정 분석

### 데이터 보호 관련
- `bucket-versioning`: 버전 관리 설정 분석
- `bucket-logging`: 액세스 로깅 분석

### 비용 최적화 관련
- `bucket-lifecycle`: 라이프사이클 정책 분석

### 웹 서비스 관련
- `bucket-cors`: CORS 설정 분석

## 확장 방법

### 새로운 검사 모듈 추가
1. `checks/` 디렉토리에 새 검사 모듈 생성
2. `index.js`의 `constructor`에서 새 모듈 초기화
3. 필요한 경우 `getSupportedInspectionTypes()`에 새 검사 유형 추가

### 새로운 검사 항목 추가
1. 해당 검사 모듈에 새 메서드 추가
2. `runAllChecks()` 메서드에서 새 검사 호출
3. 필요한 경우 `performItemInspection()`에 새 케이스 추가

## 권장사항 시스템

각 검사 모듈은 `getRecommendations(findings)` 메서드를 통해 
발견된 문제에 대한 구체적인 권장사항을 제공합니다.

## 오류 처리

- 각 검사 모듈은 독립적으로 오류를 처리
- 하나의 검사 실패가 전체 검사를 중단시키지 않음
- 부분적 결과 반환 지원

## 성능 최적화

- 데이터 수집과 분석 분리
- 병렬 처리 가능한 검사들은 Promise.all 사용
- 불필요한 API 호출 최소화
- 캐싱 및 재사용 가능한 데이터 구조 활용

## 보안 모범 사례

- 최소 권한 원칙 적용
- 퍼블릭 액세스 최소화
- 암호화 강제 적용
- 정기적인 보안 검토
- 모니터링 및 로깅 활성화