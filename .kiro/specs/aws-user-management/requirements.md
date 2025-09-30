# Requirements Document

## Introduction

AWS 역할 기반 사용자 관리 시스템을 구축합니다. 이 시스템은 React 프론트엔드와 Express 백엔드로 구성되며, AWS Cognito를 통한 인증과 DynamoDB를 통한 데이터 저장을 사용합니다. 사용자는 AWS Role ARN을 포함한 정보로 회원가입하고, 관리자의 승인을 받아야 시스템을 사용할 수 있습니다.

## Requirements

### Requirement 1

**User Story:** 사용자로서 ID, 비밀번호, AWS Role ARN, 회사명으로 회원가입을 하고 싶습니다. 그래야 시스템에 접근할 수 있습니다.

#### Acceptance Criteria

1. WHEN 사용자가 회원가입 폼을 제출하면 THEN 시스템은 ID, 비밀번호, AWS Role ARN, 회사명을 필수 입력으로 요구해야 합니다
2. WHEN 사용자가 유효한 정보로 회원가입을 완료하면 THEN 시스템은 AWS Cognito에 사용자를 생성하고 DynamoDB에 추가 정보를 저장해야 합니다
3. WHEN 회원가입이 완료되면 THEN 사용자 상태는 "승인 대기"로 설정되어야 합니다
4. WHEN 사용자가 이미 존재하는 ID로 가입을 시도하면 THEN 시스템은 오류 메시지를 표시해야 합니다

### Requirement 2

**User Story:** 관리자로서 회원가입 승인을 관리하고 싶습니다. 그래야 적절한 사용자만 시스템에 접근할 수 있습니다.

#### Acceptance Criteria

1. WHEN 관리자가 회원 관리 페이지에 접근하면 THEN 시스템은 승인 대기 중인 사용자 목록을 표시해야 합니다
2. WHEN 관리자가 사용자를 승인하면 THEN 시스템은 해당 사용자의 상태를 "활성"으로 변경해야 합니다
3. WHEN 관리자가 사용자를 거부하면 THEN 시스템은 해당 사용자의 상태를 "거부됨"으로 변경해야 합니다
4. WHEN 사용자 상태가 변경되면 THEN 시스템은 DynamoDB의 사용자 정보를 업데이트해야 합니다

### Requirement 3

**User Story:** 관리자로서 사용자의 AWS Role ARN이 유효한지 확인하고 싶습니다. 그래야 사용자가 실제로 해당 역할에 접근할 수 있는지 알 수 있습니다.

#### Acceptance Criteria

1. WHEN 관리자가 회원 관리 페이지에서 사용자 정보를 조회하면 THEN 시스템은 각 사용자의 AWS Role ARN 상태를 표시해야 합니다
2. WHEN 시스템이 AWS Role ARN을 검증하면 THEN AWS STS assume role을 시도하여 유효성을 확인해야 합니다
3. IF AWS Role ARN이 유효하면 THEN 시스템은 "유효함" 상태를 표시해야 합니다
4. IF AWS Role ARN이 무효하면 THEN 시스템은 "무효함" 상태와 오류 메시지를 표시해야 합니다

### Requirement 4

**User Story:** 사용자로서 회원가입 후 로그인하고 싶습니다. 그래야 내 계정 상태를 확인하고 시스템에 접근할 수 있습니다.

#### Acceptance Criteria

1. WHEN 사용자가 로그인을 시도하면 THEN 시스템은 AWS Cognito를 통해 인증을 수행해야 합니다
2. WHEN 사용자가 인증되면 THEN 시스템은 로그인을 허용하고 사용자의 현재 상태를 표시해야 합니다
3. IF 사용자 상태가 "승인 대기"이면 THEN 시스템은 승인 대기 메시지를 표시해야 합니다
4. IF 사용자 상태가 "거부됨"이면 THEN 시스템은 거부 메시지를 표시해야 합니다
5. IF 사용자 상태가 "활성"이면 THEN 시스템은 전체 기능에 접근할 수 있도록 해야 합니다

### Requirement 5

**User Story:** 관리자로서 전체 회원 목록을 관리하고 싶습니다. 그래야 모든 사용자의 상태를 한눈에 파악하고 관리할 수 있습니다.

#### Acceptance Criteria

1. WHEN 관리자가 회원 관리 페이지에 접근하면 THEN 시스템은 모든 사용자의 목록을 표시해야 합니다
2. WHEN 사용자 목록이 표시되면 THEN 각 사용자의 ID, 회사명, 상태가 포함되어야 합니다
3. WHEN 관리자가 사용자 상태를 변경하면 THEN 시스템은 페이지 새로고침 시 업데이트된 정보를 표시해야 합니다
4. WHEN 관리자가 "ARN 검증" 버튼을 클릭하면 THEN 시스템은 해당 사용자의 AWS Role ARN을 검증하고 결과를 표시해야 합니다
5. WHEN ARN 검증이 완료되면 THEN 시스템은 검증 결과를 저장하고 목록에 반영해야 합니다

### Requirement 6

**User Story:** 개발자로서 간결한 프론트엔드 인터페이스를 제공하고 싶습니다. 그래야 기능에 집중하고 사용자 경험을 단순화할 수 있습니다.

#### Acceptance Criteria

1. WHEN 프론트엔드가 로드되면 THEN 시스템은 최소한의 필수 기능만 포함한 간결한 UI를 제공해야 합니다
2. WHEN 사용자가 페이지를 탐색하면 THEN 시스템은 명확하고 직관적인 네비게이션을 제공해야 합니다
3. WHEN 폼이 표시되면 THEN 시스템은 필수 필드만 포함하고 불필요한 장식을 제거해야 합니다
4. WHEN 상태 정보가 표시되면 THEN 시스템은 색상이나 아이콘을 사용하여 명확하게 구분해야 합니다