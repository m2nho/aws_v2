import React, { useState, useEffect } from 'react';
import { adminService } from '../services';
import './UserList.css';

const UserList = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [actionError, setActionError] = useState({});
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    fetchUsers();
    
    // Check initial screen size
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminService.getAllUsers();
      if (response.success) {
        setUsers(response.data || []);
      } else {
        setError(response.message || '사용자 목록을 불러올 수 없습니다.');
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
      setError('사용자 목록을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusInfo = (status) => {
    switch (status) {
      case 'pending':
        return {
          text: '승인 대기',
          className: 'status-pending',
          icon: '⏳'
        };
      case 'approved':
      case 'active':
        return {
          text: '활성',
          className: 'status-active',
          icon: '✅'
        };
      case 'rejected':
        return {
          text: '거부됨',
          className: 'status-rejected',
          icon: '❌'
        };
      default:
        return {
          text: '알 수 없음',
          className: 'status-unknown',
          icon: '❓'
        };
    }
  };

  const getArnValidationInfo = (arnValidation) => {
    if (!arnValidation) {
      return {
        text: '검증 대기',
        className: 'arn-pending',
        icon: '⏳'
      };
    }

    if (arnValidation.isValid) {
      return {
        text: '유효함',
        className: 'arn-valid',
        icon: '✅'
      };
    } else {
      return {
        text: '무효함',
        className: 'arn-invalid',
        icon: '❌'
      };
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const handleStatusChange = async (userId, newStatus) => {
    try {
      setActionLoading(prev => ({ ...prev, [`status-${userId}`]: true }));
      setActionError(prev => ({ ...prev, [`status-${userId}`]: null }));

      const response = await adminService.updateUserStatus(userId, newStatus);
      
      if (response.success) {
        // Update the user in the local state
        setUsers(prevUsers => 
          prevUsers.map(user => 
            user.userId === userId 
              ? { ...user, status: newStatus, updatedAt: new Date().toISOString() }
              : user
          )
        );
      } else {
        setActionError(prev => ({ 
          ...prev, 
          [`status-${userId}`]: response.message || '상태 변경에 실패했습니다.' 
        }));
      }
    } catch (err) {
      console.error('Failed to update user status:', err);
      setActionError(prev => ({ 
        ...prev, 
        [`status-${userId}`]: '상태 변경 중 오류가 발생했습니다.' 
      }));
    } finally {
      setActionLoading(prev => ({ ...prev, [`status-${userId}`]: false }));
    }
  };

  const handleArnValidation = async (userId) => {
    try {
      setActionLoading(prev => ({ ...prev, [`arn-${userId}`]: true }));
      setActionError(prev => ({ ...prev, [`arn-${userId}`]: null }));

      const response = await adminService.validateUserArn(userId);
      
      if (response.success !== false) {
        // Update the user's ARN validation in the local state
        setUsers(prevUsers => 
          prevUsers.map(user => 
            user.userId === userId 
              ? { 
                  ...user, 
                  arnValidation: {
                    isValid: response.data?.arnValid || false,
                    lastChecked: response.data?.lastChecked || new Date().toISOString(),
                    error: response.data?.error || null
                  }
                }
              : user
          )
        );
      } else {
        setActionError(prev => ({ 
          ...prev, 
          [`arn-${userId}`]: response.message || 'ARN 검증에 실패했습니다.' 
        }));
      }
    } catch (err) {
      console.error('Failed to validate ARN:', err);
      setActionError(prev => ({ 
        ...prev, 
        [`arn-${userId}`]: 'ARN 검증 중 오류가 발생했습니다.' 
      }));
    } finally {
      setActionLoading(prev => ({ ...prev, [`arn-${userId}`]: false }));
    }
  };

  if (loading) {
    return (
      <div className="user-list">
        <div className="user-list-header">
          <h2>사용자 목록</h2>
        </div>
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>사용자 목록을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="user-list">
        <div className="user-list-header">
          <h2>사용자 목록</h2>
        </div>
        <div className="error-container">
          <div className="error-message">
            <h3>오류 발생</h3>
            <p>{error}</p>
            <button onClick={fetchUsers} className="retry-button">
              다시 시도
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="user-list admin-panel" role="main" aria-labelledby="user-list-title">
      <div className="user-list-header">
        <h1 id="user-list-title" className="page-title">사용자 목록</h1>
        <div className="user-count" aria-live="polite">
          총 {users.length}명의 사용자 {process.env.NODE_ENV === 'development' && `(${isMobile ? '모바일' : '데스크톱'} 모드)`}
        </div>
      </div>

      {users.length === 0 ? (
        <div className="empty-state">
          <p>등록된 사용자가 없습니다.</p>
        </div>
      ) : (
        <>
          {/* Desktop Table Layout */}
          {!isMobile && (
            <div className="table-container">
            <table className="user-table" role="table" aria-label="사용자 목록 테이블">
              <caption className="sr-only">
                사용자 목록 - 총 {users.length}명의 사용자 정보와 관리 기능을 제공합니다.
              </caption>
              <thead>
                <tr role="row">
                  <th scope="col">사용자명</th>
                  <th scope="col">회사명</th>
                  <th scope="col">상태</th>
                  <th scope="col">ARN 검증</th>
                  <th scope="col">가입일</th>
                  <th scope="col">AWS Role ARN</th>
                  <th scope="col">관리</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const statusInfo = getStatusInfo(user.status);
                  const arnInfo = getArnValidationInfo(user.arnValidation);
                  
                  return (
                    <tr key={user.userId} className="user-row" role="row">
                      <th scope="row" className="username-cell">
                        <div className="username-container">
                          <span className="username">{user.username}</span>
                          <span className="user-id" aria-label={`사용자 ID: ${user.userId}`}>{user.userId}</span>
                        </div>
                      </th>
                      
                      <td className="company-cell">
                        {user.companyName || 'N/A'}
                      </td>
                      
                      <td className="status-cell">
                        <div className={`status-badge ${statusInfo.className}`} role="status" aria-label={`계정 상태: ${statusInfo.text}`}>
                          <span className="status-icon" aria-hidden="true">{statusInfo.icon}</span>
                          <span className="status-text">{statusInfo.text}</span>
                        </div>
                      </td>
                      
                      <td className="arn-validation-cell">
                        <div className={`arn-badge ${arnInfo.className}`} role="status" aria-label={`ARN 검증 상태: ${arnInfo.text}`}>
                          <span className="arn-icon" aria-hidden="true">{arnInfo.icon}</span>
                          <span className="arn-text">{arnInfo.text}</span>
                        </div>
                        {user.arnValidation?.lastChecked && (
                          <div className="arn-last-checked" aria-label={`마지막 검증일: ${formatDate(user.arnValidation.lastChecked)}`}>
                            {formatDate(user.arnValidation.lastChecked)}
                          </div>
                        )}
                      </td>
                      
                      <td className="date-cell">
                        {formatDate(user.createdAt)}
                      </td>
                      
                      <td className="arn-cell">
                        <div className="arn-container">
                          <code className="arn-text">{user.roleArn}</code>
                        </div>
                      </td>
                      
                      <td className="actions-cell">
                        <div className="actions-container" role="group" aria-label={`${user.username} 사용자 관리 액션`}>
                          {/* Status Management Buttons */}
                          <div className="status-actions">
                            {user.status === 'pending' && (
                              <>
                                <button
                                  className="action-button approve-button"
                                  onClick={() => handleStatusChange(user.userId, 'approved')}
                                  disabled={actionLoading[`status-${user.userId}`]}
                                  aria-label={`${user.username} 사용자 승인`}
                                  type="button"
                                >
                                  {actionLoading[`status-${user.userId}`] ? '처리중...' : '승인'}
                                </button>
                                <button
                                  className="action-button reject-button"
                                  onClick={() => handleStatusChange(user.userId, 'rejected')}
                                  disabled={actionLoading[`status-${user.userId}`]}
                                  aria-label={`${user.username} 사용자 거부`}
                                  type="button"
                                >
                                  {actionLoading[`status-${user.userId}`] ? '처리중...' : '거부'}
                                </button>
                              </>
                            )}
                            {user.status === 'approved' && (
                              <button
                                className="action-button reject-button"
                                onClick={() => handleStatusChange(user.userId, 'rejected')}
                                disabled={actionLoading[`status-${user.userId}`]}
                                aria-label={`${user.username} 사용자 거부`}
                                type="button"
                              >
                                {actionLoading[`status-${user.userId}`] ? '처리중...' : '거부'}
                              </button>
                            )}
                            {user.status === 'rejected' && (
                              <button
                                className="action-button approve-button"
                                onClick={() => handleStatusChange(user.userId, 'approved')}
                                disabled={actionLoading[`status-${user.userId}`]}
                                aria-label={`${user.username} 사용자 승인`}
                                type="button"
                              >
                                {actionLoading[`status-${user.userId}`] ? '처리중...' : '승인'}
                              </button>
                            )}
                          </div>

                          {/* ARN Validation Button */}
                          <div className="arn-actions">
                            <button
                              className="action-button validate-button"
                              onClick={() => handleArnValidation(user.userId)}
                              disabled={actionLoading[`arn-${user.userId}`]}
                              aria-label={`${user.username} 사용자의 ARN 검증`}
                              type="button"
                            >
                              {actionLoading[`arn-${user.userId}`] ? '검증중...' : 'ARN 검증'}
                            </button>
                          </div>

                          {/* Error Messages */}
                          {actionError[`status-${user.userId}`] && (
                            <div className="action-error" role="alert" aria-live="polite">
                              <span className="sr-only">오류: </span>
                              {actionError[`status-${user.userId}`]}
                            </div>
                          )}
                          {actionError[`arn-${user.userId}`] && (
                            <div className="action-error" role="alert" aria-live="polite">
                              <span className="sr-only">오류: </span>
                              {actionError[`arn-${user.userId}`]}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}

          {/* Mobile Card Layout */}
          {isMobile && (
            <div className="user-cards">
            {users.map((user) => {
              const statusInfo = getStatusInfo(user.status);
              const arnInfo = getArnValidationInfo(user.arnValidation);
              
              return (
                <div key={`card-${user.userId}`} className="user-card">
                  <div className="user-card-header">
                    <div className="user-card-info">
                      <div className="user-card-username">{user.username}</div>
                      <div className="user-card-id">{user.userId}</div>
                      {user.companyName && (
                        <div className="user-card-company">{user.companyName}</div>
                      )}
                    </div>
                    <div className="user-card-status">
                      <div className={`status-badge ${statusInfo.className}`}>
                        <span className="status-icon">{statusInfo.icon}</span>
                        <span className="status-text">{statusInfo.text}</span>
                      </div>
                      <div className={`arn-badge ${arnInfo.className}`}>
                        <span className="arn-icon">{arnInfo.icon}</span>
                        <span className="arn-text">{arnInfo.text}</span>
                      </div>
                    </div>
                  </div>

                  <div className="user-card-body">
                    <div className="user-card-field">
                      <div className="user-card-label">가입일</div>
                      <div className="user-card-value">{formatDate(user.createdAt)}</div>
                    </div>

                    {user.arnValidation?.lastChecked && (
                      <div className="user-card-field">
                        <div className="user-card-label">ARN 마지막 검증</div>
                        <div className="user-card-value">{formatDate(user.arnValidation.lastChecked)}</div>
                      </div>
                    )}

                    <div className="user-card-field">
                      <div className="user-card-label">AWS Role ARN</div>
                      <div className="user-card-arn">{user.roleArn}</div>
                    </div>
                  </div>

                  <div className="user-card-actions">
                    <div className="actions-container">
                      {/* Status Management Buttons */}
                      <div className="status-actions">
                        {user.status === 'pending' && (
                          <>
                            <button
                              className="action-button approve-button"
                              onClick={() => handleStatusChange(user.userId, 'approved')}
                              disabled={actionLoading[`status-${user.userId}`]}
                              title="사용자 승인"
                            >
                              {actionLoading[`status-${user.userId}`] ? '처리중...' : '승인'}
                            </button>
                            <button
                              className="action-button reject-button"
                              onClick={() => handleStatusChange(user.userId, 'rejected')}
                              disabled={actionLoading[`status-${user.userId}`]}
                              title="사용자 거부"
                            >
                              {actionLoading[`status-${user.userId}`] ? '처리중...' : '거부'}
                            </button>
                          </>
                        )}
                        {user.status === 'approved' && (
                          <button
                            className="action-button reject-button"
                            onClick={() => handleStatusChange(user.userId, 'rejected')}
                            disabled={actionLoading[`status-${user.userId}`]}
                            title="사용자 거부"
                          >
                            {actionLoading[`status-${user.userId}`] ? '처리중...' : '거부'}
                          </button>
                        )}
                        {user.status === 'rejected' && (
                          <button
                            className="action-button approve-button"
                            onClick={() => handleStatusChange(user.userId, 'approved')}
                            disabled={actionLoading[`status-${user.userId}`]}
                            title="사용자 승인"
                          >
                            {actionLoading[`status-${user.userId}`] ? '처리중...' : '승인'}
                          </button>
                        )}
                      </div>

                      {/* ARN Validation Button */}
                      <div className="arn-actions">
                        <button
                          className="action-button validate-button"
                          onClick={() => handleArnValidation(user.userId)}
                          disabled={actionLoading[`arn-${user.userId}`]}
                          title="ARN 검증"
                        >
                          {actionLoading[`arn-${user.userId}`] ? '검증중...' : 'ARN 검증'}
                        </button>
                      </div>

                      {/* Error Messages */}
                      {actionError[`status-${user.userId}`] && (
                        <div className="action-error">
                          {actionError[`status-${user.userId}`]}
                        </div>
                      )}
                      {actionError[`arn-${user.userId}`] && (
                        <div className="action-error">
                          {actionError[`arn-${user.userId}`]}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          )}
        </>
      )}
    </main>
  );
};

export default UserList;