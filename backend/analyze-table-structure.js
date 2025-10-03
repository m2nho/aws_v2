/**
 * 현재 DynamoDB 테이블 구조 분석 스크립트
 */

const { DynamoDBClient, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

require('dotenv').config();

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1'
});

const docClient = DynamoDBDocumentClient.from(client);

const tables = [
  { name: process.env.AWS_DYNAMODB_TABLE_NAME || 'aws_v2', purpose: '사용자 데이터' },
  { name: process.env.AWS_DYNAMODB_INSPECTION_HISTORY_TABLE || 'InspectionHistory', purpose: '검사 히스토리' },
  { name: process.env.AWS_DYNAMODB_INSPECTION_ITEMS_TABLE || 'InspectionItemResults', purpose: '검사 항목별 결과' }
];

async function analyzeTableStructure() {
  console.log('=== DynamoDB 테이블 구조 분석 ===\n');
  
  for (const table of tables) {
    try {
      console.log(`📊 ${table.name} (${table.purpose})`);
      console.log('─'.repeat(50));
      
      // 테이블 구조 조회
      const describeResult = await client.send(new DescribeTableCommand({
        TableName: table.name
      }));
      
      const tableInfo = describeResult.Table;
      
      // 기본 정보
      console.log(`상태: ${tableInfo.TableStatus}`);
      console.log(`아이템 수: ${tableInfo.ItemCount || 0}`);
      console.log(`테이블 크기: ${Math.round((tableInfo.TableSizeBytes || 0) / 1024)} KB`);
      
      // 키 스키마
      console.log('\n🔑 키 스키마:');
      tableInfo.KeySchema.forEach(key => {
        console.log(`  ${key.KeyType === 'HASH' ? '파티션 키' : '정렬 키'}: ${key.AttributeName}`);
      });
      
      // 속성 정의
      console.log('\n📝 속성 정의:');
      tableInfo.AttributeDefinitions.forEach(attr => {
        console.log(`  ${attr.AttributeName}: ${attr.AttributeType}`);
      });
      
      // GSI (Global Secondary Index)
      if (tableInfo.GlobalSecondaryIndexes && tableInfo.GlobalSecondaryIndexes.length > 0) {
        console.log('\n🔍 글로벌 보조 인덱스:');
        tableInfo.GlobalSecondaryIndexes.forEach(gsi => {
          console.log(`  ${gsi.IndexName}:`);
          gsi.KeySchema.forEach(key => {
            console.log(`    ${key.KeyType === 'HASH' ? '파티션 키' : '정렬 키'}: ${key.AttributeName}`);
          });
          console.log(`    상태: ${gsi.IndexStatus}, 아이템 수: ${gsi.ItemCount || 0}`);
        });
      }
      
      // LSI (Local Secondary Index)
      if (tableInfo.LocalSecondaryIndexes && tableInfo.LocalSecondaryIndexes.length > 0) {
        console.log('\n📍 로컬 보조 인덱스:');
        tableInfo.LocalSecondaryIndexes.forEach(lsi => {
          console.log(`  ${lsi.IndexName}:`);
          lsi.KeySchema.forEach(key => {
            console.log(`    ${key.KeyType === 'HASH' ? '파티션 키' : '정렬 키'}: ${key.AttributeName}`);
          });
        });
      }
      
      // 샘플 데이터 구조 분석
      try {
        const scanResult = await docClient.send(new ScanCommand({
          TableName: table.name,
          Limit: 1
        }));
        
        if (scanResult.Items && scanResult.Items.length > 0) {
          console.log('\n📋 샘플 데이터 구조:');
          const sampleItem = scanResult.Items[0];
          Object.keys(sampleItem).forEach(key => {
            const value = sampleItem[key];
            const type = Array.isArray(value) ? 'Array' : typeof value;
            const preview = Array.isArray(value) ? `[${value.length} items]` : 
                           typeof value === 'object' ? '[Object]' : 
                           String(value).length > 50 ? String(value).substring(0, 50) + '...' : String(value);
            console.log(`  ${key}: ${type} = ${preview}`);
          });
        }
      } catch (scanError) {
        console.log('\n📋 샘플 데이터: 조회 실패 또는 빈 테이블');
      }
      
      console.log('\n');
      
    } catch (error) {
      console.log(`❌ ${table.name} 분석 실패: ${error.message}\n`);
    }
  }
  
  // 사용 패턴 분석
  console.log('🔍 사용 패턴 분석');
  console.log('─'.repeat(50));
  
  console.log('\n1. 주요 쿼리 패턴:');
  console.log('   • 사용자별 검사 히스토리 조회 (customerId 기준)');
  console.log('   • 특정 검사 상세 조회 (customerId + inspectionId)');
  console.log('   • 서비스별 검사 히스토리 필터링 (customerId + serviceType)');
  console.log('   • 검사 항목별 결과 조회 (customerId 기준)');
  console.log('   • 특정 검사의 항목별 결과 (customerId + lastInspectionId)');
  
  console.log('\n2. 데이터 관계:');
  console.log('   • InspectionHistory (1) ↔ (N) InspectionItemResults');
  console.log('   • 고객 (1) ↔ (N) 검사 히스토리');
  console.log('   • 검사 (1) ↔ (N) 검사 항목 결과');
  
  console.log('\n3. 현재 구조의 장단점:');
  console.log('   ✅ 장점:');
  console.log('     - 검사 히스토리와 항목별 결과 분리로 유연성 확보');
  console.log('     - 트랜잭션으로 데이터 일관성 보장');
  console.log('     - 각 테이블별 최적화된 인덱스 구성');
  console.log('   ⚠️  단점:');
  console.log('     - 검사 상세 조회 시 2개 테이블 조회 필요');
  console.log('     - 데이터 중복 (findings가 양쪽에 저장)');
  console.log('     - 복잡한 트랜잭션 로직');
}

