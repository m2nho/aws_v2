# 백그라운드 검사 시스템 사용법

## 개요
사용자가 검사를 시작한 후 다른 작업을 할 수 있도록 백그라운드에서 검사를 진행하고 알림을 제공하는 시스템입니다.

## 주요 기능

### 1. 백그라운드 진행률 모니터링
- 검사가 진행되는 동안 화면 우하단에 작은 모니터 표시
- 실시간 진행률, 현재 단계, 예상 완료 시간 표시
- 클릭하여 상세 정보 확장/축소 가능

### 2. 스마트 알림 시스템
- 25%, 50%, 75% 진행률 도달 시 자동 알림
- 검사 완료 시 알림 토스트 표시
- 오류 발생 시 즉시 알림

### 3. 다중 검사 지원
- 여러 검사를 동시에 백그라운드에서 실행 가능
- 각 검사별로 독립적인 모니터 표시
- 세로로 배치되어 겹치지 않음

## 사용 방법

### 1. 기본 설정
```jsx
import { InspectionProvider } from './context/InspectionContext';
import BackgroundInspectionManager from './components/BackgroundInspectionManager';

function App() {
  return (
    <InspectionProvider>
      <YourAppContent />
      <BackgroundInspectionManager />
    </InspectionProvider>
  );
}
```

### 2. 검사 컴포넌트에서 사용
```jsx
import { useInspection } from './context/InspectionContext';
import EnhancedProgressMonitor from './components/EnhancedProgressMonitor';

function InspectionPage() {
  const { startInspection, moveToBackground } = useInspection();
  
  const handleStartInspection = (inspectionData) => {
    const inspection = startInspection({
      inspectionId: inspectionData.subscriptionId,
      batchId: inspectionData.batchId,
      serviceType: inspectionData.serviceType,
      itemNames: inspectionData.inspectionJobs?.map(job => job.itemName) || []
    });
  };

  const handleMoveToBackground = () => {
    moveToBackground(inspectionId);
  };

  return (
    <EnhancedProgressMonitor
      inspectionId={inspectionId}
      serviceType={serviceType}
      onMoveToBackground={handleMoveToBackground}
      allowBackground={true}
    />
  );
}
```

### 3. 백그라운드 모니터 사용
```jsx
<BackgroundInspectionMonitor
  inspectionId={inspectionId}
  serviceType={serviceType}
  onComplete={handleComplete}
  onError={handleError}
  minimized={true}
/>
```

## 컴포넌트 API

### InspectionProvider
검사 상태를 전역적으로 관리하는 컨텍스트 프로바이더

### useInspection Hook
```jsx
const {
  activeInspections,        // 활성 검사 목록
  completedInspections,     // 완료된 검사 목록
  startInspection,          // 새 검사 시작
  moveToBackground,         // 백그라운드로 이동
  moveToForeground,         // 포그라운드로 이동
  updateInspectionProgress, // 진행률 업데이트
  completeInspection,       // 검사 완료 처리
  removeInspection,         // 검사 제거
  getBackgroundInspections, // 백그라운드 검사 목록
  getForegroundInspection,  // 포그라운드 검사
  getInspection,           // 특정 검사 정보
  getActiveInspectionCount // 활성 검사 수
} = useInspection();
```

### BackgroundInspectionMonitor Props
```jsx
{
  inspectionId: string,        // 검사 ID
  serviceType: string,         // 서비스 타입 (EC2, S3, IAM 등)
  onComplete: function,        // 완료 콜백
  onError: function,          // 오류 콜백
  onToggleMinimize: function, // 최소화 토글 콜백
  minimized: boolean          // 초기 최소화 상태
}
```

### EnhancedProgressMonitor 추가 Props
```jsx
{
  onMoveToBackground: function, // 백그라운드 이동 콜백
  allowBackground: boolean      // 백그라운드 이동 허용 여부
}
```

## 사용자 경험

### 1. 검사 시작
- 사용자가 검사를 시작하면 전체 화면에 진행률 표시
- "백그라운드로 이동" 버튼 클릭 시 작은 모니터로 전환

### 2. 백그라운드 진행
- 화면 우하단에 작은 모니터 표시
- 진행률 바와 기본 정보만 표시
- 클릭하여 상세 정보 확인 가능

### 3. 알림 시스템
- 중요한 진행률 도달 시 토스트 알림
- 완료 시 성공/실패 알림
- 3초 후 자동 사라짐

### 4. 다중 검사
- 여러 검사 동시 실행 시 세로로 배치
- 각각 독립적으로 관리
- 최신 검사가 위에 표시

## 스타일링

### CSS 클래스
- `.background-monitor`: 백그라운드 모니터 컨테이너
- `.background-monitor.minimized`: 최소화된 상태
- `.inspection-notification`: 알림 토스트
- `.progress-actions`: 진행률 액션 버튼 컨테이너
- `.background-button`: 백그라운드 이동 버튼

### 반응형 디자인
- 모바일에서는 전체 너비 사용
- 태블릿/데스크톱에서는 고정 너비

### 다크 모드 지원
- `prefers-color-scheme: dark` 미디어 쿼리 사용
- 자동으로 다크 테마 적용

## 접근성

### 키보드 네비게이션
- 모든 버튼이 키보드로 접근 가능
- Tab 키로 순차 이동

### 스크린 리더 지원
- `aria-label`과 `title` 속성 제공
- 의미있는 텍스트 제공

### 시각적 피드백
- 호버/포커스 상태 명확히 표시
- 색상 외에도 아이콘으로 상태 구분

## 성능 최적화

### 메모리 관리
- 완료된 검사는 최대 10개만 유지
- 불필요한 리렌더링 방지

### 네트워크 효율성
- WebSocket 연결 재사용
- 중복 구독 방지

### 배터리 절약
- 백그라운드에서는 업데이트 빈도 조절
- 불필요한 애니메이션 최소화