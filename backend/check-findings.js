const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
require('dotenv').config();

const client = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1'
}));

async function checkFindings() {
  try {
    // InspectionItemResults 테이블에서 findings 확인
    const itemsResult = await client.send(new ScanCommand({
      TableName: process.env.AWS_DYNAMODB_INSPECTION_ITEMS_TABLE || 'InspectionItemResults'
    }));
    
    console.log('=== 각 항목별 Findings 분석 ===');
    
    itemsResult.Items.forEach(item => {
      console.log(`\n${item.serviceType}#${item.itemId} - ${item.itemName}`);
      console.log(`검사 ID: ${item.lastInspectionId}`);
      console.log(`Findings 수: ${item.findings?.length || 0}`);
      
      if (item.findings && item.findings.length > 0) {
        item.findings.forEach((finding, index) => {
          console.log(`  ${index + 1}. ${finding.issue}`);
          console.log(`     리소스: ${finding.resourceType}:${finding.resourceId}`);
          console.log(`     위험도: ${finding.riskLevel}`);
        });
      }
      console.log('---');
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkFindings();