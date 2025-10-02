# Implementation Plan

- [x] 1. Backend 환경 설정 및 기본 구조 생성





  - .env.example에 새로운 DynamoDB 테이블 설정 추가
  - package.json에 필요한 AWS SDK 의존성 확인 및 추가
  - _Requirements: 3.1, 5.2_

- [x] 2. DynamoDB 테이블 스키마 및 초기화 스크립트 구현







  - InspectionHistory 테이블 생성 스크립트 작성
  - 테이블 인덱스 및 속성 정의 구현
  - 테이블 초기화 및 검증 스크립트 작성
  - _Requirements: 3.1, 3.2_
-

- [x] 3. 기본 데이터 모델 및 인터페이스 구현




  - 검사 결과 데이터 모델 인터페이스 정의
  - 검사 상태 및 진행률 모델 구현
  - 공통 응답 형식 및 에러 모델 정의
  - _Requirements: 1.1, 2.3, 5.1_

- [x] 4. Base Inspector 클래스 및 공통 인터페이스 구현





  - 모든 검사 모듈의 기본 클래스 작성
  - 표준화된 검사 결과 형식 정의
  - 에러 처리 및 로깅 공통 기능 구현
  - _Requirements: 4.1, 4.3, 4.4_

- [x] 5. EC2 Inspector 모듈 구현





  - EC2 보안 그룹 검사 로직 구현
  - 인스턴스 보안 설정 검사 기능 작성
  - 위험도 분류 및 권장사항 생성 로직 구현
  - EC2 Inspector 단위 테스트 작성
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 6. Inspection Service 핵심 로직 구현





  - 검사 오케스트레이션 서비스 작성
  - Assume Role을 통한 고객 계정 접근 구현
  - 검사 상태 관리 및 진행률 추적 기능 구현
  - _Requirements: 1.3, 1.4, 6.1, 6.2_

- [x] 7. History Service 구현





  - DynamoDB를 사용한 검사 이력 저장 기능 구현
  - 검사 이력 조회 및 필터링 기능 작성
  - 검사 결과 비교 분석 로직 구현
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 8. Inspection Controller 및 API 엔드포인트 구현












  - POST /api/inspections/start 엔드포인트 구현
  - GET /api/inspections/:id 상세 조회 엔드포인트 구현
  - GET /api/inspections/history 이력 조회 엔드포인트 구현
  - GET /api/inspections/:id/status 상태 조회 엔드포인트 구현
  - _Requirements: 1.1, 1.2, 3.2, 6.3_

- [x] 9. 백엔드 라우팅 및 미들웨어 통합





  - 새로운 inspection 라우트를 기존 라우터에 통합
  - 인증 미들웨어 적용
  - 에러 핸들링 미들웨어 연동
  - _Requirements: 1.1, 1.4_

- [x] 10. 프론트엔드 서비스 레이어 구현





  - inspectionService.js API 호출 함수 구현
  - 검사 상태 폴링 및 실시간 업데이트 로직 작성
  - 에러 처리 및 재시도 로직 구현
  - _Requirements: 1.1, 6.1, 6.3_

- [x] 11. ResourceInspectionTab 컴포넌트 구현









  - 사용 가능한 AWS 서비스 검사 목록 표시 컴포넌트 작성
  - 검사 시작 버튼 및 폼 구현
  - 검사 진행 상황 표시 UI 구현
  - _Requirements: 1.1, 1.2, 6.1, 6.2_
-

- [x] 12. InspectionDashboard 컴포넌트 구현




  - 검사 결과 요약 표시 컴포넌트 작성
  - 위험도별 분류 및 시각화 구현
  - 권장사항 표시 UI 구현
  - _Requirements: 2.3, 2.4_

- [x] 13. InspectionHistory 컴포넌트 구현






  - 검사 이력 목록 표시 컴포넌트 작성
  - 검사 결과 상세 조회 모달 구현
  - 이전 검사와의 비교 기능 UI 구현
  - _Requirements: 3.2, 3.3, 3.4_

- [x] 14. 프론트엔드 라우팅 및 네비게이션 통합
  - 기존 App.js에 새로운 리소스 검사 탭 추가
  - React Router 경로 설정
  - 네비게이션 메뉴에 새 탭 통합
  - _Requirements: 1.1_

- [x] 15. 진행률 모니터링 및 실시간 업데이트 구현

  - WebSocket을 통한 실시간 상태 업데이트
  - 진행률 표시기 컴포넌트 구현
  - 예상 완료 시간 계산 및 표시 로직 구현
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 16. 에러 처리 및 사용자 피드백 구현
  - 백엔드 에러 응답 표준화
  - 프론트엔드 에러 표시 컴포넌트 구현
  - 사용자 친화적 에러 메시지 및 복구 가이드 작성
  - _Requirements: 1.4, 4.4_

- [ ] 17. 기본 스타일링 및 반응형 디자인 적용
  - 새로운 컴포넌트들의 기본 CSS 스타일 작성
  - 기존 디자인 시스템과 일관성 유지
  - 모바일 및 태블릿 반응형 레이아웃 구현
  - _Requirements: 1.1, 1.2_

- [ ] 18. 백엔드 단위 테스트 작성
  - Inspector 모듈들의 단위 테스트 구현
  - Service 레이어 테스트 작성
  - Controller 테스트 구현
  - _Requirements: 4.3, 4.4_

- [ ] 19. 프론트엔드 컴포넌트 테스트 작성
  - React 컴포넌트 렌더링 테스트 구현
  - 사용자 상호작용 테스트 작성
  - API 호출 모킹 테스트 구현
  - _Requirements: 1.1, 1.2_

- [ ] 20. 통합 테스트 및 E2E 테스트 구현
  - 전체 검사 플로우 통합 테스트 작성
  - API 엔드포인트 통합 테스트 구현
  - 프론트엔드-백엔드 연동 테스트 작성
  - _Requirements: 1.1, 1.2, 1.3, 1.4_