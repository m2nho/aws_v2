const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
require('dotenv').config();

const client = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1'
}));

async function testSingleTable() {
  try {
    console.log('=== 단일 테이블 구조 테스트 ===\n');
    
    // InspectionItemResults 테이블 전체 조회
    const result = await client.send(new ScanCommand({
      TableName: process.env.AWS_DYNAMODB_INSPECTION_ITEMS_TABLE || 'InspectionItemResults'
    }));
    
    console.log(`총 레코드 수: ${result.Items?.length || 0}\n`);
    
    // recordType별 분류
    const latest = result.Items?.filter(item => item.recordType === 'LATEST') || [];
    const history = result.Items?.filter(item => item.recordType === 'HISTORY') || [];
    const others = result.Items?.filter(item => !item.recordType) || [];
    
    console.log('=== LATEST 레코드 (리소스 검사 탭용) ===');
    console.log(`개수: ${latest.length}`);
    latest.forEach((item, index) => {
      console.log(`${index + 1}. ${item.itemKey}`);
      console.log(`   ${item.itemName} - ${item.status}`);
      console.log(`   검사 ID: ${item.lastInspectionId}`);
      console.log(`   시간: ${new Date(item.lastInspectionTime).toLocaleString()}`);
      console.log(`   문제: ${item.issuesFound}개\n`);
    });
    
    console.log('=== HISTORY 레코드 (검사 히스토리용) ===');
    console.log(`개수: ${history.length}`);
    history.sort((a, b) => (b.lastInspectionTime || 0) - (a.lastInspectionTime || 0));
    history.forEach((item, index) => {
      console.log(`${index + 1}. ${item.itemKey}`);
      console.log(`   ${item.itemName} - ${item.status}`);
      console.log(`   검사 ID: ${item.lastInspectionId}`);
      console.log(`   시간: ${new Date(item.lastInspectionTime).toLocaleString()}`);
      console.log(`   문제: ${item.issuesFound}개\n`);
    });
    
    if (others.length > 0) {
      console.log('=== 기타 레코드 (recordType 없음) ===');
      console.log(`개수: ${others.length}`);
      others.forEach((item, index) => {
        console.log(`${index + 1}. ${item.itemKey}`);
        console.log(`   ${item.itemName} - ${item.status}`);
        console.log(`   검사 ID: ${item.lastInspectionId}`);
        console.log(`   시간: ${new Date(item.lastInspectionTime).toLocaleString()}\n`);
      });
    }
    
    console.log('=== 테스트 결과 ===');
    console.log(`✅ LATEST 레코드: ${latest.length}개 (리소스 검사 탭에서 사용)`);
    console.log(`✅ HISTORY 레코드: ${history.length}개 (검사 히스토리에서 사용)`);
    console.log(`⚠️  기타 레코드: ${others.length}개 (마이그레이션 필요)`);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testSingleTable();