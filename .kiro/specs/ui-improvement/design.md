# 디자인 문서

## 개요

AWS 사용자 관리 시스템의 프론트엔드 UI를 현대적이고 사용자 친화적으로 개선합니다. 기존 기능은 그대로 유지하면서 디자인 시스템, 반응형 레이아웃, 사용자 경험을 향상시킵니다. 모든 컴포넌트가 일관된 디자인 언어를 사용하고, 다양한 디바이스에서 최적화된 경험을 제공합니다.

## 아키텍처

### 디자인 시스템 구조 (완전 재작성)

```
frontend/src/
├── styles/
│   ├── globals.css          # 전역 스타일 및 CSS 변수 (완전 새로 작성)
│   ├── components.css       # 공통 컴포넌트 스타일 (새로 작성)
│   └── utilities.css        # 유틸리티 클래스 (새로 작성)
├── components/
│   ├── common/             # 공통 UI 컴포넌트 (새로 생성)
│   │   ├── Button/
│   │   ├── Card/
│   │   ├── Input/
│   │   ├── Badge/
│   │   ├── LoadingSpinner/
│   │   └── Toast/
│   ├── LoginForm.css       # 완전 재작성
│   ├── RegisterForm.css    # 완전 재작성
│   ├── UserDashboard.css   # 완전 재작성
│   ├── UserList.css        # 완전 재작성
│   └── Navigation.css      # 새로 작성
├── App.css                 # 완전 재작성
├── index.css              # 완전 재작성
└── hooks/
    └── useToast.js         # 토스트 알림 훅 (새로 생성)
```

### 기존 스타일 완전 교체 전략

1. **기존 CSS 파일 백업**: 모든 기존 CSS를 새로운 디자인으로 교체
2. **점진적 교체**: 컴포넌트별로 순차적으로 새 스타일 적용
3. **일관성 보장**: 모든 컴포넌트가 새로운 디자인 시스템 사용
4. **기능 유지**: 기존 기능은 그대로 유지하면서 스타일만 교체

### 반응형 브레이크포인트

- **Mobile**: 320px - 767px
- **Tablet**: 768px - 1023px  
- **Desktop**: 1024px 이상

## 컴포넌트 및 인터페이스

### 1. 디자인 토큰 시스템

#### 색상 팔레트
```css
:root {
  /* Primary Colors */
  --color-primary-50: #eff6ff;
  --color-primary-100: #dbeafe;
  --color-primary-500: #3b82f6;
  --color-primary-600: #2563eb;
  --color-primary-700: #1d4ed8;

  /* Semantic Colors */
  --color-success-50: #f0fdf4;
  --color-success-500: #22c55e;
  --color-success-600: #16a34a;
  
  --color-warning-50: #fffbeb;
  --color-warning-500: #f59e0b;
  --color-warning-600: #d97706;
  
  --color-error-50: #fef2f2;
  --color-error-500: #ef4444;
  --color-error-600: #dc2626;

  /* Neutral Colors */
  --color-gray-50: #f9fafb;
  --color-gray-100: #f3f4f6;
  --color-gray-200: #e5e7eb;
  --color-gray-300: #d1d5db;
  --color-gray-400: #9ca3af;
  --color-gray-500: #6b7280;
  --color-gray-600: #4b5563;
  --color-gray-700: #374151;
  --color-gray-800: #1f2937;
  --color-gray-900: #111827;
}
```

#### 타이포그래피
```css
:root {
  /* Font Families */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  /* Font Sizes */
  --text-xs: 0.75rem;    /* 12px */
  --text-sm: 0.875rem;   /* 14px */
  --text-base: 1rem;     /* 16px */
  --text-lg: 1.125rem;   /* 18px */
  --text-xl: 1.25rem;    /* 20px */
  --text-2xl: 1.5rem;    /* 24px */
  --text-3xl: 1.875rem;  /* 30px */

  /* Font Weights */
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;
}
```

#### 간격 및 크기
```css
:root {
  /* Spacing */
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.25rem;   /* 20px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */

  /* Border Radius */
  --radius-sm: 0.375rem;  /* 6px */
  --radius-md: 0.5rem;    /* 8px */
  --radius-lg: 0.75rem;   /* 12px */
  --radius-xl: 1rem;      /* 16px */

  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1);
}
```

### 2. 공통 컴포넌트

#### Button 컴포넌트
```jsx
// 다양한 variant와 size 지원
<Button variant="primary" size="md" loading={false}>
  로그인
</Button>

// Variants: primary, secondary, outline, ghost, danger
// Sizes: sm, md, lg
```

#### Card 컴포넌트
```jsx
<Card className="dashboard-card">
  <Card.Header>
    <Card.Title>사용자 정보</Card.Title>
  </Card.Header>
  <Card.Content>
    {/* 카드 내용 */}
  </Card.Content>
</Card>
```

#### Input 컴포넌트
```jsx
<Input
  label="이메일"
  type="email"
  placeholder="이메일을 입력하세요"
  error={errors.email}
  hint="올바른 이메일 형식으로 입력해주세요"
/>
```

#### Badge 컴포넌트
```jsx
<Badge variant="success" size="md">
  <Badge.Icon>✅</Badge.Icon>
  활성
</Badge>

// Variants: success, warning, error, info, neutral
```

### 3. 레이아웃 시스템

#### 그리드 시스템
```css
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--space-4);
}

.grid {
  display: grid;
  gap: var(--space-6);
}

.grid-cols-1 { grid-template-columns: repeat(1, 1fr); }
.grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
.grid-cols-3 { grid-template-columns: repeat(3, 1fr); }

/* 반응형 그리드 */
@media (min-width: 768px) {
  .md\:grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
  .md\:grid-cols-3 { grid-template-columns: repeat(3, 1fr); }
}
```

