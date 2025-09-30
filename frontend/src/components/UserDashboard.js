import React, { useState, useEffect } from 'react';
import { useAuth } from '../context';
import { userService } from '../services';
import './UserDashboard.css';

const UserDashboard = () => {
  const { user, userStatus, isAuthenticated, logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!isAuthenticated) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await userService.getProfile();
        if (response.success) {
          setProfile(response.data);
        } else {
          setError(response.message || '프로필을 불러올 수 없습니다.');
        }
      } catch (err) {
        console.error('Profile fetch error:', err);
        setError('프로필을 불러오는 중 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [isAuthenticated]);

  const getStatusInfo = (status) => {
    switch (status) {
      case 'pending':
        return {
          text: '승인 대기',
          message: '관리자의 승인을 기다리고 있습니다. 승인이 완료되면 모든 기능을 사용할 수 있습니다.',
          className: 'status-pending',
          icon: '⏳'
        };
      case 'approved':
      case 'active':
        return {
          text: '활성',
          message: '계정이 승인되었습니다. 모든 기능을 사용할 수 있습니다.',
          className: 'status-active',
          icon: '✅'
        };
      case 'rejected':
        return {
          text: '거부됨',
          message: '계정 승인이 거부되었습니다. 자세한 내용은 관리자에게 문의하세요.',
          className: 'status-rejected',
          icon: '❌'
        };
      default:
        return {
          text: '알 수 없음',
          message: '계정 상태를 확인할 수 없습니다.',
          className: 'status-unknown',
          icon: '❓'
        };
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="user-dashboard">
        <div className="dashboard-card">
          <h2>로그인이 필요합니다</h2>
          <p>대시보드에 접근하려면 먼저 로그인해주세요.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="user-dashboard">
        <div className="dashboard-card">
          <div className="loading">프로필을 불러오는 중...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="user-dashboard">
        <div className="dashboard-card">
          <div className="error-message">
            <h3>오류 발생</h3>
            <p>{error}</p>
            <button onClick={() => window.location.reload()} className="retry-button">
              다시 시도
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentStatus = profile?.status || userStatus;
  const statusInfo = getStatusInfo(currentStatus);

  return (
    <main className="user-dashboard" role="main" aria-labelledby="dashboard-title">
      <div className="dashboard-header">
        <h1 id="dashboard-title" className="page-title">사용자 대시보드</h1>
        <button 
          onClick={logout} 
          className="logout-button"
          aria-label="로그아웃하기"
          type="button"
        >
          로그아웃
        </button>
      </div>

      <div className="dashboard-content">
        {/* 사용자 정보 카드 */}
        <section className="dashboard-card user-info-card" aria-labelledby="user-info-title">
          <h2 id="user-info-title" className="section-title">사용자 정보</h2>
          <dl className="user-info">
            <div className="info-item">
              <dt>사용자명:</dt>
              <dd>{profile?.username || user?.username || 'N/A'}</dd>
            </div>
            <div className="info-item">
              <dt>회사명:</dt>
              <dd>{profile?.companyName || 'N/A'}</dd>
            </div>
            <div className="info-item">
              <dt>AWS Role ARN:</dt>
              <dd className="role-arn">{profile?.roleArn || 'N/A'}</dd>
            </div>
            <div className="info-item">
              <dt>가입일:</dt>
              <dd>
                {profile?.createdAt 
                  ? new Date(profile.createdAt).toLocaleDateString('ko-KR')
                  : 'N/A'
                }
              </dd>
            </div>
          </dl>
        </section>

        {/* 계정 상태 카드 */}
        <section className={`dashboard-card status-card ${statusInfo.className}`} aria-labelledby="account-status-title">
          <h2 id="account-status-title" className="section-title">계정 상태</h2>
          <div className="status-display" role="status" aria-live="polite">
            <div className="status-icon" aria-hidden="true">{statusInfo.icon}</div>
            <div className="status-info">
              <div className="status-text">{statusInfo.text}</div>
              <div className="status-message">{statusInfo.message}</div>
            </div>
          </div>
        </section>

        {/* ARN 검증 상태 카드 (활성 사용자만) */}
        {currentStatus === 'approved' || currentStatus === 'active' ? (
          <section className="dashboard-card arn-validation-card" aria-labelledby="arn-validation-title">
            <h2 id="arn-validation-title" className="section-title">AWS Role ARN 검증 상태</h2>
            <div className="arn-validation">
              {profile?.arnValidation ? (
                <div className={`validation-status ${profile.arnValidation.isValid ? 'valid' : 'invalid'}`}>
                  <div className="validation-icon">
                    {profile.arnValidation.isValid ? '✅' : '❌'}
                  </div>
                  <div className="validation-info">
                    <div className="validation-text">
                      {profile.arnValidation.isValid ? 'ARN 유효함' : 'ARN 무효함'}
                    </div>
                    <div className="validation-details">
                      마지막 확인: {
                        profile.arnValidation.lastChecked 
                          ? new Date(profile.arnValidation.lastChecked).toLocaleString('ko-KR')
                          : '확인되지 않음'
                      }
                    </div>
                    {profile.arnValidation.error && (
                      <div className="validation-error">
                        오류: {profile.arnValidation.error}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="validation-status pending">
                  <div className="validation-icon">⏳</div>
                  <div className="validation-info">
                    <div className="validation-text">ARN 검증 대기 중</div>
                    <div className="validation-details">
                      관리자가 ARN을 검증하면 결과가 여기에 표시됩니다.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : null}

        {/* 추가 안내 메시지 */}
        <section className="dashboard-card info-card" aria-labelledby="info-title">
          <h2 id="info-title" className="section-title">안내사항</h2>
          <div className="info-content">
            {currentStatus === 'pending' && (
              <ul>
                <li>계정 승인은 관리자가 수동으로 처리합니다.</li>
                <li>승인 과정에서 AWS Role ARN의 유효성이 검증됩니다.</li>
                <li>승인이 완료되면 이메일로 알림을 받게 됩니다.</li>
              </ul>
            )}
            {(currentStatus === 'approved' || currentStatus === 'active') && (
              <ul>
                <li>모든 시스템 기능을 사용할 수 있습니다.</li>
                <li>AWS Role ARN이 주기적으로 검증됩니다.</li>
                <li>문제가 발생하면 관리자에게 문의하세요.</li>
              </ul>
            )}
            {currentStatus === 'rejected' && (
              <ul>
                <li>계정 승인이 거부된 이유를 확인하려면 관리자에게 문의하세요.</li>
                <li>필요한 경우 새로운 계정으로 다시 가입할 수 있습니다.</li>
                <li>AWS Role ARN 정보가 올바른지 확인해주세요.</li>
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
  );
};

export default UserDashboard;