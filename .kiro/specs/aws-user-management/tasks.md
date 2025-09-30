# Implementation Plan

- [x] 1. 프로젝트 구조 설정 및 기본 환경 구성





  - 루트 디렉토리에 frontend, backend 폴더 생성
  - 각각의 package.json 설정 및 기본 의존성 설치
  - 기본 폴더 구조 및 진입점 파일 생성
  - _Requirements: 6.1, 6.2_






- [ ] 2. AWS 서비스 설정 및 연결

  - [x] 2.1 DynamoDB 테이블 생성 스크립트 작성


    - Users 테이블 생성 스크립트 구현
    - 테이블 스키마 및 GSI 설정
    - _Requirements: 1.2, 2.4, 5.5_
  
  - [x] 2.2 AWS Cognito User Pool 설정





    - Cognito User Pool 생성 스크립트 작성
    - 비밀번호 정책 및 사용자 속성 설정
    - _Requirements: 1.2, 4.1_





- [ ] 3. 백엔드 기본 구조 및 AWS 통합
  - [-] 3.1 Express 서버 기본 설정


    - Express 앱 초기화 및 미들웨어 설정
    - CORS, JSON 파싱, 에러 핸들링 미들웨어 구현
    - _Requirements: 6.2_
  
  - [x] 3.2 AWS SDK 설정 및 서비스 클래스 구현



    - AWS SDK v3 설정 및 클라이언트 초기화
    - Cognito, DynamoDB, STS 서비스 래퍼 클래스 작성
    - _Requirements: 1.2, 3.2, 4.1_

- [ ] 4. 사용자 인증 시스템 구현
  - [x] 4.1 회원가입 API 구현
    - POST /api/auth/register 엔드포인트 작성
    - Cognito 사용자 생성 및 DynamoDB 메타데이터 저장
    - 입력 데이터 검증 및 에러 처리
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  
  - [x] 4.2 로그인 API 구현
    - POST /api/auth/login 엔드포인트 작성
    - Cognito 인증 및 JWT 토큰 생성
    - 사용자 상태 확인 및 반환

    - _Requirements: 4.1, 4.2_
  
  - [x] 4.3 토큰 검증 미들웨어 구현






    - JWT 토큰 검증 미들웨어 작성
    - 관리자 권한 확인 미들웨어 구현
    - _Requirements: 4.1, 5.1_

- [ ] 5. 사용자 관리 API 구현
  - [x] 5.1 사용자 프로필 조회 API





    - GET /api/users/profile 엔드포인트 구현
    - 인증된 사용자의 정보 및 상태 반환
    - _Requirements: 4.2, 4.3, 4.4, 4.5_
  
  - [x] 5.2 관리자용 사용자 목록 API





    - GET /api/admin/users 엔드포인트 구현
    - 전체 사용자 목록 조회 및 반환
    - 관리자 권한 검증
    - _Requirements: 5.1, 5.2_

- [ ] 6. 관리자 기능 API 구현
  - [x] 6.1 사용자 상태 변경 API





    - PUT /api/admin/users/:userId/status 엔드포인트 구현
    - 사용자 승인/거부 상태 업데이트
    - DynamoDB 업데이트 및 에러 처리
    - _Requirements: 2.2, 2.3, 2.4, 5.3_
  
  - [x] 6.2 AWS Role ARN 검증 API





    - POST /api/admin/users/:userId/validate-arn 엔드포인트 구현
    - STS assume role을 통한 ARN 유효성 검증
    - 검증 결과 저장 및 반환
    - 검증 가능한 실제 arn은 .env에 저장되어있음
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 5.4, 5.5_

- [ ] 7. 프론트엔드 기본 구조 설정
  - [x] 7.1 React 앱 초기화 및 라우팅 설정





    - Create React App으로 프로젝트 생성
    - React Router 설정 및 기본 페이지 구조
    - Axios HTTP 클라이언트 설정
    - _Requirements: 6.1, 6.2_
  -

  - [x] 7.2 인증 컨텍스트 및 상태 관리




    - AuthContext 생성 및 사용자 상태 관리
    - 토큰 저장 및 자동 로그인 처리
    - _Requirements: 4.1, 4.2_

- [ ] 8. 인증 관련 컴포넌트 구현
  - [x] 8.1 회원가입 폼 컴포넌트





    - RegisterForm 컴포넌트 작성
    - 입력 필드 검증 및 에러 메시지 표시
    - API 호출 및 성공/실패 처리
    - _Requirements: 1.1, 1.4, 6.3_
  
  - [x] 8.2 로그인 폼 컴포넌트





    - LoginForm 컴포넌트 작성
    - 인증 처리 및 상태별 리디렉션
    - _Requirements: 4.1, 4.2, 6.3_

- [ ] 9. 사용자 대시보드 구현
  - [x] 9.1 사용자 상태 표시 컴포넌트





    - UserDashboard 컴포넌트 작성
    - 승인 대기, 활성, 거부됨 상태별 UI 구현
    - 상태에 따른 메시지 및 색상 표시
    - _Requirements: 4.3, 4.4, 4.5, 6.4_

- [ ] 10. 관리자 패널 구현
  - [x] 10.1 사용자 목록 컴포넌트





    - UserList 컴포넌트 작성
    - 사용자 정보 테이블 형태로 표시
    - 상태별 색상 구분 및 아이콘 표시
    - _Requirements: 5.1, 5.2, 6.4_
  
  - [x] 10.2 사용자 관리 기능 컴포넌트





    - 승인/거부 버튼 구현
    - ARN 검증 버튼 및 결과 표시
    - 상태 변경 후 목록 새로고침
    - _Requirements: 2.2, 2.3, 3.1, 3.4, 5.3, 5.4, 5.5_

- [ ] 11. 에러 처리 및 사용자 경험 개선
  - [ ] 11.1 전역 에러 처리 구현
    - 네트워크 오류, 인증 오류 등 공통 에러 처리
    - 사용자 친화적 에러 메시지 표시
    - _Requirements: 1.4, 4.1_
  
  - [ ] 11.2 로딩 상태 및 피드백 구현
    - API 호출 중 로딩 스피너 표시
    - 성공/실패 알림 메시지 구현
    - _Requirements: 6.1, 6.2_

- [ ] 12. 통합 테스트 및 기능 검증
  - [ ] 12.1 백엔드 API 테스트 작성
    - 각 엔드포인트별 단위 테스트 구현
    - AWS 서비스 모킹을 통한 통합 테스트
    - _Requirements: 모든 요구사항 검증_
  
  - [ ] 12.2 프론트엔드 컴포넌트 테스트
    - 주요 컴포넌트 단위 테스트 작성
    - 사용자 플로우 통합 테스트 구현
    - _Requirements: 모든 요구사항 검증_