#### Flexbox 유틸리티
```css
.flex { display: flex; }
.flex-col { flex-direction: column; }
.items-center { align-items: center; }
.justify-between { justify-content: space-between; }
.gap-4 { gap: var(--space-4); }
```

### 4. 페이지별 디자인

#### 로그인/회원가입 페이지
- **레이아웃**: 중앙 정렬된 카드 형태
- **배경**: 그라데이션 배경 또는 패턴
- **폼**: 단계별 진행 표시 (회원가입)
- **반응형**: 모바일에서 전체 화면 활용

#### 사용자 대시보드
- **레이아웃**: 카드 기반 그리드 시스템
- **정보 표시**: 아이콘과 색상을 활용한 상태 표시
- **반응형**: 모바일에서 단일 컬럼 스택

#### 관리자 패널
- **데스크톱**: 테이블 형태
- **모바일**: 카드 리스트 형태로 전환
- **액션**: 드롭다운 메뉴 또는 인라인 버튼

### 5. 네비게이션 디자인

#### 데스크톱 네비게이션
```jsx
<nav className="navbar">
  <div className="navbar-brand">
    <Logo />
    <span>AWS 사용자 관리</span>
  </div>
  <div className="navbar-menu">
    <NavLink to="/dashboard">대시보드</NavLink>
    <NavLink to="/admin">관리자</NavLink>
  </div>
  <div className="navbar-actions">
    <UserMenu />
  </div>
</nav>
```

#### 모바일 네비게이션
- **햄버거 메뉴**: 사이드 드로어 형태
- **하단 네비게이션**: 주요 메뉴 접근

## 데이터 모델

### 테마 설정
```typescript
interface Theme {
  mode: 'light' | 'dark';
  primaryColor: string;
  borderRadius: 'none' | 'sm' | 'md' | 'lg';
  density: 'compact' | 'comfortable' | 'spacious';
}
```

### 반응형 상태
```typescript
interface ViewportState {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  width: number;
  height: number;
}
```

## 오류 처리

### 1. 폼 유효성 검사
- **실시간 검증**: 사용자 입력 시 즉시 피드백
- **오류 메시지**: 명확하고 실행 가능한 안내
- **시각적 표시**: 색상과 아이콘으로 상태 구분

### 2. 네트워크 오류
- **재시도 버튼**: 실패한 요청에 대한 재시도 옵션
- **오프라인 감지**: 네트워크 상태 표시
- **타임아웃 처리**: 로딩 상태 관리

### 3. 사용자 피드백
```jsx
// 토스트 알림 시스템
const { showToast } = useToast();

showToast({
  type: 'success',
  title: '성공',
  message: '사용자가 승인되었습니다.',
  duration: 3000
});
```

## 테스트 전략

### 1. 반응형 테스트
- **브레이크포인트 검증**: 각 화면 크기에서 레이아웃 확인
- **터치 인터랙션**: 모바일 디바이스에서 버튼 크기 및 간격
- **가로/세로 모드**: 모바일 회전 시 레이아웃 적응

### 2. 접근성 테스트
- **키보드 네비게이션**: Tab 순서 및 포커스 관리
- **스크린 리더**: ARIA 라벨 및 의미론적 HTML
- **색상 대비**: WCAG 2.1 AA 기준 준수

### 3. 성능 테스트
- **로딩 시간**: 초기 페이지 로드 및 컴포넌트 렌더링
- **애니메이션**: 60fps 부드러운 전환 효과
- **메모리 사용량**: 장시간 사용 시 메모리 누수 방지

## 구현 우선순위

### Phase 1: 기반 시스템
1. 디자인 토큰 및 CSS 변수 설정
2. 공통 컴포넌트 라이브러리 구축
3. 반응형 그리드 시스템 구현

### Phase 2: 페이지 개선
1. 로그인/회원가입 폼 리디자인
2. 사용자 대시보드 카드 레이아웃
3. 네비게이션 컴포넌트 개선

### Phase 3: 고급 기능
1. 관리자 패널 반응형 테이블/카드
2. 토스트 알림 시스템
3. 로딩 상태 및 스켈레톤 UI

### Phase 4: 최적화
1. 애니메이션 및 전환 효과
2. 다크 모드 지원 (선택사항)
3. 성능 최적화 및 접근성 개선

## 기술적 고려사항

### 완전 재작성 접근법
- **기존 CSS 제거**: 모든 기존 스타일을 새로운 디자인으로 교체
- **모던 CSS**: CSS Grid, Flexbox, CSS 변수를 적극 활용
- **컴포넌트 기반**: 각 컴포넌트별 독립적인 스타일 시스템

### 새로운 스타일 아키텍처
- **CSS 변수**: 일관된 디자인 토큰 시스템
- **BEM 방법론**: 명확한 클래스 네이밍 규칙
- **모바일 퍼스트**: 반응형 디자인의 기본 원칙

### 애니메이션 및 인터랙션
- **CSS Transitions**: 부드러운 상태 전환
- **Transform**: 성능 최적화된 애니메이션
- **Micro-interactions**: 사용자 피드백 향상

### 폰트 및 타이포그래피
- **시스템 폰트**: 빠른 로딩과 일관성
- **웹 폰트**: Inter 또는 Pretendard (한글 최적화)
- **타이포그래피 스케일**: 일관된 텍스트 크기 체계

### 색상 및 테마
- **CSS 변수**: 다이나믹 테마 지원 가능
- **접근성**: WCAG 2.1 AA 기준 색상 대비
- **의미론적 색상**: 상태별 명확한 색상 구분