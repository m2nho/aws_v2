# AWS User Management System

AWS 역할 기반 사용자 관리 시스템입니다. React 프론트엔드와 Express 백엔드로 구성되며, AWS Cognito, DynamoDB, STS를 활용합니다.

## 프로젝트 구조

```
├── frontend/          # React 프론트엔드
├── backend/           # Express 백엔드
└── README.md
```

## 시작하기

### 백엔드 설정

1. 백엔드 디렉토리로 이동:
```bash
cd backend
```

2. 의존성 설치:
```bash
npm install
```

3. 환경 변수 설정:
```bash
cp .env.example .env
# .env 파일을 편집하여 AWS 자격증명 및 설정 입력
```

4. 서버 실행:
```bash
npm run dev
```

### 프론트엔드 설정

1. 프론트엔드 디렉토리로 이동:
```bash
cd frontend
```

2. 의존성 설치:
```bash
npm install
```

3. 개발 서버 실행:
```bash
npm start
```

## 기능

- 사용자 회원가입 (AWS Role ARN 포함)
- AWS Cognito 기반 인증
- 관리자 승인 시스템
- AWS Role ARN 유효성 검증
- 사용자 상태 관리

## 기술 스택

- **Frontend**: React 18, React Router, Axios
- **Backend**: Node.js, Express, AWS SDK v3
- **AWS Services**: Cognito, DynamoDB, STS