// 최적화 제안 분석
async function analyzeOptimizationOptions() {
  console.log('\n🚀 테이블 구조 최적화 제안');
  console.log('─'.repeat(50));
  
  console.log('\n옵션 1: 현재 구조 유지 + 최적화');
  console.log('  • InspectionHistory에 itemSummary 필드 추가');
  console.log('  • 검사 상세 조회 시 단일 쿼리로 기본 정보 제공');
  console.log('  • 항목별 상세는 필요시에만 별도 조회');
  console.log('  장점: 기존 코드 최소 변경, 점진적 개선');
  console.log('  단점: 여전히 복잡한 구조');
  
  console.log('\n옵션 2: 단일 테이블 설계 (Single Table Design)');
  console.log('  • PK: customerId, SK: INSPECTION#{inspectionId} 또는 ITEM#{inspectionId}#{itemId}');
  console.log('  • 검사와 항목을 하나의 테이블에 저장');
  console.log('  • GSI로 다양한 쿼리 패턴 지원');
  console.log('  장점: 단일 쿼리로 모든 데이터 조회, 트랜잭션 단순화');
  console.log('  단점: 복잡한 설계, 기존 코드 대폭 수정 필요');
  
  console.log('\n옵션 3: 하이브리드 구조');
  console.log('  • InspectionHistory: 검사 기본 정보 + 요약 통계');
  console.log('  • InspectionDetails: 상세 findings + 항목별 분석');
  console.log('  • 목록 조회는 History만, 상세 조회는 Details 추가');
  console.log('  장점: 성능과 유연성의 균형');
  console.log('  단점: 중간 정도의 복잡성');
  
  console.log('\n권장사항: 옵션 1 (현재 구조 최적화)');
  console.log('  이유:');
  console.log('  • 현재 시스템이 안정적으로 동작 중');
  console.log('  • 성능 문제가 심각하지 않음');
  console.log('  • 점진적 개선으로 리스크 최소화');
  console.log('  • 개발 리소스 효율적 활용');
}

async function main() {
  await analyzeTableStructure();
  await analyzeOptimizationOptions();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { analyzeTableStructure, analyzeOptimizationOptions };