import React, { useState } from 'react';
import { inspectionItems, severityColors, severityIcons } from '../data/inspectionItems';
import './InspectionResultsView.css';

const InspectionResultsView = ({ inspectionData, onBackToSelection }) => {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSeverity, setSelectedSeverity] = useState('all');

  if (!inspectionData || !inspectionData.results) {
    return (
      <div className="inspection-results-view">
        <div className="no-results">
          <h2>검사 결과를 불러올 수 없습니다</h2>
          <button onClick={onBackToSelection} className="back-button">
            새 검사 시작
          </button>
        </div>
      </div>
    );
  }

  const { results } = inspectionData;
  const serviceInfo = inspectionItems[inspectionData.serviceType];

  // 필터링된 결과
  const filteredFindings = results.findings?.filter(finding => {
    const categoryMatch = selectedCategory === 'all' || finding.category === selectedCategory.toUpperCase();
    const severityMatch = selectedSeverity === 'all' || finding.riskLevel === selectedSeverity;
    return categoryMatch && severityMatch;
  }) || [];

  // 카테고리별 통계
  const categoryStats = {};
  results.findings?.forEach(finding => {
    const category = finding.category || 'OTHER';
    if (!categoryStats[category]) {
      categoryStats[category] = { total: 0, critical: 0, high: 0, medium: 0, low: 0 };
    }
    categoryStats[category].total++;
    categoryStats[category][finding.riskLevel?.toLowerCase() || 'low']++;
  });

  return (
    <div className="inspection-results-view">
      {/* 헤더 */}
      <div className="results-header">
        <button onClick={onBackToSelection} className="back-button">
          ← 새 검사
        </button>
        <div className="service-info">
          <span className="service-icon" style={{ color: serviceInfo?.color }}>
            {serviceInfo?.icon}
          </span>
          <div>
            <h1>{serviceInfo?.name} 검사 결과</h1>
            <p>검사 ID: {inspectionData.inspectionId}</p>
          </div>
        </div>
      </div>

      {/* 요약 대시보드 */}
      <div className="summary-dashboard">
        <div className="summary-cards">
          <div className="summary-card total">
            <div className="card-icon">📊</div>
            <div className="card-content">
              <h3>총 리소스</h3>
              <div className="card-value">{results.summary?.totalResources || 0}</div>
            </div>
          </div>
          
          <div className="summary-card critical">
            <div className="card-icon">🚨</div>
            <div className="card-content">
              <h3>심각한 문제</h3>
              <div className="card-value">{results.summary?.criticalIssues || 0}</div>
            </div>
          </div>
          
          <div className="summary-card high">
            <div className="card-icon">⚠️</div>
            <div className="card-content">
              <h3>높은 위험</h3>
              <div className="card-value">{results.summary?.highRiskIssues || 0}</div>
            </div>
          </div>
          
          <div className="summary-card medium">
            <div className="card-icon">⚡</div>
            <div className="card-content">
              <h3>중간 위험</h3>
              <div className="card-value">{results.summary?.mediumRiskIssues || 0}</div>
            </div>
          </div>
          
          <div className="summary-card low">
            <div className="card-icon">ℹ️</div>
            <div className="card-content">
              <h3>낮은 위험</h3>
              <div className="card-value">{results.summary?.lowRiskIssues || 0}</div>
            </div>
          </div>
          
          <div className="summary-card score">
            <div className="card-icon">🎯</div>
            <div className="card-content">
              <h3>보안 점수</h3>
              <div className="card-value">{results.summary?.score || 0}/100</div>
            </div>
          </div>
        </div>
      </div>

      {/* 필터 */}
      <div className="filters">
        <div className="filter-group">
          <label>카테고리:</label>
          <select 
            value={selectedCategory} 
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="all">전체</option>
            <option value="security">보안</option>
            <option value="performance">성능</option>
            <option value="cost">비용</option>
            <option value="compliance">규정준수</option>
          </select>
        </div>
        
        <div className="filter-group">
          <label>심각도:</label>
          <select 
            value={selectedSeverity} 
            onChange={(e) => setSelectedSeverity(e.target.value)}
          >
            <option value="all">전체</option>
            <option value="CRITICAL">심각</option>
            <option value="HIGH">높음</option>
            <option value="MEDIUM">중간</option>
            <option value="LOW">낮음</option>
          </select>
        </div>
        
        <div className="results-count">
          {filteredFindings.length}개 결과 표시
        </div>
      </div>

      {/* 검사 결과 목록 */}
      <div className="findings-list">
        {filteredFindings.length === 0 ? (
          <div className="no-findings">
            <p>선택한 필터에 해당하는 결과가 없습니다.</p>
          </div>
        ) : (
          filteredFindings.map((finding, index) => (
            <div key={index} className={`finding-card ${finding.riskLevel?.toLowerCase()}`}>
              <div className="finding-header">
                <div className="finding-title">
                  <span 
                    className="severity-badge"
                    style={{ backgroundColor: severityColors[finding.riskLevel] }}
                  >
                    {severityIcons[finding.riskLevel]} {finding.riskLevel}
                  </span>
                  <h3>{finding.issue}</h3>
                </div>
                <div className="finding-meta">
                  <span className="resource-type">{finding.resourceType}</span>
                  <span className="resource-id">{finding.resourceId}</span>
                </div>
              </div>
              
              <div className="finding-content">
                <div className="recommendation">
                  <h4>권장사항</h4>
                  <p>{finding.recommendation}</p>
                </div>
                
                {finding.details && (
                  <div className="finding-details">
                    <h4>상세 정보</h4>
                    <div className="details-content">
                      {typeof finding.details === 'object' ? (
                        <pre>{JSON.stringify(finding.details, null, 2)}</pre>
                      ) : (
                        <p>{finding.details}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="finding-footer">
                <span className="category-tag">{finding.category}</span>
                <span className="risk-score">위험도: {finding.riskScore || 0}/100</span>
                <span className="timestamp">
                  {finding.timestamp ? new Date(finding.timestamp).toLocaleString() : ''}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 권장사항 요약 */}
      {results.recommendations && results.recommendations.length > 0 && (
        <div className="recommendations-section">
          <h2>주요 권장사항</h2>
          <div className="recommendations-list">
            {results.recommendations.map((rec, index) => (
              <div key={index} className="recommendation-card">
                <h3>{rec.title}</h3>
                <p>{rec.description}</p>
                {rec.priority && (
                  <span className={`priority-badge ${rec.priority.toLowerCase()}`}>
                    {rec.priority} 우선순위
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default InspectionResultsView;