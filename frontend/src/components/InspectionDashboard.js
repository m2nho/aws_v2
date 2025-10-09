import React, { useState, useEffect, useMemo } from 'react';
import { inspectionService } from '../services';
import './InspectionDashboard.css';

/**
 * InspectionDashboard Component
 * 검사 결과 요약 표시 및 위험도별 분류 시각화 컴포넌트
 * Requirements: 2.3, 2.4
 */
const InspectionDashboard = ({ inspectionId, onClose }) => {
  // State management
  const [inspectionData, setInspectionData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRiskLevel, setSelectedRiskLevel] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [expandedFindings, setExpandedFindings] = useState(new Set());

  // Load inspection details
  useEffect(() => {
    const loadInspectionData = async () => {
      if (!inspectionId) {
        setError('검사 ID가 제공되지 않았습니다.');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        console.log('Loading inspection data for ID:', inspectionId);
        const result = await inspectionService.getInspectionDetails(inspectionId);
        console.log('Inspection details result:', result);
        console.log('Inspection details data structure:', JSON.stringify(result.data, null, 2));
        
        if (result.success && result.data) {
          console.log('Setting inspection data:', result.data);
          console.log('Has results field:', !!result.data.results);
          console.log('Results structure:', result.data.results);
          setInspectionData(result.data);
        } else {
          console.error('Failed to load inspection details:', result);
          throw new Error(result.error?.message || '검사 결과를 불러오는데 실패했습니다.');
        }
      } catch (error) {
        console.error('Error loading inspection data:', error);
        setError(error.message || '검사 결과를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    loadInspectionData();
  }, [inspectionId]);

  // Memoized computed values
  const filteredFindings = useMemo(() => {
    if (!inspectionData?.results?.findings) return [];

    let findings = inspectionData.results.findings;

    // Risk level filter
    if (selectedRiskLevel !== 'ALL') {
      findings = findings.filter(finding => finding.riskLevel === selectedRiskLevel);
    }

    // Category filter
    if (selectedCategory !== 'ALL') {
      findings = findings.filter(finding => finding.category === selectedCategory);
    }

    return findings;
  }, [inspectionData, selectedRiskLevel, selectedCategory]);

  const riskLevelCounts = useMemo(() => {
    if (!inspectionData?.results?.findings) return {};

    return inspectionData.results.findings.reduce((counts, finding) => {
      counts[finding.riskLevel] = (counts[finding.riskLevel] || 0) + 1;
      return counts;
    }, {});
  }, [inspectionData]);

  const categoryCounts = useMemo(() => {
    if (!inspectionData?.results?.findings) return {};

    return inspectionData.results.findings.reduce((counts, finding) => {
      counts[finding.category] = (counts[finding.category] || 0) + 1;
      return counts;
    }, {});
  }, [inspectionData]);

  // Event handlers
  const handleFindingToggle = (findingIndex) => {
    const newExpanded = new Set(expandedFindings);
    if (newExpanded.has(findingIndex)) {
      newExpanded.delete(findingIndex);
    } else {
      newExpanded.add(findingIndex);
    }
    setExpandedFindings(newExpanded);
  };

  const getRiskLevelColor = (riskLevel) => {
    const colors = {
      'CRITICAL': '#dc2626',
      'HIGH': '#ea580c',
      'MEDIUM': '#d97706',
      'LOW': '#16a34a'
    };
    return colors[riskLevel] || '#6b7280';
  };

  const getCategoryColor = (category) => {
    const colors = {
      'SECURITY': '#dc2626',
      'PERFORMANCE': '#d97706',
      'COST': '#16a34a',
      'RELIABILITY': '#2563eb',
      'COMPLIANCE': '#7c3aed'
    };
    return colors[category] || '#6b7280';
  };

  const formatDuration = (duration) => {
    if (!duration) return 'N/A';
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    return `${minutes}분 ${seconds}초`;
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString('ko-KR');
  };

  if (isLoading) {
    return (
      <div className="inspection-dashboard">
        <div className="dashboard-loading">
          <div className="loading-spinner" aria-label="검사 결과 로딩 중"></div>
          <p>검사 결과를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="inspection-dashboard">
        <div className="dashboard-error">
          <div className="error-icon">⚠️</div>
          <h3>오류가 발생했습니다</h3>
          <p>{error}</p>
          <button className="retry-button" onClick={() => window.location.reload()}>
            다시 시도
          </button>
          {onClose && (
            <button className="close-button" onClick={onClose}>
              닫기
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!inspectionData) {
    return (
      <div className="inspection-dashboard">
        <div className="dashboard-error">
          <div className="error-icon">📋</div>
          <h3>검사 결과를 찾을 수 없습니다</h3>
          <p>요청하신 검사 결과가 존재하지 않습니다.</p>
          {onClose && (
            <button className="close-button" onClick={onClose}>
              닫기
            </button>
          )}
        </div>
      </div>
    );
  }

  const { results, serviceType, startTime, endTime, duration } = inspectionData;
  const { summary, findings = [] } = results || {};

  return (
    <div className="inspection-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <h2>검사 결과 대시보드</h2>
        <div className="inspection-meta">
          <span className="service-type">{serviceType} 검사</span>
          <span className="inspection-time">
            {formatTimestamp(startTime)} ~ {formatTimestamp(endTime)}
          </span>
          <span className="duration">소요시간: {formatDuration(duration)}</span>
        </div>
        {onClose && (
          <button className="close-dashboard-button" onClick={onClose} aria-label="대시보드 닫기">
            ✕
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="summary-section">
        <h3>검사 요약</h3>
        <div className="summary-grid">
          <div className="summary-card total">
            <div className="card-icon">📊</div>
            <div className="card-content">
              <div className="card-value">{summary?.totalResources || 0}</div>
              <div className="card-label">검사된 리소스</div>
            </div>
          </div>
          
          <div className="summary-card critical">
            <div className="card-icon">🚨</div>
            <div className="card-content">
              <div className="card-value">{riskLevelCounts.CRITICAL || 0}</div>
              <div className="card-label">심각한 위험</div>
            </div>
          </div>
          
          <div className="summary-card high">
            <div className="card-icon">⚠️</div>
            <div className="card-content">
              <div className="card-value">{riskLevelCounts.HIGH || 0}</div>
              <div className="card-label">높은 위험</div>
            </div>
          </div>
          
          <div className="summary-card medium">
            <div className="card-icon">⚡</div>
            <div className="card-content">
              <div className="card-value">{riskLevelCounts.MEDIUM || 0}</div>
              <div className="card-label">중간 위험</div>
            </div>
          </div>
          
          <div className="summary-card low">
            <div className="card-icon">✅</div>
            <div className="card-content">
              <div className="card-value">{riskLevelCounts.LOW || 0}</div>
              <div className="card-label">낮은 위험</div>
            </div>
          </div>
          
          <div className="summary-card score">
            <div className="card-icon">🎯</div>
            <div className="card-content">
              <div className="card-value">{summary?.overallScore || summary?.score || 0}</div>
              <div className="card-label">전체 점수</div>
            </div>
          </div>
        </div>
      </div>

      {/* Risk Level Visualization */}
      <div className="visualization-section">
        <h3>위험도별 분포</h3>
        <div className="risk-chart">
          {Object.entries(riskLevelCounts).map(([level, count]) => {
            const total = findings.length;
            const percentage = total > 0 ? (count / total) * 100 : 0;
            
            return (
              <div key={level} className="risk-bar-container">
                <div className="risk-bar-label">
                  <span className="risk-level">{level}</span>
                  <span className="risk-count">{count}개 ({percentage.toFixed(1)}%)</span>
                </div>
                <div className="risk-bar-track">
                  <div 
                    className="risk-bar-fill"
                    style={{ 
                      width: `${percentage}%`,
                      backgroundColor: getRiskLevelColor(level)
                    }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="filters-section">
        <h3>필터</h3>
        <div className="filters-container">
          <div className="filter-group">
            <label htmlFor="risk-filter">위험도</label>
            <select 
              id="risk-filter"
              value={selectedRiskLevel} 
              onChange={(e) => setSelectedRiskLevel(e.target.value)}
              className="filter-select"
            >
              <option value="ALL">전체</option>
              <option value="CRITICAL">심각한 위험</option>
              <option value="HIGH">높은 위험</option>
              <option value="MEDIUM">중간 위험</option>
              <option value="LOW">낮은 위험</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label htmlFor="category-filter">카테고리</label>
            <select 
              id="category-filter"
              value={selectedCategory} 
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="filter-select"
            >
              <option value="ALL">전체</option>
              {Object.keys(categoryCounts).map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          
          <div className="filter-stats">
            <span>{filteredFindings.length}개 항목 표시 중</span>
          </div>
        </div>
      </div>

      {/* Findings List */}
      <div className="findings-section">
        <h3>상세 검사 결과</h3>
        {filteredFindings.length === 0 ? (
          <div className="no-findings">
            <div className="no-findings-icon">🎉</div>
            <h4>해당 조건의 문제가 발견되지 않았습니다</h4>
            <p>선택한 필터 조건에 맞는 검사 결과가 없습니다.</p>
          </div>
        ) : (
          <div className="findings-list">
            {filteredFindings.map((finding, index) => (
              <div key={index} className={`finding-card ${finding.riskLevel.toLowerCase()}`}>
                <div className="finding-header" onClick={() => handleFindingToggle(index)}>
                  <div className="finding-title">
                    <div 
                      className="risk-indicator"
                      style={{ backgroundColor: getRiskLevelColor(finding.riskLevel) }}
                    ></div>
                    <div className="finding-info">
                      <h4>{finding.issue}</h4>
                      <div className="finding-meta">
                        <span className="resource-type">{finding.resourceType}</span>
                        <span className="resource-id">{finding.resourceId}</span>
                        <span 
                          className="category-badge"
                          style={{ backgroundColor: getCategoryColor(finding.category) }}
                        >
                          {finding.category}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="finding-actions">
                    <span className="risk-level-badge" style={{ color: getRiskLevelColor(finding.riskLevel) }}>
                      {finding.riskLevel}
                    </span>
                    <button 
                      className="expand-button"
                      aria-label={expandedFindings.has(index) ? '접기' : '펼치기'}
                    >
                      {expandedFindings.has(index) ? '▲' : '▼'}
                    </button>
                  </div>
                </div>
                
                {expandedFindings.has(index) && (
                  <div className="finding-details">
                    <div className="recommendation-section">
                      <h5>권장사항</h5>
                      <p>{finding.recommendation}</p>
                    </div>
                    
                    {finding.details && Object.keys(finding.details).length > 0 && (
                      <div className="details-section">
                        <h5>상세 정보</h5>
                        <div className="details-grid">
                          {Object.entries(finding.details).map(([key, value]) => (
                            <div key={key} className="detail-item">
                              <span className="detail-key">{key}:</span>
                              <span className="detail-value">
                                {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recommendations Summary */}
      {findings.length > 0 && (
        <div className="recommendations-section">
          <h3>주요 권장사항</h3>
          <div className="recommendations-list">
            {findings
              .filter(finding => finding.riskLevel === 'CRITICAL' || finding.riskLevel === 'HIGH')
              .slice(0, 5)
              .map((finding, index) => (
                <div key={index} className="recommendation-item">
                  <div 
                    className="recommendation-priority"
                    style={{ backgroundColor: getRiskLevelColor(finding.riskLevel) }}
                  >
                    {finding.riskLevel === 'CRITICAL' ? '🚨' : '⚠️'}
                  </div>
                  <div className="recommendation-content">
                    <h4>{finding.issue}</h4>
                    <p>{finding.recommendation}</p>
                    <span className="recommendation-resource">
                      {finding.resourceType}: {finding.resourceId}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default InspectionDashboard;