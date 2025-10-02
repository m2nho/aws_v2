import React, { useState, useEffect } from 'react';
import { inspectionService } from '../services';
import { severityColors, severityIcons } from '../data/inspectionItems';
import './InspectionHistory.css';

const InspectionHistory = () => {
  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedInspection, setSelectedInspection] = useState(null);
  const [filters, setFilters] = useState({
    serviceType: 'all',
    status: 'all',
    startDate: '',
    endDate: ''
  });
  const [pagination, setPagination] = useState({
    hasMore: false,
    lastEvaluatedKey: null
  });

  // 컴포넌트 마운트 시 히스토리 로드
  useEffect(() => {
    loadInspectionHistory();
  }, [filters]);

  // 검사 히스토리 로드
  const loadInspectionHistory = async (loadMore = false) => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        limit: 20,
        ...(filters.serviceType !== 'all' && { serviceType: filters.serviceType }),
        ...(loadMore && pagination.lastEvaluatedKey && { lastEvaluatedKey: pagination.lastEvaluatedKey })
      };

      // 날짜 필터 적용
      if (filters.startDate) {
        params.startDate = new Date(filters.startDate).toISOString();
      }
      if (filters.endDate) {
        params.endDate = new Date(filters.endDate).toISOString();
      }

      const result = await inspectionService.getInspectionHistory(params);

      if (result.success) {
        let newData = result.data.inspections || [];
        
        // 클라이언트 사이드 필터링
        newData = applyClientSideFilters(newData);
        
        setHistoryData(prev => loadMore ? [...prev, ...newData] : newData);
        setPagination({
          hasMore: result.data.hasMore || false,
          lastEvaluatedKey: result.data.lastEvaluatedKey
        });
      } else {
        throw new Error(result.error?.message || '히스토리를 불러오는데 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to load inspection history:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // 더 많은 데이터 로드
  const loadMore = () => {
    if (pagination.hasMore && !loading) {
      loadInspectionHistory(true);
    }
  };

  // 클라이언트 사이드 필터링
  const applyClientSideFilters = (data) => {
    return data.filter(inspection => {
      const inspectionDate = new Date(inspection.startTime);
      
      // 상태 필터
      if (filters.status !== 'all' && inspection.status !== filters.status) {
        return false;
      }
      
      // 날짜 범위 필터
      if (filters.startDate || filters.endDate) {
        const inspectionDateOnly = new Date(inspectionDate);
        inspectionDateOnly.setHours(0, 0, 0, 0);
        
        if (filters.startDate) {
          const startDate = new Date(filters.startDate);
          startDate.setHours(0, 0, 0, 0);
          
          if (inspectionDateOnly < startDate) {
            return false;
          }
        }
        
        if (filters.endDate) {
          const endDate = new Date(filters.endDate);
          endDate.setHours(23, 59, 59, 999);
          
          if (inspectionDateOnly > endDate) {
            return false;
          }
        }
      }
      

      
      return true;
    });
  };

  // 필터 변경 핸들러
  const handleFilterChange = (filterType, value) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
    setPagination({ hasMore: false, lastEvaluatedKey: null });
  };

  // 날짜 변경 핸들러
  const handleDateChange = (dateType, value) => {
    setFilters(prev => ({
      ...prev,
      [dateType]: value
    }));
    setPagination({ hasMore: false, lastEvaluatedKey: null });
  };

  // 검사 상세 보기
  const handleViewDetails = async (inspectionId) => {
    try {
      setLoading(true);
      const result = await inspectionService.getInspectionDetails(inspectionId);
      
      if (result.success) {
        console.log('=== INSPECTION DETAILS RECEIVED ===');
        console.log('Full result:', result);
        console.log('Result data:', result.data);
        console.log('Has results field in result.data:', 'results' in result.data);
        console.log('Has results field in result.data.data:', result.data && result.data.data && 'results' in result.data.data);
        
        // 실제 검사 데이터는 result.data.data에 있음
        const inspectionData = result.data.data || result.data;
        console.log('Inspection data keys:', Object.keys(inspectionData));
        console.log('Has results field in inspection data:', 'results' in inspectionData);
        
        if (inspectionData.results) {
          console.log('Results structure:', Object.keys(inspectionData.results));
          console.log('Findings count:', inspectionData.results.findings?.length || 0);
        }
        setSelectedInspection(inspectionData);
      } else {
        throw new Error(result.error?.message || '상세 정보를 불러오는데 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to load inspection details:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // 시간 포맷팅
  const formatDateTime = (timestamp) => {
    return new Date(timestamp).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 검사 상태 표시
  const getStatusDisplay = (status) => {
    const statusMap = {
      'COMPLETED': { text: '완료', color: '#10b981', icon: '✅' },
      'FAILED': { text: '실패', color: '#ef4444', icon: '❌' },
      'PENDING': { text: '진행중', color: '#f59e0b', icon: '⏳' },
      'CANCELLED': { text: '취소됨', color: '#6b7280', icon: '⏹️' }
    };
    return statusMap[status] || { text: status, color: '#6b7280', icon: '❓' };
  };

  // 위험도 요약 표시
  const getRiskSummary = (results) => {
    if (!results || !results.summary) return null;
    
    const { criticalIssues = 0, highRiskIssues = 0, mediumRiskIssues = 0, lowRiskIssues = 0 } = results.summary;
    const total = criticalIssues + highRiskIssues + mediumRiskIssues + lowRiskIssues;
    
    if (total === 0) return { text: '문제 없음', color: '#10b981' };
    
    if (criticalIssues > 0) return { text: `심각 ${criticalIssues}개`, color: '#dc2626' };
    if (highRiskIssues > 0) return { text: `높음 ${highRiskIssues}개`, color: '#ea580c' };
    if (mediumRiskIssues > 0) return { text: `중간 ${mediumRiskIssues}개`, color: '#d97706' };
    return { text: `낮음 ${lowRiskIssues}개`, color: '#65a30d' };
  };

  return (
    <div className="inspection-history">
      {/* 헤더 */}
      <div className="history-header">
        <h1>검사 히스토리</h1>
        <p>이전에 수행된 모든 AWS 리소스 검사 기록을 확인할 수 있습니다</p>
      </div>

      {/* 필터 */}
      <div className="history-filters">
        <div className="filter-main-row">
          <div className="filter-group">
            <label>서비스</label>
            <select 
              value={filters.serviceType} 
              onChange={(e) => handleFilterChange('serviceType', e.target.value)}
              className="service-select"
            >
              <option value="all">전체 서비스</option>
              <option value="EC2">🖥️ EC2</option>
              <option value="RDS">🗄️ RDS</option>
              <option value="S3">🪣 S3</option>
              <option value="IAM">👤 IAM</option>
              <option value="VPC">🌐 VPC</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>상태</label>
            <select 
              value={filters.status} 
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="status-select"
            >
              <option value="all">전체 상태</option>
              <option value="COMPLETED">✅ 완료</option>
              <option value="FAILED">❌ 실패</option>
              <option value="PENDING">⏳ 진행중</option>
              <option value="CANCELLED">⏹️ 취소됨</option>
            </select>
          </div>
          
          <div className="date-range-picker">
            <div className="date-input-group">
              <label>📅 시작일</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => handleDateChange('startDate', e.target.value)}
                className="date-input"
                max={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div className="date-separator">~</div>
            <div className="date-input-group">
              <label>📅 종료일</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => handleDateChange('endDate', e.target.value)}
                className="date-input"
                max={new Date().toISOString().split('T')[0]}
                min={filters.startDate}
              />
            </div>
          </div>

          <div className="filter-actions">
            <button 
              className="refresh-button"
              onClick={() => loadInspectionHistory()}
              disabled={loading}
              title="검사 기록 새로고침"
            >
              {loading ? '⏳' : '🔄'}
            </button>
            
            <button 
              className="reset-filters-button"
              onClick={() => {
                setFilters({
                  serviceType: 'all',
                  status: 'all',
                  startDate: '',
                  endDate: ''
                });
                setPagination({ hasMore: false, lastEvaluatedKey: null });
              }}
              disabled={loading}
              title="모든 필터 초기화"
            >
              🗑️
            </button>
          </div>
        </div>

        {/* 결과 통계 */}
        <div className="filter-stats-row">
          <div className="filter-stats">
            📊 총 <strong>{historyData.length}</strong>개 검사 기록
            {filters.serviceType !== 'all' && (
              <span className="active-filter">• {filters.serviceType}</span>
            )}
            {filters.status !== 'all' && (
              <span className="active-filter">• {filters.status}</span>
            )}
            {(filters.startDate || filters.endDate) && (
              <span className="active-filter">
                • 날짜 필터 적용
                {filters.startDate && ` (${filters.startDate}부터)`}
                {filters.endDate && ` (${filters.endDate}까지)`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 에러 표시 */}
      {error && (
        <div className="error-alert">
          <span className="error-icon">⚠️</span>
          <span className="error-message">{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* 히스토리 목록 */}
      <div className="history-list">
        {historyData.length === 0 && !loading ? (
          <div className="no-history">
            <p>검사 히스토리가 없습니다.</p>
          </div>
        ) : (
          historyData.map((inspection) => {
            const statusDisplay = getStatusDisplay(inspection.status);
            const riskSummary = getRiskSummary(inspection.results);
            
            return (
              <div key={inspection.inspectionId} className="history-item">
                <div className="history-item-header">
                  <div className="inspection-info">
                    <div className="service-badge">
                      {inspection.serviceType}
                    </div>
                    <div className="inspection-id">
                      ID: {inspection.inspectionId}
                    </div>
                  </div>
                  
                  <div className="inspection-meta">
                    <div className="inspection-date">
                      {formatDateTime(inspection.startTime)}
                    </div>
                    <div 
                      className="inspection-status"
                      style={{ color: statusDisplay.color }}
                    >
                      {statusDisplay.icon} {statusDisplay.text}
                    </div>
                  </div>
                </div>

                <div className="history-item-content">
                  <div className="inspection-summary">
                    {inspection.duration && (
                      <div className="duration">
                        소요시간: {Math.round(inspection.duration / 1000)}초
                      </div>
                    )}
                    
                    {riskSummary && (
                      <div 
                        className="risk-summary"
                        style={{ color: riskSummary.color }}
                      >
                        {riskSummary.text}
                      </div>
                    )}
                    
                    {inspection.results?.summary?.totalResources && (
                      <div className="resources-count">
                        검사된 리소스: {inspection.results.summary.totalResources}개
                      </div>
                    )}
                  </div>

                  <div className="history-item-actions">
                    <button
                      className="view-details-button"
                      onClick={() => handleViewDetails(inspection.inspectionId)}
                    >
                      상세 보기
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* 더 보기 버튼 */}
        {pagination.hasMore && (
          <div className="load-more">
            <button 
              className="load-more-button"
              onClick={loadMore}
              disabled={loading}
            >
              {loading ? '로딩 중...' : '더 보기'}
            </button>
          </div>
        )}
      </div>

      {/* 상세 모달 */}
      {selectedInspection && (
        <div className="detail-modal-overlay" onClick={() => setSelectedInspection(null)}>
          <div className="detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>검사 상세 정보</h2>
              <button 
                className="modal-close"
                onClick={() => setSelectedInspection(null)}
              >
                ✕
              </button>
            </div>
            
            <div className="modal-content">
              <div className="inspection-details">
                <div className="detail-row">
                  <strong>검사 ID:</strong> {selectedInspection.inspectionId}
                </div>
                <div className="detail-row">
                  <strong>서비스:</strong> {selectedInspection.serviceType}
                </div>
                <div className="detail-row">
                  <strong>시작 시간:</strong> {formatDateTime(selectedInspection.startTime)}
                </div>
                {selectedInspection.endTime && (
                  <div className="detail-row">
                    <strong>완료 시간:</strong> {formatDateTime(selectedInspection.endTime)}
                  </div>
                )}
                {selectedInspection.duration && (
                  <div className="detail-row">
                    <strong>소요 시간:</strong> {Math.round(selectedInspection.duration / 1000)}초
                  </div>
                )}
              </div>

              {selectedInspection.results && (
                <div className="results-summary">
                  <h3>검사 결과 요약</h3>
                  <div className="summary-grid">
                    <div className="summary-item">
                      <span className="label">총 리소스:</span>
                      <span className="value">{selectedInspection.results.summary?.totalResources || 0}</span>
                    </div>
                    <div className="summary-item critical">
                      <span className="label">심각:</span>
                      <span className="value">{selectedInspection.results.summary?.criticalIssues || 0}</span>
                    </div>
                    <div className="summary-item high">
                      <span className="label">높음:</span>
                      <span className="value">{selectedInspection.results.summary?.highRiskIssues || 0}</span>
                    </div>
                    <div className="summary-item medium">
                      <span className="label">중간:</span>
                      <span className="value">{selectedInspection.results.summary?.mediumRiskIssues || 0}</span>
                    </div>
                    <div className="summary-item low">
                      <span className="label">낮음:</span>
                      <span className="value">{selectedInspection.results.summary?.lowRiskIssues || 0}</span>
                    </div>
                  </div>
                </div>
              )}

              {selectedInspection.results?.findings && selectedInspection.results.findings.length > 0 && (
                <div className="findings-section">
                  <h3>발견된 문제들</h3>
                  <div className="findings-list">
                    {selectedInspection.results.findings.map((finding, index) => (
                      <div key={index} className="finding-item">
                        <div className="finding-header">
                          <span 
                            className="severity-badge"
                            style={{ backgroundColor: severityColors[finding.riskLevel] }}
                          >
                            {severityIcons[finding.riskLevel]} {finding.riskLevel}
                          </span>
                          <span className="resource-info">
                            {finding.resourceType}: {finding.resourceId}
                          </span>
                          {finding.riskScore && (
                            <span className="risk-score">
                              위험도: {finding.riskScore}/100
                            </span>
                          )}
                        </div>
                        <div className="finding-content">
                          <div className="finding-issue">
                            <strong>🚨 문제:</strong> {finding.issue}
                          </div>
                          {finding.recommendation && (
                            <div className="finding-recommendation">
                              <strong>💡 권장사항:</strong> {finding.recommendation}
                            </div>
                          )}
                          {finding.category && (
                            <div className="finding-category">
                              <strong>📂 카테고리:</strong> {finding.category}
                            </div>
                          )}
                          {finding.timestamp && (
                            <div className="finding-timestamp">
                              <strong>🕐 발견 시간:</strong> {formatDateTime(finding.timestamp)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                  </div>
                </div>
              )}

              {selectedInspection.results?.recommendations && selectedInspection.results.recommendations.length > 0 && (
                <div className="recommendations-section">
                  <h3>🎯 주요 권장사항</h3>
                  <div className="recommendations-list">
                    {selectedInspection.results.recommendations.map((recommendation, index) => (
                      <div key={index} className="recommendation-item">
                        <div className="recommendation-icon">💡</div>
                        <div className="recommendation-text">{recommendation}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InspectionHistory;