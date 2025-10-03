const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
require('dotenv').config();

const client = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1'
}));

async function checkHistory() {
  try {
    // InspectionHistory 테이블 확인
    const historyResult = await client.send(new ScanCommand({
      TableName: process.env.AWS_DYNAMODB_INSPECTION_HISTORY_TABLE || 'InspectionHistory',
      Limit: 5
    }));
    
    console.log('=== InspectionHistory 테이블 ===');
    console.log('총 기록 수:', historyResult.Count);
    
    historyResult.Items.forEach((item, index) => {
      console.log(`\n${index + 1}. 검사 ID: ${item.inspectionId}`);
      console.log(`   서비스: ${item.serviceType}`);
      console.log(`   상태: ${item.status}`);
      console.log(`   시간: ${new Date(item.startTime).toLocaleString()}`);
      console.log(`   Findings 수: ${item.results?.findings?.length || 0}`);
      
      if (item.results?.findings && item.results.findings.length > 0) {
        console.log('   Findings:');
        item.results.findings.slice(0, 3).forEach((finding, fIndex) => {
          console.log(`     ${fIndex + 1}. ${finding.issue}`);
          console.log(`        리소스: ${finding.resourceType}:${finding.resourceId}`);
        });
        if (item.results.findings.length > 3) {
          console.log(`     ... 그리고 ${item.results.findings.length - 3}개 더`);
        }
      }
      
      // 메타데이터 확인
      if (item.metadata) {
        console.log(`   메타데이터:`, JSON.stringify(item.metadata, null, 2));
      }
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkHistory();