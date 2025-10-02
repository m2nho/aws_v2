# Requirements Document

## Introduction

AWS 리소스 검사 기능은 AWS Trust Advisor와 유사하지만 서비스별로 세분화된 검사를 제공하는 시스템입니다. 승인된 고객이 특정 AWS 서비스(예: EC2, IAM, S3 등)에 대한 보안 및 모범 사례 검사를 요청하면, 시스템이 assume role을 통해 고객의 AWS 계정에 접근하여 해당 서비스의 리소스를 검사하고 결과를 제공합니다. 모든 검사 이력은 DynamoDB에 저장되어 관리됩니다.

## Requirements

### Requirement 1

**User Story:** 승인된 고객으로서, 특정 AWS 서비스에 대한 보안 검사를 요청하여 내 계정의 리소스 상태를 확인하고 싶습니다.

#### Acceptance Criteria

1. WHEN 승인된 고객이 AWS 서비스 검사를 요청 THEN 시스템은 사용 가능한 검사 유형 목록을 표시해야 합니다
2. WHEN 고객이 특정 서비스 검사(예: EC2 검사)를 선택 THEN 시스템은 해당 서비스의 세부 검사 항목들을 표시해야 합니다
3. WHEN 고객이 검사를 시작 THEN 시스템은 assume role을 통해 고객 계정에 접근해야 합니다
4. IF assume role 접근이 실패 THEN 시스템은 적절한 오류 메시지를 표시해야 합니다

### Requirement 2

**User Story:** 시스템 관리자로서, EC2 서비스에 대한 보안 그룹 검사를 포함한 다양한 검사 항목을 제공하여 고객의 보안 상태를 평가하고 싶습니다.

#### Acceptance Criteria

1. WHEN EC2 검사가 실행 THEN 시스템은 보안 그룹 설정을 검사해야 합니다
2. WHEN 보안 그룹 검사가 완료 THEN 시스템은 열린 포트, 과도한 권한, 미사용 보안 그룹 등을 식별해야 합니다
3. WHEN 검사 결과가 생성 THEN 시스템은 위험도별로 결과를 분류해야 합니다 (High, Medium, Low)
4. WHEN 검사가 완료 THEN 시스템은 개선 권장사항을 제공해야 합니다

### Requirement 3

**User Story:** 고객으로서, 내 검사 이력을 확인하여 이전 검사 결과와 비교하고 개선 사항을 추적하고 싶습니다.

#### Acceptance Criteria

1. WHEN 검사가 완료 THEN 시스템은 검사 결과를 DynamoDB에 저장해야 합니다
2. WHEN 고객이 검사 이력을 요청 THEN 시스템은 날짜순으로 정렬된 검사 이력을 표시해야 합니다
3. WHEN 고객이 특정 검사 결과를 선택 THEN 시스템은 상세한 검사 결과를 표시해야 합니다
4. WHEN 동일한 서비스에 대한 이전 검사가 존재 THEN 시스템은 변경사항을 하이라이트해야 합니다

### Requirement 4

**User Story:** 개발자로서, 새로운 AWS 서비스 검사를 쉽게 추가할 수 있는 확장 가능한 아키텍처를 원합니다.

#### Acceptance Criteria

1. WHEN 새로운 서비스 검사를 추가 THEN 시스템은 플러그인 방식으로 검사 모듈을 지원해야 합니다
2. WHEN 검사 모듈이 등록 THEN 시스템은 자동으로 해당 서비스를 검사 옵션에 포함해야 합니다
3. WHEN 검사가 실행 THEN 시스템은 표준화된 결과 형식을 반환해야 합니다
4. IF 검사 중 오류가 발생 THEN 시스템은 오류를 로깅하고 부분 결과라도 반환해야 합니다

### Requirement 5

**User Story:** 시스템 관리자로서, 검사 성능과 사용량을 모니터링하여 시스템 최적화를 하고 싶습니다.

#### Acceptance Criteria

1. WHEN 검사가 시작 THEN 시스템은 검사 시작 시간을 기록해야 합니다
2. WHEN 검사가 완료 THEN 시스템은 검사 소요 시간과 검사된 리소스 수를 기록해야 합니다
3. WHEN 관리자가 대시보드에 접근 THEN 시스템은 검사 통계와 성능 메트릭을 표시해야 합니다
4. IF 검사 시간이 임계값을 초과 THEN 시스템은 알림을 발송해야 합니다

### Requirement 6

**User Story:** 고객으로서, 검사 진행 상황을 실시간으로 확인하여 언제 완료될지 알고 싶습니다.

#### Acceptance Criteria

1. WHEN 검사가 시작 THEN 시스템은 진행률 표시기를 표시해야 합니다
2. WHEN 검사가 진행 THEN 시스템은 현재 검사 중인 항목을 표시해야 합니다
3. WHEN 검사 단계가 완료 THEN 시스템은 진행률을 업데이트해야 합니다
4. IF 검사가 예상보다 오래 걸림 THEN 시스템은 예상 완료 시간을 업데이트해야 합니다