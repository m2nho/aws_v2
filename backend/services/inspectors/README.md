# AWS Resource Inspectors

이 모듈은 AWS 리소스 검사를 위한 기본 인프라와 확장 가능한 아키텍처를 제공합니다.

## 구조

```
inspectors/
├── baseInspector.js      # 기본 Inspector 클래스
├── index.js              # Inspector 레지스트리 및 팩토리
├── README.md             # 이 파일
└── [future inspectors]   # EC2, RDS, S3 등의 구체적인 Inspector들
```

## BaseInspector 클래스

모든 AWS 서비스 Inspector의 기본 클래스입니다. 공통 기능과 표준화된 인터페이스를 제공합니다.

### 주요 기능

- **표준화된 검사 플로우**: 사전 검증, 검사 실행, 사후 처리의 일관된 플로우
- **에러 처리**: 재시도 로직과 부분 결과 반환 기능
- **로깅**: 구조화된 로깅 시스템
- **결과 표준화**: 일관된 검사 결과 형식
- **진행률 추적**: 검사 진행 상황 모니터링

### 사용 방법

```javascript
const { BaseInspector } = require('./inspectors');

class MyServiceInspector extends BaseInspector {
  constructor(options = {}) {
    super('MyService', options);
  }

  async performInspection(awsCredentials, inspectionConfig) {
    // 구체적인 검사 로직 구현
    const resources = await this.getResources(awsCredentials);
    
    for (const resource of resources) {
      this.incrementResourceCount();
      const findings = await this.analyzeResource(resource);
      findings.forEach(finding => this.addFinding(finding));
    }

    return { resourcesAnalyzed: resources.length };
  }

  getVersion() {
    return 'my-service-inspector-v1.0';
  }

  getSupportedInspectionTypes() {
    return ['security', 'performance', 'cost'];
  }
}
```

## Inspector Registry

Inspector들을 중앙에서 관리하는 레지스트리 시스템입니다.

### 사용 방법

```javascript
const { registry, createInspector } = require('./inspectors');

// Inspector 등록
registry.register('MyService', MyServiceInspector);

// Inspector 인스턴스 생성
const inspector = createInspector('MyService', { timeout: 600000 });

// 검사 실행
const result = await inspector.executeInspection(
  customerId,
  awsCredentials,
  inspectionConfig
);
```

## 새로운 Inspector 구현 가이드

### 1. BaseInspector 상속

```javascript
const { BaseInspector } = require('./baseInspector');
const InspectionFinding = require('../../models/InspectionFinding');

class EC2Inspector extends BaseInspector {
  constructor(options = {}) {
    super('EC2', options);
  }
```

### 2. 필수 메서드 구현

#### performInspection(awsCredentials, inspectionConfig)
실제 검사 로직을 구현하는 메서드입니다.

```javascript
async performInspection(awsCredentials, inspectionConfig) {
  const ec2 = new AWS.EC2(awsCredentials);
  
  // 보안 그룹 검사
  await this.inspectSecurityGroups(ec2);
  
  // 인스턴스 검사
  await this.inspectInstances(ec2);
  
  return { completed: true };
}
```

#### getVersion()
Inspector의 버전 정보를 반환합니다.

```javascript
getVersion() {
  return 'ec2-inspector-v1.0';
}
```

#### getSupportedInspectionTypes()
지원하는 검사 유형 목록을 반환합니다.

```javascript
getSupportedInspectionTypes() {
  return ['security-groups', 'instances', 'volumes', 'snapshots'];
}
```

### 3. 선택적 메서드 오버라이드

#### preInspectionValidation(awsCredentials, inspectionConfig)
검사 전 추가 검증 로직을 구현합니다.

```javascript
async preInspectionValidation(awsCredentials, inspectionConfig) {
  await super.preInspectionValidation(awsCredentials, inspectionConfig);
  
  // EC2 특화 검증 로직
  const ec2 = new AWS.EC2(awsCredentials);
  await this.validateEC2Access(ec2);
}
```

#### getServiceSpecificRecommendations()
서비스별 특화 권장사항을 반환합니다.

```javascript
getServiceSpecificRecommendations() {
  const recommendations = [];
  
  if (this.findings.some(f => f.resourceType === 'SecurityGroup')) {
    recommendations.push('보안 그룹 규칙을 정기적으로 검토하시기 바랍니다.');
  }
  
  return recommendations;
}
```

### 4. Finding 생성 및 추가

```javascript
async inspectSecurityGroups(ec2) {
  const { SecurityGroups } = await ec2.describeSecurityGroups().promise();
  
  for (const sg of SecurityGroups) {
    this.incrementResourceCount();
    
    // 위험한 규칙 검사
    const dangerousRules = this.findDangerousRules(sg);
    
    if (dangerousRules.length > 0) {
      const finding = InspectionFinding.createSecurityGroupFinding(
        sg,
        '보안 그룹이 모든 IP에서의 접근을 허용합니다',
        '특정 IP 범위로 접근을 제한하시기 바랍니다'
      );
      
      this.addFinding(finding);
    }
  }
}
```

### 5. 에러 처리

```javascript
async inspectInstances(ec2) {
  try {
    const { Reservations } = await this.retryableApiCall(
      () => ec2.describeInstances().promise(),
      'describe-instances'
    );
    
    // 인스턴스 처리 로직
    
  } catch (error) {
    this.recordError(error, { operation: 'inspect-instances' });
    // 부분 결과라도 계속 진행
  }
}
```

## 모범 사례

### 1. 진행률 업데이트
```javascript
this.updateProgress('Analyzing Security Groups', 25);
```

### 2. 리소스 카운트 추적
```javascript
this.incrementResourceCount(instances.length);
```

### 3. 구조화된 로깅
```javascript
this.logger.info('Starting security group analysis', {
  securityGroupCount: securityGroups.length
});
```

### 4. 재시도 가능한 API 호출
```javascript
const result = await this.retryableApiCall(
  () => ec2.describeInstances().promise(),
  'describe-instances'
);
```

## 테스트

각 Inspector는 다음과 같은 테스트를 포함해야 합니다:

```javascript
const EC2Inspector = require('./ec2Inspector');

describe('EC2Inspector', () => {
  let inspector;
  
  beforeEach(() => {
    inspector = new EC2Inspector();
  });
  
  test('should identify dangerous security group rules', async () => {
    // 테스트 로직
  });
  
  test('should handle API errors gracefully', async () => {
    // 에러 처리 테스트
  });
});
```

## 확장성

이 아키텍처는 다음과 같은 확장을 지원합니다:

- **새로운 AWS 서비스**: 새로운 Inspector 클래스 추가
- **검사 유형 확장**: 기존 Inspector에 새로운 검사 로직 추가
- **커스텀 Finding 타입**: InspectionFinding 클래스 확장
- **플러그인 시스템**: 동적 Inspector 로딩 지원

## 성능 고려사항

- **병렬 처리**: 독립적인 검사는 병렬로 실행
- **배치 처리**: 대량 리소스는 배치 단위로 처리
- **캐싱**: 변경이 적은 데이터는 캐싱 활용
- **타임아웃**: 적절한 타임아웃 설정으로 무한 대기 방지