import { useState, useEffect } from 'react';
import { inspectionService } from '../services';
import { severityColors, severityIcons } from '../data/inspectionItems';
import './InspectionHistory.css';

const InspectionHistory = () => {
  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedInspection, setSelectedInspection] = useState(null);
  // 항목별 보기로 고정
  const [filters, setFilters] = useState({
    serviceType: 'all',
    status: 'all',
    startDate: '',
    endDate: '',
    historyMode: 'history' // 'latest' 또는 'history'
  });
  const [pagination, setPagination] = useState({
    hasMore: false,
    lastEvaluatedKey: null
  });

  // 클라이언트 사이드 필터링 (백엔드에서 처리되지 않은 추가 필터링)
  const applyClientSideFilters = (data) => {
    const filtered = data.filter(item => {
      // 상태 필터 (백엔드에서 PASS/FAIL로 처리되므로 프론트엔드에서 추가 매핑)
      if (filters.status !== 'all') {
        const mappedStatus = filters.status === 'COMPLETED' ? 'PASS' :
          filters.status === 'FAILED' ? 'FAIL' :
            filters.status;
        if (item.status !== mappedStatus) {
          return false;
        }
      }

      // 날짜 필터 (백엔드에서 처리되지만 클라이언트에서 추가 검증)
      if (filters.startDate || filters.endDate) {
        const itemDate = new Date(item.timestamp);

        if (filters.startDate) {
          const startDate = new Date(filters.startDate);
          startDate.setHours(0, 0, 0, 0);
          if (itemDate < startDate) {
            return false;
          }
        }

        if (filters.endDate) {
          const endDate = new Date(filters.endDate);
          endDate.setHours(23, 59, 59, 999);
          if (itemDate > endDate) {
            return false;
          }
        }
      }

      return true;
    });
    
    return filtered;
  };

  // 컴포넌트 마운트 시 히스토리 로드
  useEffect(() => {
    loadInspectionHistory();
  }, [filters]);



  // 실제 데이터를 검사 항목 단위로 그룹화
  const enrichItemData = (items) => {
    return items.map((item) => {
      // 위험도 계산 (가장 높은 위험도 사용)
      let highestRiskLevel = item.riskLevel || 'LOW';
      let highestRiskScore = item.score || 0;

      if (item.findings && item.findings.length > 0) {
        const riskLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
        item.findings.forEach(finding => {
          const findingRiskIndex = riskLevels.indexOf(finding.riskLevel);
          const currentRiskIndex = riskLevels.indexOf(highestRiskLevel);
          if (findingRiskIndex > currentRiskIndex) {
            highestRiskLevel = finding.riskLevel;
          }
          if (finding.riskScore > highestRiskScore) {
            highestRiskScore = finding.riskScore;
          }
        });
      }

      // 검사 요약 생성
      const findingsCount = item.findings ? item.findings.length : 0;
      const resourcesAffected = item.findings ?
        [...new Set(item.findings.map(f => f.resourceId))].length : 0;

      return {
        // 기본 정보
        inspectionId: item.lastInspectionId,
        serviceType: item.serviceType,
        itemId: item.itemId,

        // 검사 항목 정보
        inspectionTitle: item.itemName || `${item.serviceType} 보안 검사`,
        checkName: item.itemId?.toUpperCase().replace(/_/g, '-') || `${item.serviceType}-CHECK`,
        category: item.category === 'security' ? '보안 검사' : (item.category || '보안 검사'),

        // 위험도 정보
        riskLevel: highestRiskLevel,
        riskScore: highestRiskScore,

        // 검사 요약
        findingsCount: findingsCount,
        resourcesAffected: resourcesAffected,
        status: item.status,

        // 시간 정보
        timestamp: new Date(item.lastInspectionTime || Date.now()).toISOString(),

        // 원본 데이터 보존 (상세보기에서 사용)
        originalItem: item,
        findings: item.findings || [],
        recommendations: item.recommendations || []
      };
    });
  };

  // 검사 히스토리 로드
  const loadInspectionHistory = async (loadMore = false) => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        limit: 50,
        ...(filters.serviceType !== 'all' && { serviceType: filters.serviceType }),
        ...(filters.status !== 'all' && { status: filters.status }),
        historyMode: filters.historyMode
      };

      // 날짜 필터 적용
      if (filters.startDate) {
        params.startDate = new Date(filters.startDate).toISOString();
      }
      if (filters.endDate) {
        params.endDate = new Date(filters.endDate).toISOString();
      }

      // 항목별 검사 이력 조회
      const result = await inspectionService.getItemInspectionHistory(params);

      if (result.success) {
        let newData = result.data.items || [];
        
        // 실제 데이터를 표시용으로 변환
        newData = enrichItemData(newData);
        
        // 클라이언트 사이드 필터링 적용
        newData = applyClientSideFilters(newData);

        const finalData = loadMore ? [...prev, ...newData] : newData;
        setHistoryData(finalData);
        setPagination({
          hasMore: result.data.hasMore || false,
          lastEvaluatedKey: result.data.lastEvaluatedKey
        });
      } else {
        throw new Error(result.error?.message || '히스토리를 불러오는데 실패했습니다.');
      }
    } catch (error) {
      setError(`데이터를 불러오는데 실패했습니다: ${error.message}`);
      setHistoryData([]);
      setPagination({ hasMore: false, lastEvaluatedKey: null });
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



  // 항목 상세 보기 (항목별 보기용)
  const handleViewItemDetails = (item) => {
    console.log('🔍 [Frontend] Original item from backend:', item.originalItem);
    console.log('🔍 [Frontend] Original findings:', item.originalItem?.findings);
    
    // 검사 항목의 모든 findings를 포함한 상세 데이터 생성
    const inspectionData = {
      inspectionId: item.inspectionId,
      serviceType: item.serviceType,
      startTime: item.timestamp,
      endTime: item.timestamp,
      duration: 0,
      itemName: item.inspectionTitle,
      results: {
        summary: {
          totalResources: item.resourcesAffected,
          criticalIssues: item.findings.filter(f => f.riskLevel === 'CRITICAL').length,
          highRiskIssues: item.findings.filter(f => f.riskLevel === 'HIGH').length,
          mediumRiskIssues: item.findings.filter(f => f.riskLevel === 'MEDIUM').length,
          lowRiskIssues: item.findings.filter(f => f.riskLevel === 'LOW').length
        },
        findings: item.findings || [],
        recommendations: item.recommendations || []
      }
    };

    console.log('🔍 [Frontend] Created inspectionData:', inspectionData);
    setSelectedInspection(inspectionData);
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



  return (
    <div className="inspection-history">
      {/* 헤더 */}
      <div className="history-header">
        <div className="header-content">
          <h1>검사 히스토리</h1>
          <p>AWS 리소스 검사 항목별 결과를 확인할 수 있습니다</p>
        </div>
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
              <option value="PASS">✅ 정상</option>
              <option value="FAIL">❌ 문제 발견</option>
              <option value="PENDING">⏳ 진행중</option>
              <option value="CANCELLED">⏹️ 취소됨</option>
            </select>
          </div>

          <div className="filter-group">
            <label>보기 모드</label>
            <select
              value={filters.historyMode}
              onChange={(e) => handleFilterChange('historyMode', e.target.value)}
              className="history-mode-select"
            >
              <option value="history">📋 전체 히스토리</option>
              <option value="latest">🔄 최신 상태만</option>
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
                const resetFilters = {
                  serviceType: 'all',
                  status: 'all',
                  startDate: '',
                  endDate: ''
                };
                setFilters(resetFilters);
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
            📊 총 <strong>{historyData.length}</strong>개 검사 항목
            {filters.serviceType !== 'all' && (
              <span className="active-filter">• {filters.serviceType}</span>
            )}
            {filters.status !== 'all' && (
              <span className="active-filter">
                • {filters.status === 'PASS' ? '정상' :
                  filters.status === 'FAIL' ? '문제 발견' :
                    filters.status === 'PENDING' ? '진행중' :
                      filters.status}
              </span>
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
      <div className={`history-list ${loading ? 'loading' : ''}`}>
        {historyData.length === 0 && !loading ? (
          <div className="no-history">
            <p>검사 항목 히스토리가 없습니다.</p>
            <p style={{ fontSize: '14px', opacity: 0.7 }}>
              AWS 리소스 검사 결과를 확인할 수 있습니다.
            </p>
          </div>
        ) : (
          // 항목별 보기
          <>
            {historyData.map((item, index) => {
            const riskLevel = item.riskLevel || 'LOW';
            const riskColor = severityColors[riskLevel] || '#65a30d';

            return (
              <div 
                key={`${item.itemId}-${index}`} 
                className="history-item item-view" 
                data-risk={riskLevel}
                style={{ 
                  display: 'block', 
                  visibility: 'visible', 
                  opacity: 1,
                  minHeight: '100px',
                  backgroundColor: '#f0f0f0',
                  border: '2px solid red',
                  margin: '10px 0'
                }}
              >
                <div className="history-item-header">
                  <div className="item-info">
                    <div className="service-badge">
                      {item.serviceType}
                    </div>
                    <div className="resource-info">
                      <div className="resource-type-row">
                        <span className="resource-type-icon">
                          {item.serviceType === 'EC2' ? '🖥️' :
                            item.serviceType === 'S3' ? '🪣' :
                              item.serviceType === 'RDS' ? '🗄️' :
                                item.serviceType === 'IAM' ? '👤' : '🔧'}
                        </span>
                        <span className="resource-type">{item.inspectionTitle}</span>
                      </div>
                      <span className="resource-id">
                        {item.status === 'FAIL' ? '❌ 문제 발견' :
                          item.status === 'PASS' ? '✅ 정상' :
                            item.status === 'PENDING' ? '⏳ 진행중' :
                              item.status === 'NOT_CHECKED' ? '📋 검사 대상 없음' :
                                '❓ 알 수 없음'}
                      </span>
                    </div>
                  </div>

                  <div className="item-meta">
                    <div className="inspection-date">
                      {formatDateTime(item.timestamp)}
                    </div>
                    <div
                      className="risk-level-badge"
                      style={{ backgroundColor: riskColor }}
                    >
                      {severityIcons[riskLevel]} {riskLevel}
                    </div>
                  </div>
                </div>

                <div className="history-item-content">
                  <div className="item-summary">
                    {/* 검사 메타 태그 */}
                    <div className="inspection-meta-tags">
                      <span className="category-tag">
                        {item.category || '보안 검사'}
                      </span>
                      <span className="check-name-tag">
                        {item.checkName || `${item.serviceType}-CHECK`}
                      </span>
                    </div>

                    {/* 위험도 및 메타 정보 */}
                    <div className="item-meta-row">
                      <span className="risk-score-inline">
                        위험도 {item.riskScore || 50}/100
                      </span>
                      <span className="findings-count-inline">
                        문제 {item.findingsCount}개
                      </span>
                      <span className="resources-affected-inline">
                        리소스 {item.resourcesAffected}개
                      </span>
                    </div>


                  </div>

                  <div className="history-item-actions">
                    <button
                      className="view-details-button"
                      onClick={() => handleViewItemDetails(item)}
                    >
                      항목 상세보기
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          </>
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

              {selectedInspection.results?.findings && selectedInspection.results.findings.length > 0 ? (
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
              ) : (
                <div className="no-findings-section">
                  <h3>검사 결과</h3>
                  <div className="no-findings-message">
                    {selectedInspection.itemName?.includes('키 페어') || selectedInspection.itemName?.includes('메타데이터') ? (
                      <div className="info-message">
                        <div className="info-icon">📋</div>
                        <div className="info-content">
                          <p><strong>검사 대상이 없습니다</strong></p>
                          <p>현재 AWS 계정에 활성 상태의 EC2 인스턴스가 없어 이 항목을 검사할 수 없습니다.</p>
                          <p>EC2 인스턴스를 생성한 후 다시 검사해보세요.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="success-message">
                        <div className="success-icon">✅</div>
                        <div className="success-content">
                          <p><strong>문제가 발견되지 않았습니다</strong></p>
                          <p>이 검사 항목에서는 보안 문제나 개선이 필요한 사항이 발견되지 않았습니다.</p>
                        </div>
                      </div>
                    )}
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