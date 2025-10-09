import React, { useState, useEffect } from 'react';
import { inspectionItems, severityColors, severityIcons } from '../data/inspectionItems';
import { inspectionService } from '../services';
import './ServiceInspectionSelector.css';

const ServiceInspectionSelector = ({ onStartInspection, isLoading }) => {
  const [selectedService, setSelectedService] = useState(null);
  const [selectedItems, setSelectedItems] = useState({});
  const [assumeRoleArn, setAssumeRoleArn] = useState('');
  const [itemStatuses, setItemStatuses] = useState({});
  const [loadingStatuses, setLoadingStatuses] = useState(false);
  const [expandedItems, setExpandedItems] = useState({}); // 드롭다운 상태 관리

  // 컴포넌트 마운트 시 모든 검사 항목 상태 로드
  useEffect(() => {
    loadAllItemStatuses();
  }, []);

  // 모든 검사 항목 상태 로드
  const loadAllItemStatuses = async () => {
    try {
      setLoadingStatuses(true);
      
      const result = await inspectionService.getAllItemStatus();
      
      if (result.success) {
        // API 응답 구조: result.data = { services: { EC2: { security_groups: {...} } } }
        // itemStatuses는 { EC2: { security_groups: {...} } } 형태여야 함
        setItemStatuses(result.data.services || {});
        
      } else {
      }
    } catch (error) {
    } finally {
      setLoadingStatuses(false);
    }
  };

  // 서비스 선택 핸들러
  const handleServiceSelect = async (serviceId) => {
    setSelectedService(serviceId);
    
    // 기본적으로 enabled: true인 항목들을 선택
    const defaultSelected = {};
    const service = inspectionItems[serviceId];
    
    service.categories.forEach(category => {
      category.items.forEach(item => {
        if (item.enabled) {
          defaultSelected[item.id] = true;
        }
      });
    });
    
    setSelectedItems(defaultSelected);

    // 선택된 서비스의 최신 상태는 이미 loadAllItemStatuses에서 로드됨
    // 별도로 서비스별 상태를 다시 로드할 필요 없음
  };

  // 검사 항목 선택/해제 핸들러
  const handleItemToggle = (itemId) => {
    setSelectedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  // 카테고리 전체 선택/해제
  const handleCategoryToggle = (category) => {
    const allSelected = category.items.every(item => selectedItems[item.id]);
    const newSelected = { ...selectedItems };
    
    category.items.forEach(item => {
      newSelected[item.id] = !allSelected;
    });
    
    setSelectedItems(newSelected);
  };

  // 검사 항목의 최근 상태 가져오기
  const getItemStatus = (serviceType, itemId) => {
    const serviceStatuses = itemStatuses[serviceType] || {};
    const status = serviceStatuses[itemId];
    

    
    return status;
  };

  // 상태에 따른 아이콘과 색상 반환
  const getStatusDisplay = (status) => {
    if (!status) {
      return { icon: '❓', color: '#9ca3af', text: '검사 필요', time: '' };
    }

    const timeAgo = getTimeAgo(status.lastInspectionTime);
    
    switch (status.status) {
      case 'PASS':
        return { 
          icon: '✅', 
          color: '#10b981', 
          text: '문제 없음', 
          time: timeAgo 
        };
      case 'FAIL':
        return { 
          icon: '❌', 
          color: '#ef4444', 
          text: `${status.issuesFound}개 문제 발견`, 
          time: timeAgo 
        };
      case 'WARNING':
        return { 
          icon: '⚠️', 
          color: '#f59e0b', 
          text: `${status.issuesFound}개 경고`, 
          time: timeAgo 
        };
      default:
        return { 
          icon: '❓', 
          color: '#9ca3af', 
          text: '검사 필요', 
          time: '' 
        };
    }
  };

  // 시간 차이를 사람이 읽기 쉬운 형태로 변환
  const getTimeAgo = (timestamp) => {
    if (!timestamp) return '';
    
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 60) {
      return `${minutes}분 전`;
    } else if (hours < 24) {
      return `${hours}시간 전`;
    } else {
      return `${days}일 전`;
    }
  };

  // 드롭다운 토글
  const toggleItemDetails = (itemId) => {
    setExpandedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  // 검사 시작
  const handleStartInspection = () => {
    if (!selectedService || !assumeRoleArn) {
      alert('서비스와 Role ARN을 선택해주세요.');
      return;
    }

    const selectedItemIds = Object.keys(selectedItems).filter(id => selectedItems[id]);
    
    if (selectedItemIds.length === 0) {
      alert('최소 하나의 검사 항목을 선택해주세요.');
      return;
    }

    // 검사 시작 시 콜백 함수 추가 (검사 완료 후 상태 새로고침용)
    onStartInspection({
      serviceType: selectedService,
      assumeRoleArn,
      inspectionConfig: {
        selectedItems: selectedItemIds
      },
      onInspectionComplete: () => {
        // 검사 완료 후 상태 새로고침
        setTimeout(() => {
          loadAllItemStatuses();
        }, 2000); // 2초 후 새로고침 (DB 저장 시간 고려)
      }
    });
  };

  return (
    <div className="service-inspection-selector">


      {/* 간소화된 서비스 선택 */}
      <div className="service-selection-compact">
        <div className="service-tabs-compact">
          {Object.values(inspectionItems).map(service => (
            <button
              key={service.id}
              className={`service-tab-compact ${selectedService === service.id ? 'active' : ''}`}
              onClick={() => handleServiceSelect(service.id)}
            >
              <span className="tab-icon" style={{ color: service.color }}>
                {service.icon}
              </span>
              <span className="tab-name">{service.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 서비스 미선택 시 환영 화면 */}
      {!selectedService && (
        <div className="welcome-screen">
          <div className="welcome-content">
            <div className="welcome-icon">
              <span className="main-icon">🔍</span>
              <div className="floating-icons">
                <span className="float-icon" style={{ animationDelay: '0s' }}>🛡️</span>
                <span className="float-icon" style={{ animationDelay: '0.5s' }}>⚡</span>
                <span className="float-icon" style={{ animationDelay: '1s' }}>💰</span>
                <span className="float-icon" style={{ animationDelay: '1.5s' }}>🔒</span>
              </div>
            </div>
            
            <div className="welcome-text">
              <h2>AWS 리소스 보안 검사를 시작하세요</h2>
              <p>
                위에서 검사할 AWS 서비스를 선택하면 해당 서비스의 보안 설정, 
                비용 최적화, 성능 개선 사항을 종합적으로 검사할 수 있습니다.
              </p>
            </div>
            
            <div className="welcome-features">
              <div className="feature-grid">
                <div className="feature-item">
                  <div className="feature-icon">🔒</div>
                  <h3>보안 검사</h3>
                  <p>위험한 포트 노출, 암호화 설정, 접근 권한 등을 검사합니다</p>
                </div>
                <div className="feature-item">
                  <div className="feature-icon">💰</div>
                  <h3>비용 최적화</h3>
                  <p>미사용 리소스, 오래된 스냅샷 등 비용 절감 기회를 찾습니다</p>
                </div>
                <div className="feature-item">
                  <div className="feature-icon">⚡</div>
                  <h3>성능 개선</h3>
                  <p>인스턴스 타입, 스토리지 최적화 등 성능 향상 방안을 제안합니다</p>
                </div>
                <div className="feature-item">
                  <div className="feature-icon">📊</div>
                  <h3>실시간 모니터링</h3>
                  <p>검사 진행 상황을 실시간으로 확인하고 결과를 분석합니다</p>
                </div>
              </div>
            </div>
            
            <div className="welcome-cta">
              <div className="cta-text">
                <span className="cta-icon">👆</span>
                <span>위의 서비스 탭에서 검사할 AWS 서비스를 선택해주세요</span>
              </div>
              <div className="service-preview">
                {Object.values(inspectionItems).map((service, index) => (
                  <div 
                    key={service.id} 
                    className="preview-service"
                    style={{ 
                      animationDelay: `${index * 0.2}s`,
                      color: service.color 
                    }}
                    onClick={() => handleServiceSelect(service.id)}
                  >
                    <span className="preview-icon">{service.icon}</span>
                    <span className="preview-name">{service.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trusted Advisor 스타일 검사 대시보드 */}
      {selectedService && (
        <div className="trusted-advisor-dashboard">
          {/* 간소화된 서비스 헤더 */}
          <div className="service-header-compact">
            <div className="service-info-compact">
              <div className="service-icon-compact" style={{ color: inspectionItems[selectedService].color }}>
                {inspectionItems[selectedService].icon}
              </div>
              <div className="service-title-compact">
                <h2>{inspectionItems[selectedService].name}</h2>
                <span className="selected-count">
                  {Object.values(selectedItems).filter(Boolean).length}개 선택됨
                </span>
              </div>
            </div>
          </div>

          {/* 간소화된 설정 패널 */}
          <div className="config-panel-compact">
            <div className="arn-input-compact">
              <input
                id="roleArn"
                type="text"
                value={assumeRoleArn}
                onChange={(e) => setAssumeRoleArn(e.target.value)}
                placeholder="AWS Role ARN (예: arn:aws:iam::123456789012:role/YourRole)"
                className="arn-field-compact"
              />
              <button
                className="start-btn-compact"
                onClick={handleStartInspection}
                disabled={isLoading || !assumeRoleArn || Object.values(selectedItems).filter(Boolean).length === 0}
              >
                {isLoading ? '검사 중...' : '검사 시작'}
              </button>
            </div>
          </div>

          {/* Trusted Advisor 스타일 검사 항목 */}
          <div className="trusted-advisor-checks">
            {inspectionItems[selectedService].categories.map(category => (
              <div key={category.id} className="check-category-compact">
                <div className="category-header-compact">
                  <div className="category-icon-compact">
                    {category.id === 'security' ? '🔒' : 
                     category.id === 'cost_optimization' ? '💰' : 
                     category.id === 'backup' ? '💾' : 
                     category.id === 'data_protection' ? '🛡️' : 
                     category.id === 'policies' ? '📋' : '⚙️'}
                  </div>
                  <h3>{category.name}</h3>
                </div>
                
                <div className="checks-list">
                  {category.items.map(item => {
                    const itemStatus = getItemStatus(selectedService, item.id);
                    const statusDisplay = getStatusDisplay(itemStatus);
                    const isExpanded = expandedItems[item.id];
                    const hasDetails = itemStatus && itemStatus.findings && itemStatus.findings.length > 0;
                    const isSelected = selectedItems[item.id] || false;
                    
                    return (
                      <div
                        key={item.id}
                        className={`check-item ${statusDisplay.icon === '✅' ? 'status-pass' : 
                                                statusDisplay.icon === '❌' ? 'status-fail' : 
                                                statusDisplay.icon === '⚠️' ? 'status-warning' : 'status-unknown'} 
                                   ${isSelected ? 'selected' : ''} ${isExpanded ? 'expanded' : ''}`}
                      >
                        <div className="check-main">
                          <div className="check-selector">
                            <label className="checkbox-wrapper">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  handleItemToggle(item.id);
                                }}
                                className="check-checkbox"
                              />
                              <span className="checkbox-custom"></span>
                            </label>
                          </div>
                          
                          <div className="check-status-indicator">
                            <div className="status-circle">
                              <span className="status-icon-large">{statusDisplay.icon}</span>
                            </div>
                          </div>
                          
                          <div className="check-content">
                            <div className="check-header-compact">
                              <h4 className="check-title-compact">{item.name}</h4>
                              <span 
                                className="severity-badge-compact"
                                style={{ 
                                  backgroundColor: severityColors[item.severity] + '20',
                                  color: severityColors[item.severity],
                                  borderColor: severityColors[item.severity] + '40'
                                }}
                              >
                                {severityIcons[item.severity]} {item.severity}
                              </span>
                            </div>
                            
                            <p className="check-description-compact">{item.shortDescription}</p>
                            
                            <div className="check-status-info">
                              <div className="status-details">
                                <span className="status-text-modern" style={{ color: statusDisplay.color }}>
                                  {statusDisplay.text}
                                </span>
                                {statusDisplay.time && (
                                  <span className="last-check-time">
                                    마지막 검사: {statusDisplay.time}
                                  </span>
                                )}
                              </div>
                              
                              {hasDetails && (
                                <button
                                  className="details-toggle-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleItemDetails(item.id);
                                  }}
                                >
                                  <span className="toggle-icon">
                                    {isExpanded ? '📋' : '📊'}
                                  </span>
                                  <span className="toggle-text">
                                    {isExpanded ? '상세 숨기기' : '상세 보기'}
                                  </span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 상세 정보 패널 */}
                        {isExpanded && hasDetails && (
                          <div className="check-details-panel">
                            <div className="details-header-modern">
                              <div className="details-title">
                                <span className="details-icon">📊</span>
                                <h5>검사 결과 상세</h5>
                              </div>
                              <div className="details-summary-modern">
                                <div className="summary-stat">
                                  <span className="stat-value">{itemStatus.totalResources}</span>
                                  <span className="stat-label">검사된 리소스</span>
                                </div>
                                <div className="summary-stat">
                                  <span className="stat-value">{itemStatus.issuesFound}</span>
                                  <span className="stat-label">발견된 문제</span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="findings-grid">
                              {itemStatus.findings.map((finding, index) => (
                                <div key={index} className="finding-card">
                                  <div className="finding-card-header">
                                    <span 
                                      className="finding-severity-badge"
                                      style={{ 
                                        backgroundColor: severityColors[finding.riskLevel],
                                        color: 'white'
                                      }}
                                    >
                                      {severityIcons[finding.riskLevel]} {finding.riskLevel}
                                    </span>
                                    <span className="finding-resource-info">
                                      {finding.resourceType}: {finding.resourceId}
                                    </span>
                                  </div>
                                  
                                  <div className="finding-card-content">
                                    <div className="finding-issue-modern">
                                      <span className="issue-label">🚨 문제</span>
                                      <p>{finding.issue}</p>
                                    </div>
                                    <div className="finding-recommendation-modern">
                                      <span className="recommendation-label">💡 권장사항</span>
                                      <p>{finding.recommendation}</p>
                                    </div>
                                    {finding.riskScore && (
                                      <div className="finding-risk-score-modern">
                                        <span className="risk-label">⚡ 위험 점수</span>
                                        <div className="risk-score-bar">
                                          <div 
                                            className="risk-score-fill"
                                            style={{ 
                                              width: `${finding.riskScore}%`,
                                              backgroundColor: finding.riskScore > 70 ? '#DC2626' : 
                                                             finding.riskScore > 40 ? '#EA580C' : '#65A30D'
                                            }}
                                          ></div>
                                          <span className="risk-score-text">{finding.riskScore}/100</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {itemStatus.recommendations && itemStatus.recommendations.length > 0 && (
                              <div className="additional-recommendations">
                                <h6>
                                  <span className="rec-icon">💡</span>
                                  추가 권장사항
                                </h6>
                                <ul className="recommendations-list">
                                  {itemStatus.recommendations.map((rec, index) => (
                                    <li key={index} className="recommendation-item">
                                      <span className="rec-bullet">•</span>
                                      {rec}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceInspectionSelector;