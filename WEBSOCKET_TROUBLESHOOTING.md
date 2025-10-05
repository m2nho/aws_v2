# WebSocket 연결 문제 해결 가이드

## 문제 상황
검사를 시작해도 WebSocket이 작동하지 않는 문제가 발생했습니다.

## 구현된 해결책

### 1. 온디맨드 WebSocket 연결 방식

#### 검사 시작 시에만 연결
```javascript
// 검사 시작 시 WebSocket 연결
const token = webSocketService.getStoredToken();
if (token) {
  await webSocketService.connect(token);
  console.log('✅ 검사용 WebSocket 연결 성공');
}
```

#### 검사 완료/중단 시 자동 해제
```javascript
// 검사 완료 시 WebSocket 연결 해제
console.log('🔌 검사 완료 - WebSocket 연결 해제 중...');
webSocketService.disconnect();
console.log('✅ WebSocket 연결 해제 완료');
```

#### 컴포넌트 언마운트 시 정리
```javascript
// 컴포넌트 언마운트 시 WebSocket 정리
useEffect(() => {
  return () => {
    if (webSocketService.getConnectionStatus().isConnected) {
      webSocketService.disconnect();
    }
  };
}, []);
```

### 2. WebSocket 연결 검증 및 디버깅 도구

#### 백엔드 테스트 도구
- `backend/scripts/test-websocket.js`: 종합적인 WebSocket 서버 테스트
- `backend/tests/websocket-validation.test.js`: 연결 검증 및 안정성 테스트
- `backend/tests/websocket-cleanup.test.js`: 리소스 정리 테스트

#### 프론트엔드 디버깅 도구
- `frontend/src/utils/websocketDebugger.js`: WebSocket 상태 모니터링 및 진단
- `frontend/public/websocket-debug.html`: 브라우저 기반 WebSocket 테스트 도구
- `frontend/src/tests/websocketService.test.js`: 프론트엔드 WebSocket 서비스 테스트

### 2. 향상된 로깅 및 모니터링

#### 백엔드 로깅 개선
```javascript
// WebSocket 서버에서 상세한 로깅 추가
console.log('🔔 Handling subscription request:', {
  userId: ws.userId,
  connectionId: ws.connectionId,
  inspectionId,
  payload
});

console.log('📊 Broadcasting progress update:', {
  inspectionId,
  subscriberCount: subscribers?.size || 0,
  progressData: progressData.progress?.percentage
});
```

#### 프론트엔드 로깅 개선
```javascript
// WebSocket 메시지 수신 시 상세 로깅
console.log('📨 WebSocket message received:', message);
console.log('🔔 Attempting to subscribe to inspection:', inspectionId);
console.log('🔌 Current connection status:', this.getConnectionStatus());
```

### 3. 실시간 WebSocket 상태 모니터링

#### 개발 환경용 상태 표시 컴포넌트
- 화면 우상단에 WebSocket 연결 상태 실시간 표시
- 클릭하여 상세 정보 확인 가능
- 수동 연결/해제 버튼 제공
- 디버그 정보 콘솔 출력 기능

```javascript
// WebSocketStatus 컴포넌트 특징
- 연결 상태 시각적 표시 (녹색/노란색/빨간색 점)
- Ready State, 구독 수, 큐된 메시지 수 표시
- 개발 환경에서만 표시 (프로덕션에서는 숨김)
- 실시간 상태 업데이트 (1초마다)
```

### 4. 자동 연결 복구 및 검증

#### 검사 시작 시 WebSocket 상태 확인
```javascript
// WebSocket 연결 상태 사전 확인 및 강제 연결
const wsStatus = webSocketService.getConnectionStatus();
if (!wsStatus.isConnected) {
  const token = webSocketService.getStoredToken();
  if (token) {
    await webSocketService.connect(token);
  }
}
```

#### 연결 건강성 체크
```javascript
// 주기적 연결 상태 모니터링
const health = webSocketService.checkConnectionHealth();
if (!health.isHealthy) {
  await this.forceReconnect();
}
```

### 4. 리소스 정리 및 메모리 누수 방지

#### 검사 완료 시 자동 정리
```javascript
// 검사 완료 시 WebSocket 구독 자동 해제
webSocketService.broadcastInspectionComplete(inspectionId, {
  status: 'COMPLETED',
  // ... completion data
});

// 1분 후 자동 정리
setTimeout(() => {
  this.clients.delete(inspectionId);
}, 60000);
```

#### 클라이언트 연결 종료 시 정리
```javascript
// 연결 종료 시 모든 구독 해제
this.subscriptions.forEach((callbacks, inspectionId) => {
  this.sendMessage({
    type: 'unsubscribe_inspection',
    payload: { inspectionId }
  });
});
```

## 테스트 방법

