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
      {/* 콤팩트 헤더 */}
      <div className="header-compact">
        <div className="header-left">
          <span className="header-icon-compact">📊</span>
          <h1>검사 히스토리</h1>
        </div>
        <div className="header-right">
          <span className="total-count">{historyData.length}개 기록</span>
        </div>
      </div>

      {/* 콤팩트 필터 */}
      <div className="filters-compact">
        <select
          value={filters.serviceType}
          onChange={(e) => handleFilterChange('serviceType', e.target.value)}
          className="filter-mini"
        >
          <option value="all">모든 서비스</option>
          <option value="EC2">🖥️ EC2</option>
          <option value="RDS">🗄️ RDS</option>
          <option value="S3">🪣 S3</option>
          <option value="IAM">👤 IAM</option>
        </select>

        <select
          value={filters.status}
          onChange={(e) => handleFilterChange('status', e.target.value)}
          className="filter-mini"
        >
          <option value="all">모든 상태</option>
          <option value="PASS">✅ 정상</option>
          <option value="FAIL">❌ 문제</option>
          <option value="PENDING">⏳ 진행중</option>
        </select>

        <input
          type="date"
          value={filters.startDate}
          onChange={(e) => handleDateChange('startDate', e.target.value)}
          className="date-mini"
          max={new Date().toISOString().split('T')[0]}
        />

        <input
          type="date"
          value={filters.endDate}
          onChange={(e) => handleDateChange('endDate', e.target.value)}
          className="date-mini"
          max={new Date().toISOString().split('T')[0]}
          min={filters.startDate}
        />

        <button
          className="btn-mini"
          onClick={() => loadInspectionHistory()}
          disabled={loading}
          title="새로고침"
        >
          {loading ? '⏳' : '🔄'}
        </button>

        <button
          className="btn-mini"
          onClick={() => {
            const resetFilters = {
              serviceType: 'all',
              status: 'all',
              startDate: '',
              endDate: '',
              historyMode: 'history'
            };
            setFilters(resetFilters);
            setPagination({ hasMore: false, lastEvaluatedKey: null });
          }}
          disabled={loading}
          title="초기화"
        >
          🗑️
        </button>
      </div>

      {/* 에러 표시 */}
      {error && (
        <div className="error-alert">
          <span className="error-icon">⚠️</span>
          <span className="error-message">{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* 콤팩트 히스토리 목록 */}
      <div className="history-content-compact">
        {historyData.length === 0 && !loading ? (
          <div className="empty-compact">
            <span className="empty-icon-mini">📊</span>
            <span>검사 기록이 없습니다</span>
            <button 
              className="start-btn-mini"
              onClick={() => window.location.href = '/inspection'}
            >
              검사 시작
            </button>
          </div>
        ) : (
          <div className="history-list-compact">
            {historyData.map((item, index) => {
              const riskLevel = item.riskLevel || 'LOW';
              const riskColor = severityColors[riskLevel] || '#65a30d';

              return (
                <div key={`${item.itemId}-${index}`} className={`history-row-compact ${riskLevel.toLowerCase()}`}>
                  {/* 서비스 + 검사명 */}
                  <div className="row-service">
                    <span className="service-icon-mini">
                      {item.serviceType === 'EC2' ? '🖥️' :
                        item.serviceType === 'S3' ? '🪣' :
                          item.serviceType === 'RDS' ? '🗄️' :
                            item.serviceType === 'IAM' ? '👤' : '🔧'}
                    </span>
                    <div className="service-info-mini">
                      <span className="inspection-title-mini">{item.inspectionTitle}</span>
                      <span className="service-name-mini">{item.serviceType}</span>
                    </div>
                  </div>

                  {/* 상태 */}
                  <div className="row-status">
                    <span className="status-icon-mini">
                      {item.status === 'FAIL' ? '❌' :
                        item.status === 'PASS' ? '✅' :
                          item.status === 'PENDING' ? '⏳' : '📋'}
                    </span>
                    <span className="status-text-mini">
                      {item.status === 'FAIL' ? '문제' :
                        item.status === 'PASS' ? '정상' :
                          item.status === 'PENDING' ? '진행중' : '대상없음'}
                    </span>
                  </div>

                  {/* 핵심 메트릭 */}
                  <div className="row-metrics">
                    <span className="metric-mini">
                      <strong>{item.findingsCount}</strong> 문제
                    </span>
                    <span className="metric-mini">
                      <strong>{item.resourcesAffected}</strong> 리소스
                    </span>
                  </div>

                  {/* 위험도 + 시간 */}
                  <div className="row-risk">
                    <div className="risk-badge-mini" style={{ backgroundColor: riskColor }}>
                      {severityIcons[riskLevel]} {riskLevel}
                    </div>
                    <span className="time-mini">{formatDateTime(item.timestamp).split(' ')[0]}</span>
                  </div>

                  {/* 상세보기 */}
                  <div className="row-action">
                    <button
                      className="details-btn-mini"
                      onClick={() => handleViewItemDetails(item)}
                      title="상세보기"
                    >
                      📋
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 더 보기 버튼 */}
        {pagination.hasMore && (
          <div className="load-more-modern">
            <button
              className="load-more-btn-modern"
              onClick={loadMore}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="loading-spinner-modern"></span>
                  로딩 중...
                </>
              ) : (
                <>
                  <span className="load-icon-modern">📄</span>
                  더 많은 기록 보기
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* 개선된 상세 모달 */}
      {selectedInspection && (
        <div className="modal-overlay-modern" onClick={() => setSelectedInspection(null)}>
          <div className="modal-container-modern" onClick={(e) => e.stopPropagation()}>
            {/* 모달 헤더 */}
            <div className="modal-header-modern">
              <div className="modal-title-section">
                <div className="modal-service-icon">
                  {selectedInspection.serviceType === 'EC2' ? '🖥️' :
                    selectedInspection.serviceType === 'S3' ? '🪣' :
                      selectedInspection.serviceType === 'RDS' ? '🗄️' :
                        selectedInspection.serviceType === 'IAM' ? '👤' : '🔧'}
                </div>
                <div className="modal-title-text">
                  <h2>{selectedInspection.itemName || '검사 상세 정보'}</h2>
                  <span className="modal-service-name">{selectedInspection.serviceType} 검사</span>
                </div>
              </div>
              <button
                className="modal-close-modern"
                onClick={() => setSelectedInspection(null)}
                aria-label="모달 닫기"
              >
                ✕
              </button>
            </div>

            {/* 모달 콘텐츠 */}
            <div className="modal-content-modern">
              {/* 검사 요약 카드 */}
              <div className="inspection-summary-card">
                <div className="summary-header">
                  <h3>📊 검사 요약</h3>
                  <div className="inspection-id">ID: {selectedInspection.inspectionId}</div>
                </div>
                
                <div className="summary-stats">
                  <div className="stat-item-large">
                    <span className="stat-icon">🔍</span>
                    <div className="stat-content">
                      <span className="stat-value">{selectedInspection.results?.summary?.totalResources || 0}</span>
                      <span className="stat-label">검사된 리소스</span>
                    </div>
                  </div>
                  
                  <div className="stat-item-large critical">
                    <span className="stat-icon">🚨</span>
                    <div className="stat-content">
                      <span className="stat-value">{selectedInspection.results?.summary?.criticalIssues || 0}</span>
                      <span className="stat-label">심각한 문제</span>
                    </div>
                  </div>
                  
                  <div className="stat-item-large high">
                    <span className="stat-icon">⚠️</span>
                    <div className="stat-content">
                      <span className="stat-value">{selectedInspection.results?.summary?.highRiskIssues || 0}</span>
                      <span className="stat-label">높은 위험</span>
                    </div>
                  </div>
                  
                  <div className="stat-item-large medium">
                    <span className="stat-icon">⚡</span>
                    <div className="stat-content">
                      <span className="stat-value">{selectedInspection.results?.summary?.mediumRiskIssues || 0}</span>
                      <span className="stat-label">중간 위험</span>
                    </div>
                  </div>
                  
                  <div className="stat-item-large low">
                    <span className="stat-icon">ℹ️</span>
                    <div className="stat-content">
                      <span className="stat-value">{selectedInspection.results?.summary?.lowRiskIssues || 0}</span>
                      <span className="stat-label">낮은 위험</span>
                    </div>
                  </div>
                </div>

                <div className="inspection-metadata">
                  <div className="metadata-item">
                    <span className="metadata-label">🕐 검사 시간</span>
                    <span className="metadata-value">{formatDateTime(selectedInspection.startTime)}</span>
                  </div>
                  {selectedInspection.duration && (
                    <div className="metadata-item">
                      <span className="metadata-label">⏱️ 소요 시간</span>
                      <span className="metadata-value">{Math.round(selectedInspection.duration / 1000)}초</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 검사 결과 섹션 */}
              {selectedInspection.results?.findings && selectedInspection.results.findings.length > 0 ? (
                <div className="findings-section-modern">
                  <div className="section-header-modern">
                    <h3>🔍 발견된 문제</h3>
                    <span className="findings-count">{selectedInspection.results.findings.length}개 문제</span>
                  </div>
                  
                  <div className="findings-grid-modern">
                    {selectedInspection.results.findings.map((finding, index) => (
                      <div key={index} className="finding-card-modern">
                        <div className="finding-card-header">
                          <div className="severity-indicator" style={{ backgroundColor: severityColors[finding.riskLevel] }}>
                            <span className="severity-icon">{severityIcons[finding.riskLevel]}</span>
                            <span className="severity-text">{finding.riskLevel}</span>
                          </div>
                          {finding.riskScore && (
                            <div className="risk-score-badge">
                              {finding.riskScore}/100
                            </div>
                          )}
                        </div>
                        
                        <div className="finding-card-content">
                          <div className="resource-info-modern">
                            <span className="resource-type">{finding.resourceType}</span>
                            <span className="resource-id">{finding.resourceId}</span>
                          </div>
                          
                          <div className="issue-description">
                            <div className="issue-title">
                              <span className="issue-icon">🚨</span>
                              <strong>문제</strong>
                            </div>
                            <p>{finding.issue}</p>
                          </div>
                          
                          {finding.recommendation && (
                            <div className="recommendation-description">
                              <div className="recommendation-title">
                                <span className="recommendation-icon">💡</span>
                                <strong>권장사항</strong>
                              </div>
                              <p>{finding.recommendation}</p>
                            </div>
                          )}
                          
                          {finding.timestamp && (
                            <div className="finding-timestamp-modern">
                              <span className="timestamp-icon">🕐</span>
                              <span>{formatDateTime(finding.timestamp)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="no-findings-modern">
                  <div className="no-findings-content">
                    {selectedInspection.itemName?.includes('키 페어') || selectedInspection.itemName?.includes('메타데이터') ? (
                      <>
                        <div className="no-findings-icon">📋</div>
                        <h3>검사 대상이 없습니다</h3>
                        <p>현재 AWS 계정에 활성 상태의 리소스가 없어 이 항목을 검사할 수 없습니다.</p>
                        <p>관련 리소스를 생성한 후 다시 검사해보세요.</p>
                      </>
                    ) : (
                      <>
                        <div className="no-findings-icon success">✅</div>
                        <h3>문제가 발견되지 않았습니다</h3>
                        <p>이 검사 항목에서는 보안 문제나 개선이 필요한 사항이 발견되지 않았습니다.</p>
                        <p>현재 설정이 AWS 보안 모범 사례를 준수하고 있습니다.</p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* 권장사항 섹션 */}
              {selectedInspection.results?.recommendations && selectedInspection.results.recommendations.length > 0 && (
                <div className="recommendations-section-modern">
                  <div className="section-header-modern">
                    <h3>🎯 추가 권장사항</h3>
                  </div>
                  
                  <div className="recommendations-grid-modern">
                    {selectedInspection.results.recommendations.map((recommendation, index) => (
                      <div key={index} className="recommendation-card-modern">
                        <div className="recommendation-icon-modern">💡</div>
                        <div className="recommendation-text-modern">{recommendation}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 모달 푸터 */}
            <div className="modal-footer-modern">
              <button
                className="modal-close-btn-modern"
                onClick={() => setSelectedInspection(null)}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InspectionHistory;