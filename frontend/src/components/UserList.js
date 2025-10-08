import { useState, useEffect, useMemo } from 'react';
import { adminService } from '../services';
import './UserList.css';

const UserList = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [actionError, setActionError] = useState({});
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // 통계 계산
  const stats = useMemo(() => {
    const total = users.length;
    const pending = users.filter(u => u.status === 'pending').length;
    const approved = users.filter(u => u.status === 'approved' || u.status === 'active').length;
    const rejected = users.filter(u => u.status === 'rejected').length;
    const validArn = users.filter(u => u.arnValidation?.isValid).length;
    const invalidArn = users.filter(u => u.arnValidation && !u.arnValidation.isValid).length;
    
    return { total, pending, approved, rejected, validArn, invalidArn };
  }, [users]);

  // 필터링된 사용자 목록
  const filteredUsers = useMemo(() => {
    let filtered = users;
    
    // 상태 필터
    if (filterStatus !== 'all') {
      filtered = filtered.filter(user => user.status === filterStatus);
    }
    
    // 검색 필터
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(user => 
        user.username.toLowerCase().includes(term) ||
        (user.companyName && user.companyName.toLowerCase().includes(term))
      );
    }
    
    return filtered;
  }, [users, filterStatus, searchTerm]);

  useEffect(() => {
    fetchUsers();
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
    <main className="user-management" role="main" aria-labelledby="user-management-title">
      {/* 컴팩트 헤더 */}
      <div className="page-header">
        <div className="header-content">
          <div className="title-section">
            <h1 id="user-management-title" className="page-title">
              사용자 관리
            </h1>
            <div className="quick-stats">
              <span className="stat-item">
                <span className="stat-value">{stats.total}</span>
                <span className="stat-text">전체</span>
              </span>
              <span className="stat-divider">|</span>
              <span className="stat-item pending">
                <span className="stat-value">{stats.pending}</span>
                <span className="stat-text">승인대기</span>
              </span>
              <span className="stat-divider">|</span>
              <span className="stat-item approved">
                <span className="stat-value">{stats.approved}</span>
                <span className="stat-text">활성</span>
              </span>
              {stats.rejected > 0 && (
                <>
                  <span className="stat-divider">|</span>
                  <span className="stat-item rejected">
                    <span className="stat-value">{stats.rejected}</span>
                    <span className="stat-text">거부</span>
                  </span>
                </>
              )}
            </div>
          </div>
          <button className="refresh-btn" onClick={fetchUsers} disabled={loading}>
            <span className="refresh-icon">🔄</span>
            새로고침
          </button>
        </div>
      </div>

      {/* 검색 및 필터 */}
      <div className="controls-bar">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="사용자명, 회사명으로 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          {searchTerm && (
            <button 
              className="clear-btn"
              onClick={() => setSearchTerm('')}
              aria-label="검색어 지우기"
            >
              ✕
            </button>
          )}
        </div>
        
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="filter-select"
        >
          <option value="all">전체 상태</option>
          <option value="pending">승인 대기 ({stats.pending})</option>
          <option value="approved">승인됨 ({stats.approved})</option>
          {stats.rejected > 0 && <option value="rejected">거부됨 ({stats.rejected})</option>}
        </select>
        
        {filteredUsers.length !== users.length && (
          <div className="results-count">
            {filteredUsers.length}개 결과
          </div>
        )}
      </div>

      {filteredUsers.length === 0 ? (
        <div className="empty-state">
          {users.length === 0 ? (
            <>
              <div className="empty-icon">👥</div>
              <h3>등록된 사용자가 없습니다</h3>
              <p>아직 시스템에 등록된 사용자가 없습니다.</p>
            </>
          ) : (
            <>
              <div className="empty-icon">🔍</div>
              <h3>검색 결과가 없습니다</h3>
              <p>조건에 맞는 사용자가 없습니다.</p>
              <button 
                className="clear-filters-btn"
                onClick={() => {
                  setSearchTerm('');
                  setFilterStatus('all');
                }}
              >
                필터 초기화
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="users-list">
          {filteredUsers.map((user) => {
            const statusInfo = getStatusInfo(user.status);
            const arnInfo = getArnValidationInfo(user.arnValidation);
            
            return (
              <div key={user.userId} className="user-card">
                {/* 메인 정보 행 */}
                <div className="card-header">
                  <div className="user-info">
                    <div className="username">{user.username}</div>
                    <div className="meta-section">
                      {user.companyName && <span className="company">{user.companyName}</span>}
                      <span className="join-date">가입: {formatDate(user.createdAt)}</span>
                    </div>
                  </div>
                  
                  <div className="status-section">
                    <div className={`status-pill ${statusInfo.className}`}>
                      {statusInfo.icon} {statusInfo.text}
                    </div>
                    <div className={`arn-pill ${arnInfo.className}`}>
                      {arnInfo.icon} ARN {arnInfo.text}
                    </div>
                  </div>
                </div>

                {/* ARN 정보 - 승인된 사용자만 표시 */}
                {(user.status === 'approved' || user.status === 'active') && (
                  <div className="card-body">
                    <div className="arn-section">
                      <span className="arn-label">AWS Role ARN</span>
                      <code className="arn-code">{user.roleArn}</code>
                      {user.arnValidation?.lastChecked && (
                        <div className="arn-meta">
                          마지막 검증: {formatDate(user.arnValidation.lastChecked)}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 액션 버튼 - 상태에 따른 최적화된 액션만 표시 */}
                <div className="card-actions">
                  <div className="action-group">
                    {/* 승인 대기 상태: 승인/거부 버튼 */}
                    {user.status === 'pending' && (
                      <>
                        <button
                          className="btn btn-approve"
                          onClick={() => handleStatusChange(user.userId, 'approved')}
                          disabled={actionLoading[`status-${user.userId}`]}
                        >
                          {actionLoading[`status-${user.userId}`] ? (
                            <span className="loading">승인 처리중...</span>
                          ) : (
                            <>✓ 승인</>
                          )}
                        </button>
                        <button
                          className="btn btn-reject"
                          onClick={() => handleStatusChange(user.userId, 'rejected')}
                          disabled={actionLoading[`status-${user.userId}`]}
                        >
                          {actionLoading[`status-${user.userId}`] ? (
                            <span className="loading">거부 처리중...</span>
                          ) : (
                            <>✕ 거부</>
                          )}
                        </button>
                      </>
                    )}
                    
                    {/* 승인된 상태: ARN 검증 + 거부 옵션 */}
                    {user.status === 'approved' && (
                      <>
                        <button
                          className="btn btn-validate"
                          onClick={() => handleArnValidation(user.userId)}
                          disabled={actionLoading[`arn-${user.userId}`]}
                        >
                          {actionLoading[`arn-${user.userId}`] ? (
                            <span className="loading">ARN 검증중...</span>
                          ) : (
                            <>🔐 ARN 검증</>
                          )}
                        </button>
                        <button
                          className="btn btn-reject btn-secondary"
                          onClick={() => handleStatusChange(user.userId, 'rejected')}
                          disabled={actionLoading[`status-${user.userId}`]}
                        >
                          {actionLoading[`status-${user.userId}`] ? (
                            <span className="loading">거부 처리중...</span>
                          ) : (
                            <>✕ 거부</>
                          )}
                        </button>
                      </>
                    )}
                    
                    {/* 거부된 상태: 재승인 옵션만 */}
                    {user.status === 'rejected' && (
                      <button
                        className="btn btn-approve"
                        onClick={() => handleStatusChange(user.userId, 'approved')}
                        disabled={actionLoading[`status-${user.userId}`]}
                      >
                        {actionLoading[`status-${user.userId}`] ? (
                          <span className="loading">재승인 처리중...</span>
                        ) : (
                          <>↻ 재승인</>
                        )}
                      </button>
                    )}
                    
                    {/* Active 상태: ARN 검증만 (상태 변경 불가) */}
                    {user.status === 'active' && (
                      <button
                        className="btn btn-validate"
                        onClick={() => handleArnValidation(user.userId)}
                        disabled={actionLoading[`arn-${user.userId}`]}
                      >
                        {actionLoading[`arn-${user.userId}`] ? (
                          <span className="loading">ARN 검증중...</span>
                        ) : (
                          <>🔐 ARN 재검증</>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* 에러 메시지 */}
                {(actionError[`status-${user.userId}`] || actionError[`arn-${user.userId}`]) && (
                  <div className="card-errors">
                    {actionError[`status-${user.userId}`] && (
                      <div className="error-alert">
                        ⚠️ {actionError[`status-${user.userId}`]}
                      </div>
                    )}
                    {actionError[`arn-${user.userId}`] && (
                      <div className="error-alert">
                        ⚠️ {actionError[`arn-${user.userId}`]}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      )}
    </main>
  );
};

export default UserList;