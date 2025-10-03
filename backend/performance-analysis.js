/**
 * 현재 테이블 구조의 성능 분석
 */

const { DynamoDBDocumentClient, QueryCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');

require('dotenv').config();

const client = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1'
}));

async function analyzeQueryPerformance() {
  console.log('=== 쿼리 성능 분석 ===\n');
  
  const testCustomerId = '0b2294d8-7fc2-4122-b5aa-71c107a615a5';
  
  // 1. 검사 히스토리 목록 조회 성능
  console.log('1. 검사 히스토리 목록 조회');
  console.log('─'.repeat(30));
  
  const historyStart = Date.now();
  try {
    const historyResult = await client.send(new QueryCommand({
      TableName: process.env.AWS_DYNAMODB_INSPECTION_HISTORY_TABLE || 'InspectionHistory',
      KeyConditionExpression: 'customerId = :customerId',
      ExpressionAttributeValues: {
        ':customerId': testCustomerId
      },
      Limit: 20
    }));
    
    const historyTime = Date.now() - historyStart;
    console.log(`✅ 응답 시간: ${historyTime}ms`);
    console.log(`📊 조회된 항목: ${historyResult.Items?.length || 0}개`);
    console.log(`🔋 소비된 RCU: ${historyResult.ConsumedCapacity?.CapacityUnits || 'N/A'}`);
    
  } catch (error) {
    console.log(`❌ 실패: ${error.message}`);
  }
  
  // 2. 검사 항목별 결과 조회 성능
  console.log('\n2. 검사 항목별 결과 조회');
  console.log('─'.repeat(30));
  
  const itemsStart = Date.now();
  try {
    const itemsResult = await client.send(new QueryCommand({
      TableName: process.env.AWS_DYNAMODB_INSPECTION_ITEMS_TABLE || 'InspectionItemResults',
      KeyConditionExpression: 'customerId = :customerId',
      ExpressionAttributeValues: {
        ':customerId': testCustomerId
      }
    }));
    
    const itemsTime = Date.now() - itemsStart;
    console.log(`✅ 응답 시간: ${itemsTime}ms`);
    console.log(`📊 조회된 항목: ${itemsResult.Items?.length || 0}개`);
    console.log(`🔋 소비된 RCU: ${itemsResult.ConsumedCapacity?.CapacityUnits || 'N/A'}`);
    
  } catch (error) {
    console.log(`❌ 실패: ${error.message}`);
  }
  
  // 3. 검사 상세 조회 (현재 방식: 2번의 쿼리)
  console.log('\n3. 검사 상세 조회 (현재 방식)');
  console.log('─'.repeat(30));
  
  const detailStart = Date.now();
  let totalRCU = 0;
  
  try {
    // 첫 번째 쿼리: 검사 히스토리
    const historyDetailResult = await client.send(new QueryCommand({
      TableName: process.env.AWS_DYNAMODB_INSPECTION_HISTORY_TABLE || 'InspectionHistory',
      KeyConditionExpression: 'customerId = :customerId',
      ExpressionAttributeValues: {
        ':customerId': testCustomerId
      },
      Limit: 1
    }));
    
    totalRCU += historyDetailResult.ConsumedCapacity?.CapacityUnits || 0;
    
    if (historyDetailResult.Items && historyDetailResult.Items.length > 0) {
      const inspectionId = historyDetailResult.Items[0].inspectionId;
      
      // 두 번째 쿼리: 해당 검사의 항목별 결과
      const itemDetailResult = await client.send(new QueryCommand({
        TableName: process.env.AWS_DYNAMODB_INSPECTION_ITEMS_TABLE || 'InspectionItemResults',
        KeyConditionExpression: 'customerId = :customerId',
        FilterExpression: 'lastInspectionId = :inspectionId',
        ExpressionAttributeValues: {
          ':customerId': testCustomerId,
          ':inspectionId': inspectionId
        }
      }));
      
      totalRCU += itemDetailResult.ConsumedCapacity?.CapacityUnits || 0;
      
      const detailTime = Date.now() - detailStart;
      console.log(`✅ 총 응답 시간: ${detailTime}ms`);
      console.log(`📊 검사 정보: 1개, 항목 결과: ${itemDetailResult.Items?.length || 0}개`);
      console.log(`🔋 총 소비된 RCU: ${totalRCU}`);
      console.log(`🔄 필요한 쿼리 수: 2개`);
    }
    
  } catch (error) {
    console.log(`❌ 실패: ${error.message}`);
  }
}

async function analyzeDataDuplication() {
  console.log('\n=== 데이터 중복 분석 ===\n');
  
  const testCustomerId = '0b2294d8-7fc2-4122-b5aa-71c107a615a5';
  
  try {
    // 검사 히스토리에서 findings 크기 측정
    const historyResult = await client.send(new QueryCommand({
      TableName: process.env.AWS_DYNAMODB_INSPECTION_HISTORY_TABLE || 'InspectionHistory',
      KeyConditionExpression: 'customerId = :customerId',
      ExpressionAttributeValues: {
        ':customerId': testCustomerId
      },
      Limit: 1
    }));
    
    // 검사 항목에서 findings 크기 측정
    const itemsResult = await client.send(new QueryCommand({
      TableName: process.env.AWS_DYNAMODB_INSPECTION_ITEMS_TABLE || 'InspectionItemResults',
      KeyConditionExpression: 'customerId = :customerId',
      ExpressionAttributeValues: {
        ':customerId': testCustomerId
      }
    }));
    
    if (historyResult.Items && historyResult.Items.length > 0 && 
        itemsResult.Items && itemsResult.Items.length > 0) {
      
      const historyFindings = historyResult.Items[0].results?.findings || [];
      let itemFindings = 0;
      
      itemsResult.Items.forEach(item => {
        itemFindings += (item.findings?.length || 0);
      });
      
      console.log('데이터 중복 현황:');
      console.log(`📊 히스토리 테이블 findings: ${historyFindings.length}개`);
      console.log(`📊 항목 테이블 findings: ${itemFindings}개`);
      
      if (historyFindings.length > 0 && itemFindings > 0) {
        const duplicationRatio = (itemFindings / historyFindings * 100).toFixed(1);
        console.log(`🔄 중복률: ${duplicationRatio}%`);
        
        // 예상 저장 공간 계산
        const avgFindingSize = JSON.stringify(historyFindings[0] || {}).length;
        const duplicatedSize = itemFindings * avgFindingSize;
        console.log(`💾 중복으로 인한 추가 저장 공간: ~${Math.round(duplicatedSize / 1024)} KB`);
      }
    }
    
  } catch (error) {
    console.log(`❌ 분석 실패: ${error.message}`);
  }
}

async function suggestOptimizations() {
  console.log('\n=== 최적화 제안 ===\n');
  
  console.log('🎯 즉시 적용 가능한 최적화:');
  console.log('1. InspectionHistory에 itemSummary 필드 추가');
  console.log('   - 각 항목별 상태, 위험도, 문제 수 요약');
  console.log('   - 상세보기에서 기본 정보 단일 쿼리로 제공');
  console.log('   - 예상 성능 향상: 50% (2쿼리 → 1쿼리)');
  
  console.log('\n2. 검사 항목별 결과 조회 최적화');
  console.log('   - GSI 추가: lastInspectionId-itemId-index');
  console.log('   - 특정 검사의 항목들을 더 효율적으로 조회');
  console.log('   - FilterExpression 제거로 성능 향상');
  
  console.log('\n3. 데이터 중복 최소화');
  console.log('   - InspectionItemResults에서 findings 요약만 저장');
  console.log('   - 상세 findings는 InspectionHistory에서만 관리');
  console.log('   - 예상 저장 공간 절약: 30-40%');
  
  console.log('\n🔮 장기적 최적화 옵션:');
  console.log('1. 읽기 전용 복제본 (Read Replica) 활용');
  console.log('   - 검사 목록 조회용 최적화된 구조');
  console.log('   - 실시간 업데이트는 메인 테이블, 조회는 복제본');
  
  console.log('\n2. 캐싱 레이어 추가');
  console.log('   - Redis/ElastiCache로 자주 조회되는 데이터 캐싱');
  console.log('   - 검사 목록, 사용자별 통계 등');
  
  console.log('\n3. 데이터 아카이빙');
  console.log('   - 오래된 검사 결과를 S3로 이동');
  console.log('   - DynamoDB는 최근 3-6개월 데이터만 유지');
  
  console.log('\n✅ 권장사항: 즉시 적용 가능한 최적화부터 시작');
  console.log('   현재 구조는 충분히 효율적이며, 점진적 개선이 최적');
}

async function main() {
  await analyzeQueryPerformance();
  await analyzeDataDuplication();
  await suggestOptimizations();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { analyzeQueryPerformance, analyzeDataDuplication, suggestOptimizations };