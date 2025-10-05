import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context';
import { Navigation, ProtectedRoute, PublicRoute, UserList, ResourceInspectionTab } from './components';
import InspectionHistory from './components/InspectionHistory';
import WebSocketStatus from './components/WebSocketStatus';
import { RegisterPage, LoginPage, UserDashboardPage } from './pages';
import './App.css';

// Admin Panel component with UserList
const AdminPanel = () => {
  return (
    <section className="admin-panel" aria-labelledby="admin-panel-title">
      <h1 id="admin-panel-title" className="sr-only">관리자 패널</h1>
      <UserList />
    </section>
  );
};

// Main App component that uses AuthContext
function AppContent() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-container" role="status" aria-live="polite">
        <div className="loading-spinner" aria-label="애플리케이션 로딩 중">
          <span className="sr-only">로딩 중...</span>
          로딩 중...
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className="App">
        {/* Skip to main content link for keyboard navigation */}
        <a href="#main-content" className="skip-link">
          메인 콘텐츠로 건너뛰기
        </a>
        
        <header className="App-header" role="banner">
          <h1 className="sr-only">AWS 사용자 관리 시스템</h1>
        </header>
        
        <Navigation />
        
        <main id="main-content" role="main" tabIndex="-1">
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route 
              path="/login" 
              element={
                <PublicRoute>
                  <LoginPage />
                </PublicRoute>
              } 
            />
            <Route 
              path="/register" 
              element={
                <PublicRoute>
                  <RegisterPage />
                </PublicRoute>
              } 
            />
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <UserDashboardPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin" 
              element={
                <ProtectedRoute requireAdmin={true}>
                  <AdminPanel />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/inspection" 
              element={
                <ProtectedRoute>
                  <ResourceInspectionTab />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/history" 
              element={
                <ProtectedRoute>
                  <InspectionHistory />
                </ProtectedRoute>
              } 
            />
          </Routes>
        </main>
        
        {/* WebSocket 상태 표시 (개발 환경에서만) */}
        <WebSocketStatus />
      </div>
    </Router>
  );
}

// Root App component with AuthProvider
function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;