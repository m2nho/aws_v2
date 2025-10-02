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
        setItemStatuses(result.data.services || {});
      }
    } catch (error) {
      console.error('Failed to load item statuses:', error);
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

    // 선택된 서비스의 최신 상태 로드
    try {
      const result = await inspectionService.getServiceItemStatus(serviceId);
      if (result.success) {
        setItemStatuses(prev => ({
          ...prev,
          [serviceId]: result.data.items || []
        }));
      }
    } catch (error) {
      console.error('Failed to load service item status:', error);
    }
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
    const serviceStatuses = itemStatuses[serviceType] || [];
    return serviceStatuses.find(status => status.itemId === itemId);
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
      {/* 헤더 */}
      <div className="dashboard-header">
        <h1>AWS 보안 검사 대시보드</h1>
        <p>각 서비스별 검사 항목의 상태를 확인하고 필요한 검사를 실행하세요</p>
      </div>

      {/* 서비스 선택 */}
      <div className="service-selection">
        <h2>서비스 선택</h2>
        <div className="service-tabs">
          {Object.values(inspectionItems).map(service => (
            <button
              key={service.id}
              className={`service-tab ${selectedService === service.id ? 'active' : ''}`}
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

      {/* 선택된 서비스의 검사 항목 대시보드 */}
      {selectedService && (
        <div className="inspection-dashboard">
          <div className="dashboard-controls">
            <div className="service-info">
              <h2>{inspectionItems[selectedService].name} 검사 항목</h2>
              <p>각 검사 항목의 상태를 확인하고 필요한 검사를 실행하세요</p>
            </div>
            
            {/* Role ARN 입력 */}
            <div className="role-arn-input">
              <label htmlFor="roleArn">AWS Role ARN</label>
              <input
                id="roleArn"
                type="text"
                value={assumeRoleArn}
                onChange={(e) => setAssumeRoleArn(e.target.value)}
                placeholder="arn:aws:iam::123456789012:role/YourRoleName"
                className="role-arn-field"
              />
            </div>

            {/* 검사 실행 버튼 */}
            <div className="inspection-actions">
              <button
                className="inspect-selected-button"
                onClick={handleStartInspection}
                disabled={isLoading || !assumeRoleArn || Object.values(selectedItems).filter(Boolean).length === 0}
              >
                {isLoading ? '검사 중...' : `선택된 항목 검사 (${Object.values(selectedItems).filter(Boolean).length}개)`}
              </button>
              <button
                className="refresh-status-button"
                onClick={loadAllItemStatuses}
                disabled={loadingStatuses}
              >
                {loadingStatuses ? '새로고침 중...' : '상태 새로고침'}
              </button>
            </div>
          </div>

          {/* Trusted Advisor 스타일 검사 항목 카드 */}
          <div className="inspection-items-grid">
            {inspectionItems[selectedService].categories.map(category => (
              <div key={category.id} className="category-section">
                <div className="category-header">
                  <h3>{category.name}</h3>
                  <p>{category.description}</p>
                </div>
                
                <div className="items-grid">
                  {category.items.map(item => {
                    const itemStatus = getItemStatus(selectedService, item.id);
                    const statusDisplay = getStatusDisplay(itemStatus);
                    const isExpanded = expandedItems[item.id];
                    const hasDetails = itemStatus && itemStatus.findings && itemStatus.findings.length > 0;
                    
                    return (
                      <div
                        key={item.id}
                        className={`item-card ${statusDisplay.icon === '✅' ? 'status-pass' : 
                                                statusDisplay.icon === '❌' ? 'status-fail' : 
                                                statusDisplay.icon === '⚠️' ? 'status-warning' : 'status-unknown'} ${isExpanded ? 'expanded' : ''}`}
                      >
                        <div className="item-card-header">
                          <div className="item-select">
                            <input
                              type="checkbox"
                              checked={selectedItems[item.id] || false}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleItemToggle(item.id);
                              }}
                            />
                          </div>
                          <div className="item-status-large">
                            <span className="status-icon">{statusDisplay.icon}</span>
                          </div>
                          {hasDetails && (
                            <button
                              className={`expand-button ${isExpanded ? 'expanded' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleItemDetails(item.id);
                              }}
                              title={isExpanded ? '상세 내용 숨기기' : '상세 내용 보기'}
                            >
                              <span className="expand-icon">
                                {isExpanded ? '▼' : '▶'}
                              </span>
                            </button>
                          )}
                        </div>
                        
                        <div 
                          className="item-card-content"
                          onClick={() => hasDetails && toggleItemDetails(item.id)}
                          style={{ cursor: hasDetails ? 'pointer' : 'default' }}
                        >
                          <h4 className="item-title">{item.name}</h4>
                          <p className="item-description">{item.description}</p>
                          
                          <div className="item-status-info">
                            <div className="status-text" style={{ color: statusDisplay.color }}>
                              {statusDisplay.text}
                              {hasDetails && (
                                <span className="details-hint">
                                  {isExpanded ? ' (클릭하여 숨기기)' : ' (클릭하여 상세보기)'}
                                </span>
                              )}
                            </div>
                            {statusDisplay.time && (
                              <div className="last-check">
                                {statusDisplay.time}
                              </div>
                            )}
                          </div>
                          
                          <div className="item-severity-badge">
                            <span 
                              className="severity-label"
                              style={{ color: severityColors[item.severity] }}
                            >
                              {severityIcons[item.severity]} {item.severity}
                            </span>
                          </div>
                        </div>

                        {/* 드롭다운 상세 내용 */}
                        {isExpanded && hasDetails && (
                          <div className="item-details-dropdown">
                            <div className="details-header">
                              <h5>검사 결과 상세</h5>
                              <div className="details-summary">
                                총 {itemStatus.totalResources}개 리소스 중 {itemStatus.issuesFound}개 문제 발견
                              </div>
                            </div>
                            
                            <div className="findings-list">
                              {itemStatus.findings.map((finding, index) => (
                                <div key={index} className="finding-item">
                                  <div className="finding-header">
                                    <div className="finding-severity">
                                      <span 
                                        className="severity-badge"
                                        style={{ backgroundColor: severityColors[finding.riskLevel] }}
                                      >
                                        {severityIcons[finding.riskLevel]} {finding.riskLevel}
                                      </span>
                                    </div>
                                    <div className="finding-resource">
                                      {finding.resourceType}: {finding.resourceId}
                                    </div>
                                  </div>
                                  
                                  <div className="finding-content">
                                    <div className="finding-issue">
                                      <strong>문제:</strong> {finding.issue}
                                    </div>
                                    <div className="finding-recommendation">
                                      <strong>권장사항:</strong> {finding.recommendation}
                                    </div>
                                    {finding.riskScore && (
                                      <div className="finding-risk-score">
                                        <strong>위험 점수:</strong> {finding.riskScore}/100
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {itemStatus.recommendations && itemStatus.recommendations.length > 0 && (
                              <div className="item-recommendations">
                                <h6>추가 권장사항</h6>
                                <ul>
                                  {itemStatus.recommendations.map((rec, index) => (
                                    <li key={index}>{rec}</li>
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