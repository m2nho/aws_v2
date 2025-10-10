# IAM Inspector 구조화 문서

## 개요
IAM Inspector는 AWS IAM 서비스에 대한 보안 및 모범 사례 검사를 수행하는 모듈입니다. 
검사 항목별로 모듈을 분리하여 유지보수성과 확장성을 향상시켰습니다.

## 디렉토리 구조

```
backend/services/inspectors/iam/
├── index.js                           # 메인 IAM Inspector 클래스
├── collectors/
│   └── iamDataCollector.js           # AWS IAM 데이터 수집 모듈
├── checks/
│   ├── rootAccessKeyChecker.js       # 루트 계정 액세스 키 검사 모듈
│   ├── mfaEnabledChecker.js          # MFA 활성화 검사 모듈
│   ├── unusedCredentialsChecker.js   # 미사용 자격 증명 검사 모듈
│   ├── overprivilegedPoliciesChecker.js # 과도한 권한 정책 검사 모듈
│   └── inlinePoliciesChecker.js      # 인라인 정책 검사 모듈
└── README.md                         # 이 문서
```

## 주요 구성 요소

### 1. 메인 Inspector (index.js)
- 전체 검사 프로세스 조율
- 개별 검사 모듈들의 통합 관리
- 진행률 보고 및 오류 처리

### 2. 데이터 수집기 (collectors/iamDataCollector.js)
- AWS IAM API 호출 담당
- 사용자, 역할, 정책 정보 수집
- 데이터 필터링 및 전처리

### 3. 검사 모듈들 (checks/)

#### RootAccessKeyChecker
- **목적**: 루트 계정 액세스 키 사용 검사
- **주요 검사 항목**:
  - 루트 계정 액세스 키 존재 여부
  - 루트 계정 보안 권장사항
  - 계정 요약 정보 분석
  - 루트 계정 보안 모범 사례

#### MfaEnabledChecker
- **목적**: IAM 사용자 MFA 활성화 상태 검사
- **주요 검사 항목**:
  - 사용자별 MFA 디바이스 확인
  - 콘솔 액세스 사용자 MFA 검사
  - 권한이 높은 사용자 MFA 검사
  - MFA 디바이스 유형 분석

#### UnusedCredentialsChecker
- **목적**: 미사용 자격 증명 검사
- **주요 검사 항목**:
  - 장기간 미사용 액세스 키
  - 마지막 로그인 시간 분석
  - 비활성 사용자 계정
  - 자격 증명 회전 권장사항

#### OverprivilegedPoliciesChecker
- **목적**: 과도한 권한을 가진 정책 검사
- **주요 검사 항목**:
  - 관리자 권한 정책 사용
  - 와일드카드 권한 분석
  - 최소 권한 원칙 위반
  - 위험한 권한 조합

#### InlinePoliciesChecker
- **목적**: 인라인 정책 사용 검사
- **주요 검사 항목**:
  - 사용자 인라인 정책 사용
  - 역할 인라인 정책 사용
  - 관리형 정책 변환 권장
  - 정책 관리 복잡성 분석

## 사용 방법

### 기본 사용법
```javascript
const IAMInspector = require('./iam/index');

const inspector = new IAMInspector();
await inspector.preInspectionValidation(awsCredentials, config);
const results = await inspector.performInspection(awsCredentials, config);
```

### 개별 항목 검사
```javascript
// 루트 계정 액세스 키만 검사
const config = { targetItem: 'root-access-key' };
const results = await inspector.performItemInspection(awsCredentials, config);

// MFA 활성화 상태만 검사
const config = { targetItem: 'mfa-enabled' };
const results = await inspector.performItemInspection(awsCredentials, config);
```

## 지원하는 검사 유형

- `root-access-key`: 루트 계정 액세스 키 검사
- `mfa-enabled`: MFA 활성화 상태 검사
- `unused-credentials`: 미사용 자격 증명 검사
- `overprivileged-user-policies`: 사용자 과도한 권한 정책 검사
- `overprivileged-role-policies`: 역할 과도한 권한 정책 검사
- `inline-policies`: 인라인 정책 사용 검사
- `unused-policies`: 미사용 정책 검사

## 개별 검사 항목

### 보안 관련
- `root-access-key`: 루트 계정 보안 분석
- `mfa-enabled`: MFA 보안 설정 분석
- `overprivileged-policies`: 과도한 권한 분석

### 관리 효율성 관련
- `unused-credentials`: 미사용 자격 증명 정리
- `inline-policies`: 정책 관리 최적화
- `unused-policies`: 미사용 정책 정리

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
- 루트 계정 보안 강화
- MFA 강제 활성화
- 정기적인 자격 증명 검토
- 인라인 정책 사용 최소화

## IAM 특화 기능

### 루트 계정 보안
- 루트 계정 액세스 키 탐지
- 루트 계정 보안 권장사항
- 계정 요약 정보 분석

### 사용자 관리
- MFA 활성화 상태 추적
- 미사용 자격 증명 탐지
- 사용자별 권한 분석

### 정책 관리
- 과도한 권한 탐지
- 인라인 정책 사용 분석
- 정책 최적화 권장사항

### 규정 준수
- AWS 보안 모범 사례 준수
- CIS AWS Foundations Benchmark 지원
- SOC 2, ISO 27001 요구사항 충족