### 1. 백엔드 WebSocket 테스트 실행
```bash
cd backend
npm run test:websocket
```

### 2. 브라우저 기반 디버깅 도구 사용
1. 브라우저에서 `http://localhost:3000/websocket-debug.html` 접속
2. 로그인 정보 입력 후 "연결" 버튼 클릭
3. "구독 테스트" 또는 "검사 시뮬레이션" 실행
4. 실시간 로그에서 WebSocket 메시지 확인

### 3. 개발자 도구에서 디버깅
```javascript
// 브라우저 콘솔에서 WebSocket 디버거 사용
wsDebugger.startDebugging();
wsDebugger.runFullDiagnosis();
wsDebugger.testConnection();
wsDebugger.generateReport();
```

## 문제 진단 체크리스트

### 1. 연결 상태 확인
- [ ] WebSocket 서버가 실행 중인가?
- [ ] 인증 토큰이 유효한가?
- [ ] 브라우저가 WebSocket을 지원하는가?
- [ ] 네트워크 방화벽이 WebSocket을 차단하지 않는가?

### 2. 구독 상태 확인
- [ ] 검사 ID가 올바르게 전달되었는가?
- [ ] 구독 확인 메시지를 받았는가?
- [ ] 서버에서 해당 검사 ID로 브로드캐스트하고 있는가?

### 3. 메시지 흐름 확인
- [ ] 검사 시작 시 상태 변경 메시지가 전송되는가?
- [ ] 진행률 업데이트 메시지가 주기적으로 전송되는가?
- [ ] 검사 완료 시 완료 메시지가 전송되는가?

## 일반적인 문제 및 해결책

### 1. "WebSocket connection failed" 오류
**원인**: 서버가 실행되지 않았거나 잘못된 URL
**해결책**: 
- 백엔드 서버 실행 상태 확인
- WebSocket URL 확인 (`ws://localhost:5000/ws/inspections`)

### 2. "No authentication token" 오류
**원인**: 로그인하지 않았거나 토큰이 만료됨
**해결책**:
- 다시 로그인하여 새 토큰 획득
- 토큰 저장소 확인 (localStorage/sessionStorage)

### 3. "No subscribers found" 로그
**원인**: 구독이 제대로 설정되지 않음
**해결책**:
- 구독 메시지가 올바르게 전송되었는지 확인
- 검사 ID가 정확한지 확인
- 서버 로그에서 구독 처리 상태 확인

### 4. 메시지를 받지 못함
**원인**: 연결이 끊어졌거나 구독이 해제됨
**해결책**:
- 연결 상태 확인 및 재연결
- 구독 상태 확인 및 재구독
- 네트워크 연결 상태 확인

## 성능 최적화

### 1. 연결 풀링
- 불필요한 재연결 방지
- 연결 상태 캐싱

### 2. 메시지 큐잉
- 연결 끊김 시 메시지 임시 저장
- 재연결 시 큐된 메시지 전송

### 3. 자동 정리
- 완료된 검사의 구독 자동 해제
- 비활성 연결 정리

## 모니터링 및 알림

### 1. 연결 상태 모니터링
```javascript
// 연결 통계 확인
const stats = webSocketService.getConnectionStats();
console.log('WebSocket Stats:', stats);
```

### 2. 오류 알림
```javascript
// 연결 오류 시 사용자에게 알림
webSocketService.on('error', (error) => {
  showNotification('WebSocket 연결 오류', error.message, 'error');
});
```

### 3. 성능 메트릭
- 연결 시간 측정
- 메시지 처리 속도 모니터링
- 재연결 빈도 추적

## 온디맨드 WebSocket 연결의 장점

### 1. 리소스 효율성
- 필요할 때만 연결하여 서버 리소스 절약
- 불필요한 연결 유지 비용 제거
- 메모리 사용량 최적화

### 2. 보안 강화
- 연결 시간 최소화로 공격 표면 감소
- 세션 관리 단순화
- 토큰 만료 위험 감소

### 3. 사용자 경험 개선
- 명확한 연결 생명주기
- 예측 가능한 동작
- 디버깅 용이성

### 4. 개발 및 운영 편의성
- 실시간 상태 모니터링
- 명확한 로깅 및 디버깅
- 문제 진단 도구 제공

## 추가 개선 사항

### 1. 폴백 메커니즘
WebSocket 연결 실패 시 HTTP 폴링으로 대체

### 2. 연결 품질 측정
- 지연 시간 측정
- 패킷 손실률 모니터링

### 3. 고급 모니터링
- 연결 패턴 분석
- 성능 메트릭 수집
- 알림 및 경고 시스템

이러한 온디맨드 WebSocket 연결 방식을 통해 리소스 효율성과 사용자 경험을 크게 향상시킬 수 있습니다.