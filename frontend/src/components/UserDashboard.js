import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context';
import { userService } from '../services';
import './UserDashboard.css';

const UserDashboard = () => {
  const { userStatus, isAuthenticated, logout, user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copySuccess, setCopySuccess] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);


  const fetchProfile = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    try {
      setIsRefreshing(true);
      const response = await userService.getProfile();
      if (response.success) {
        setProfile(response.data);
        setError(null);
      } else {
        setError(response.message || '프로필을 불러올 수 없습니다.');
      }
    } catch (err) {
      console.error('Profile fetch error:', err);
      setError('프로필을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleCopyArn = async (arn) => {
    try {
      await navigator.clipboard.writeText(arn);
      setCopySuccess('복사됨!');
      setTimeout(() => setCopySuccess(''), 2000);
    } catch (err) {
      setCopySuccess('복사 실패');
      setTimeout(() => setCopySuccess(''), 2000);
    }
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordForm(prev => ({
      ...prev,
      [name]: value
    }));
    // 에러 메시지 초기화
    if (passwordError) {
      setPasswordError('');
    }
  };

  const validatePasswordForm = () => {
    const { currentPassword, newPassword, confirmPassword } = passwordForm;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return '모든 필드를 입력해주세요.';
    }

    if (newPassword.length < 8) {
      return '새 비밀번호는 최소 8자 이상이어야 합니다.';
    }

    if (newPassword !== confirmPassword) {
      return '새 비밀번호와 확인 비밀번호가 일치하지 않습니다.';
    }

    if (currentPassword === newPassword) {
      return '새 비밀번호는 현재 비밀번호와 달라야 합니다.';
    }

    return null;
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();

    const validationError = validatePasswordForm();
    if (validationError) {
      setPasswordError(validationError);
      return;
    }

    setIsChangingPassword(true);
    setPasswordError('');

    try {
      const response = await userService.changePassword(passwordForm);

      if (response.success) {
        setPasswordSuccess('비밀번호가 성공적으로 변경되었습니다.');
        setPasswordForm({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
        setTimeout(() => {
          setShowPasswordModal(false);
          setPasswordSuccess('');
        }, 2000);
      } else {
        setPasswordError(response.error?.message || '비밀번호 변경에 실패했습니다.');
      }
    } catch (error) {
      console.error('Password change error:', error);
      if (error.response?.status === 401) {
        setPasswordError('현재 비밀번호가 올바르지 않습니다.');
      } else if (error.response?.data?.error?.message) {
        setPasswordError(error.response.data.error.message);
      } else {
        setPasswordError('비밀번호 변경 중 오류가 발생했습니다.');
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleClosePasswordModal = () => {
    setShowPasswordModal(false);
    setPasswordForm({
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    });
    setPasswordError('');
    setPasswordSuccess('');
  };

  const getStatusInfo = (status) => {
    switch (status) {
      case 'pending':
        return {
          text: '승인 대기 중',
          message: '관리자가 계정을 검토하고 있습니다.',
          detailMessage: '승인 완료까지 잠시만 기다려주세요.',
          className: 'status-pending',
          icon: '⏳',
          actionText: '상태 확인',
          showAction: true
        };
      case 'approved':
        return {
          text: '계정 활성화됨',
          message: '모든 AWS 관리 기능을 사용할 수 있습니다.',
          detailMessage: '안전하고 효율적인 AWS 리소스 관리를 시작하세요.',
          className: 'status-approved',
          icon: '✅',
          actionText: null,
          showAction: false
        };
      case 'rejected':
        return {
          text: '승인 거부됨',
          message: '계정 승인이 거부되었습니다.',
          detailMessage: '관리자에게 직접 문의하시기 바랍니다.',
          className: 'status-rejected',
          icon: '❌',
          actionText: null,
          showAction: false
        };
      default:
        return {
          text: '상태 확인 중',
          message: '계정 상태를 확인하고 있습니다.',
          detailMessage: '잠시 후 다시 시도해주세요.',
          className: 'status-unknown',
          icon: '❓',
          actionText: '다시 확인',
          showAction: true
        };
    }
  };

  const handleStatusAction = (status) => {
    if (status === 'pending' || status === 'unknown') {
      fetchProfile();
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      return '오늘';
    } else if (diffDays === 2) {
      return '어제';
    } else if (diffDays <= 7) {
      return `${diffDays - 1}일 전`;
    } else {
      return date.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="dashboard">
        <div className="dashboard-card welcome-card">
          <div className="welcome-content">
            <div className="welcome-icon">🔐</div>
            <h2>로그인이 필요합니다</h2>
            <p>AWS 사용자 관리 대시보드에 접근하려면 먼저 로그인해주세요.</p>
            <button
              onClick={() => (window.location.href = '/login')}
              className="welcome-button"
            >
              로그인하기
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="dashboard">
        <div className="dashboard-card loading-card">
          <div className="loading-content">
            <div className="loading-spinner"></div>
            <h3>대시보드 로딩 중</h3>
            <p>사용자 정보를 불러오고 있습니다...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard">
        <div className="dashboard-card error-card">
          <div className="error-content">
            <div className="error-icon">⚠️</div>
            <h3>문제가 발생했습니다</h3>
            <p>{error}</p>
            <div className="error-actions">
              <button onClick={fetchProfile} className="retry-button" disabled={isRefreshing}>
                {isRefreshing ? '새로고침 중...' : '다시 시도'}
              </button>
              <button onClick={() => window.location.reload()} className="reload-button">
                페이지 새로고침
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentStatus = profile?.status || userStatus;
  const statusInfo = getStatusInfo(currentStatus);
  const welcomeName = profile?.username || user?.username || '사용자';



  return (
    <div className="dashboard fade-in">
      {/* Simple Header */}
      <div className="dashboard-header slide-down">
        <div className="header-content">
          <h1>안녕하세요, {welcomeName}님! 👋</h1>
          <p className="header-subtitle">AWS 사용자 관리 대시보드</p>
        </div>
        <div className="header-actions">
          <button
            onClick={fetchProfile}
            className="refresh-button"
            disabled={isRefreshing}
            title="정보 새로고침"
          >
            <svg className={isRefreshing ? 'spinning' : ''} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23,4 23,10 17,10" />
              <polyline points="1,20 1,14 7,14" />
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
            </svg>
          </button>
          <button onClick={logout} className="logout-button" title="로그아웃">
            <span>로그아웃</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16,17 21,12 16,7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="dashboard-content">
        {/* User Profile Card */}
        <div className="dashboard-card user-info-card slide-up">
          <div className="card-header">
            <h2>👤 사용자 정보</h2>
            <button
              onClick={() => setShowPasswordModal(true)}
              className="change-password-button"
              title="비밀번호 변경"
            >
              🔒 비밀번호 변경
            </button>
          </div>
          <div className="user-info">
            <div className="info-item">
              <label>👤 사용자명</label>
              <span>{profile?.username || 'N/A'}</span>
            </div>
            <div className="info-item">
              <label>🏢 회사명</label>
              <span>{profile?.companyName || 'N/A'}</span>
            </div>
            <div className="info-item">
              <label>🔑 AWS Role ARN</label>
              <div className="arn-container">
                <span className="role-arn">{profile?.roleArn || 'N/A'}</span>
                {profile?.roleArn && (
                  <button
                    onClick={() => handleCopyArn(profile.roleArn)}
                    className="copy-button"
                    title="ARN 복사"
                  >
                    {copySuccess || '📋'}
                  </button>
                )}
              </div>
            </div>
            <div className="info-item">
              <label>📅 가입일</label>
              <span>{formatDate(profile?.createdAt)}</span>
            </div>
            {profile?.updatedAt && (
              <div className="info-item">
                <label>🔄 마지막 업데이트</label>
                <span>{formatDate(profile.updatedAt)}</span>
              </div>
            )}
            {profile?.accessLevel && (
              <div className="info-item">
                <label>🎯 접근 레벨</label>
                <span className={`access-level ${profile.accessLevel}`}>
                  {profile.accessLevel === 'full' && '전체 접근'}
                  {profile.accessLevel === 'limited' && '제한된 접근'}
                  {profile.accessLevel === 'denied' && '접근 거부'}
                  {profile.accessLevel === 'none' && '접근 없음'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Account Status Card */}
        <div className={`dashboard-card status-card ${statusInfo.className} slide-up-delay`}>
          <div className="card-header">
            <h2>🎯 계정 상태</h2>
          </div>
          <div className="status-display">
            <div className="status-icon-container">
              <div className="status-icon">{statusInfo.icon}</div>
              <div className="status-pulse"></div>
            </div>
            <div className="status-info">
              <div className="status-text">{statusInfo.text}</div>
              <div className="status-message">
                {profile?.statusMessage || statusInfo.message}
              </div>
              {!profile?.statusMessage && (
                <div className="status-detail">{statusInfo.detailMessage}</div>
              )}
              {statusInfo.showAction && (
                <button
                  onClick={() => handleStatusAction(currentStatus)}
                  className="status-action-button"
                  disabled={isRefreshing}
                >
                  {isRefreshing ? '처리 중...' : statusInfo.actionText}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ARN Validation Status - 검증 데이터가 실제로 있을 때만 표시 */}
        {profile?.arnValidation && typeof profile.arnValidation.isValid === 'boolean' && (
          <div className="dashboard-card validation-card slide-up-delay-2">
            <div className="card-header">
              <h2>🔍 ARN 검증 상태</h2>
            </div>
            <div className="validation-info">
              <div className="validation-item">
                <label>검증 상태</label>
                <span className={`validation-status ${profile.arnValidation.isValid ? 'valid' : 'invalid'}`}>
                  {profile.arnValidation.isValid ? '✅ 유효함' : '❌ 유효하지 않음'}
                </span>
              </div>
              {profile.arnValidation.message && (
                <div className="validation-item">
                  <label>검증 메시지</label>
                  <span>{profile.arnValidation.message}</span>
                </div>
              )}
              {profile.arnValidation.lastChecked && (
                <div className="validation-item">
                  <label>마지막 검증</label>
                  <span>{formatDate(profile.arnValidation.lastChecked)}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="modal-overlay" onClick={handleClosePasswordModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🔒 비밀번호 변경</h3>
              <button
                className="modal-close-button"
                onClick={handleClosePasswordModal}
                aria-label="모달 닫기"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePasswordSubmit} className="password-form">
              <div className="form-group">
                <label htmlFor="currentPassword">현재 비밀번호</label>
                <input
                  type="password"
                  id="currentPassword"
                  name="currentPassword"
                  value={passwordForm.currentPassword}
                  onChange={handlePasswordChange}
                  placeholder="현재 비밀번호를 입력하세요"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="newPassword">새 비밀번호</label>
                <input
                  type="password"
                  id="newPassword"
                  name="newPassword"
                  value={passwordForm.newPassword}
                  onChange={handlePasswordChange}
                  placeholder="새 비밀번호를 입력하세요 (최소 8자)"
                  required
                  minLength="8"
                />
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword">새 비밀번호 확인</label>
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  value={passwordForm.confirmPassword}
                  onChange={handlePasswordChange}
                  placeholder="새 비밀번호를 다시 입력하세요"
                  required
                />
              </div>

              {passwordError && (
                <div className="error-message">
                  ⚠️ {passwordError}
                </div>
              )}

              {passwordSuccess && (
                <div className="success-message">
                  ✅ {passwordSuccess}
                </div>
              )}

              <div className="form-actions">
                <button
                  type="button"
                  onClick={handleClosePasswordModal}
                  className="cancel-button"
                  disabled={isChangingPassword}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="submit-button"
                  disabled={isChangingPassword}
                >
                  {isChangingPassword ? '변경 중...' : '비밀번호 변경'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Success Toast */}
      {copySuccess && (
        <div className="toast-message">
          {copySuccess}
        </div>
      )}
    </div>
  );
};

export default UserDashboard;