/**
 * 검사 항목별 결과 모델
 * 각 검사 항목(보안 그룹, 키 페어 등)의 개별 결과를 저장
 */

const InspectionItemResultSchema = {
  // Primary Key
  customerId: 'string', // 고객 ID
  itemKey: 'string', // 서비스타입#검사항목ID (예: EC2#security_groups)
  
  // 검사 정보
  serviceType: 'string', // EC2, RDS, S3, IAM
  itemId: 'string', // security_groups, key_pairs, encryption 등
  itemName: 'string', // 검사 항목 이름
  category: 'string', // security, performance, cost
  
  // 최근 검사 결과
  lastInspectionId: 'string', // 마지막 검사 ID
  lastInspectionTime: 'number', // 마지막 검사 시간 (timestamp)
  status: 'string', // PASS, FAIL, WARNING, NOT_CHECKED
  
  // 결과 요약
  totalResources: 'number', // 검사된 리소스 수
  issuesFound: 'number', // 발견된 문제 수
  riskLevel: 'string', // CRITICAL, HIGH, MEDIUM, LOW
  score: 'number', // 0-100 점수
  
  // 상세 결과
  findings: 'list', // 발견된 문제들
  recommendations: 'list', // 권장사항
  
  // 메타데이터
  createdAt: 'number',
  updatedAt: 'number',
  
  // GSI for querying
  // GSI1: customerId-serviceType-index
  // GSI2: customerId-lastInspectionTime-index (최근 검사 순)
};

module.exports = {
  tableName: 'InspectionItemResults',
  schema: InspectionItemResultSchema,
  
  // DynamoDB 테이블 생성 스크립트
  createTableParams: {
    TableName: 'InspectionItemResults',
    KeySchema: [
      { AttributeName: 'customerId', KeyType: 'HASH' },
      { AttributeName: 'itemKey', KeyType: 'RANGE' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'customerId', AttributeType: 'S' },
      { AttributeName: 'itemKey', AttributeType: 'S' },
      { AttributeName: 'serviceType', AttributeType: 'S' },
      { AttributeName: 'lastInspectionTime', AttributeType: 'N' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'customerId-serviceType-index',
        KeySchema: [
          { AttributeName: 'customerId', KeyType: 'HASH' },
          { AttributeName: 'serviceType', KeyType: 'RANGE' }
        ],
        Projection: { ProjectionType: 'ALL' },
        BillingMode: 'PAY_PER_REQUEST'
      },
      {
        IndexName: 'customerId-lastInspectionTime-index',
        KeySchema: [
          { AttributeName: 'customerId', KeyType: 'HASH' },
          { AttributeName: 'lastInspectionTime', KeyType: 'RANGE' }
        ],
        Projection: { ProjectionType: 'ALL' },
        BillingMode: 'PAY_PER_REQUEST'
      }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  }
};