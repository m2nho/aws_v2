const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
require('dotenv').config();

const client = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1'
}));

async function checkData() {
  try {
    // InspectionItemResults 테이블 확인
    const itemsResult = await client.send(new ScanCommand({
      TableName: process.env.AWS_DYNAMODB_INSPECTION_ITEMS_TABLE || 'InspectionItemResults',
      Limit: 20
    }));
    
    console.log('=== InspectionItemResults 테이블 ===');
    console.log('총 아이템 수:', itemsResult.Count);
    
    // 보안 그룹 관련 항목만 필터링
    const securityGroupItems = itemsResult.Items.filter(item => 
      item.itemId === 'security_groups' || item.itemName?.includes('보안 그룹')
    );
    
    console.log('\n=== 보안 그룹 관련 항목들 ===');
    securityGroupItems.forEach((item, index) => {
      console.log(`${index + 1}. ${item.serviceType}#${item.itemId} - ${item.itemName}`);
      console.log(`   검사 ID: ${item.lastInspectionId}`);
      console.log(`   시간: ${new Date(item.lastInspectionTime).toLocaleString()}`);
      console.log(`   상태: ${item.status}, 문제: ${item.issuesFound}개`);
      console.log(`   itemKey: ${item.itemKey}`);
      console.log('');
    });
    
    // 전체 항목들 요약
    console.log('\n=== 전체 항목 요약 ===');
    const itemSummary = {};
    itemsResult.Items.forEach(item => {
      const key = `${item.serviceType}#${item.itemId}`;
      if (!itemSummary[key]) {
        itemSummary[key] = [];
      }
      itemSummary[key].push({
        inspectionId: item.lastInspectionId,
        time: new Date(item.lastInspectionTime).toLocaleString(),
        itemKey: item.itemKey
      });
    });
    
    Object.entries(itemSummary).forEach(([key, items]) => {
      console.log(`${key}: ${items.length}개 기록`);
      items.forEach((item, index) => {
        console.log(`  ${index + 1}. ${item.inspectionId} (${item.time}) - itemKey: ${item.itemKey}`);
      });
      console.log('');
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkData();