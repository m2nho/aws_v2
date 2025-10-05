# EC2 Inspector 구조화 문서

## 개요
EC2 Inspector는 AWS EC2 서비스에 대한 보안 및 모범 사례 검사를 수행하는 모듈입니다. 
검사 항목별로 모듈을 분리하여 유지보수성과 확장성을 향상시켰습니다.

## 디렉토리 구조

```
backend/services/inspectors/ec2/
├── index.js                           # 메인 EC2 Inspector 클래스
├── collectors/
│   └── ec2DataCollector.js           # AWS EC2 데이터 수집 모듈
├── checks/
│   ├── securityGroupChecker.js       # 보안 그룹 검사 모듈
│   ├── instanceSecurityChecker.js    # 인스턴스 보안 검사 모듈
│   ├── networkAccessChecker.js       # 네트워크 접근성 검사 모듈
│   ├── metadataChecker.js           # 메타데이터 서비스 검사 모듈
│   └── keyPairChecker.js            # 키 페어 검사 모듈
└── README.md                         # 이 문서
```

## 주요 구성 요소

### 1. 메인 Inspector (index.js)
- 전체 검사 프로세스 조율
- 개별 검사 모듈들의 통합 관리
- 진행률 보고 및 오류 처리

### 2. 데이터 수집기 (collectors/ec2DataCollector.js)
- AWS EC2 API 호출 담당
- 보안 그룹, 인스턴스 정보 수집
- 데이터 필터링 및 전처리

### 3. 검사 모듈들 (checks/)

#### SecurityGroupChecker
- **목적**: 보안 그룹 규칙 및 관리 상태 검사
- **주요 검사 항목**:
  - 과도하게 열린 포트 (0.0.0.0/0)
  - SSH/RDP 인터넷 노출
  - 위험한 포트 조합
  - 기본 보안 그룹 사용
  - 보안 그룹 설명 및 태그
  - 규칙 복잡성

#### InstanceSecurityChecker
- **목적**: EC2 인스턴스 보안 설정 검사
- **주요 검사 항목**:
  - 퍼블릭 IP 노출
  - EBS 볼륨 암호화
  - 인스턴스 모니터링
  - 태그 규칙 준수
  - 보안 그룹 과다 사용
  - 인스턴스 유형 최적화

#### NetworkAccessChecker
- **목적**: 네트워크 접근성 및 구성 검사
- **주요 검사 항목**:
  - 퍼블릭 접근 분석
  - 위험한 포트 조합
  - 관리 포트 노출
  - 네트워크 구성 복잡성
  - 보안 그룹 순환 참조
  - 미사용 보안 그룹

#### MetadataChecker
- **목적**: EC2 메타데이터 서비스 보안 검사
- **주요 검사 항목**:
  - IMDSv2 강제 사용
  - 메타데이터 홉 제한
  - 메타데이터 서비스 비활성화
  - 토큰 TTL 설정
  - 컨테이너 환경 고려사항

#### KeyPairChecker
- **목적**: 키 페어 관리 및 보안 검사
- **주요 검사 항목**:
  - 키 페어 설정 여부
  - 키 페어 명명 규칙
  - 공유 키 페어 사용
  - 환경별 키 분리
  - Session Manager 대안 제안
  - 키 페어 로테이션

## 사용 방법

### 기본 사용법
```javascript
const EC2Inspector = require('./ec2/index');

const inspector = new EC2Inspector();
await inspector.preInspectionValidation(awsCredentials, config);
const results = await inspector.performInspection(awsCredentials, config);
```

### 개별 항목 검사
```javascript
// 보안 그룹만 검사
const config = { targetItem: 'security_groups' };
const results = await inspector.performItemInspection(awsCredentials, config);

// 메타데이터 서비스만 검사
const config = { targetItem: 'instance_metadata' };
const results = await inspector.performItemInspection(awsCredentials, config);
```

## 지원하는 검사 유형

- `security-groups`: 보안 그룹 규칙 검사
- `instance-security`: 인스턴스 보안 설정 검사
- `network-configuration`: 네트워크 구성 검사
- `access-control`: 접근 제어 검사
- `metadata-service`: 메타데이터 서비스 검사
- `key-management`: 키 페어 관리 검사

## 개별 검사 항목

### 보안 그룹 관련
- `security_groups`: 보안 그룹 규칙 분석
- `security_group_management`: 보안 그룹 관리 상태 분석

### 인스턴스 관련
- `instance_metadata`: 메타데이터 서비스 설정 분석
- `key_pairs`: 키 페어 설정 및 사용 패턴 분석

### 네트워크 관련
- `public_access`: 퍼블릭 접근 가능성 분석
- `network_access`: 네트워크 접근성 종합 분석

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