const { DynamoDBDocumentClient, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
require('dotenv').config();

const client = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1'
}));

async function cleanupDuplicateItems() {
  try {
    console.log('=== 중복 항목 정리 시작 ===');
    
    // 모든 항목 조회
    const itemsResult = await client.send(new ScanCommand({
      TableName: process.env.AWS_DYNAMODB_INSPECTION_ITEMS_TABLE || 'InspectionItemResults'
    }));
    
    console.log(`총 ${itemsResult.Items.length}개 항목 발견`);
    
    // 같은 검사 ID를 가진 항목들 그룹화
    const inspectionGroups = {};
    itemsResult.Items.forEach(item => {
      const inspectionId = item.lastInspectionId;
      if (!inspectionGroups[inspectionId]) {
        inspectionGroups[inspectionId] = [];
      }
      inspectionGroups[inspectionId].push(item);
    });
    
    // 중복 항목 찾기 및 정리
    for (const [inspectionId, items] of Object.entries(inspectionGroups)) {
      if (items.length > 1) {
        console.log(`\n검사 ID ${inspectionId}에 ${items.length}개 항목 발견:`);
        items.forEach((item, index) => {
          console.log(`  ${index + 1}. ${item.itemKey} - ${item.itemName} (${item.issuesFound}개 문제)`);
        });
        
        // 보안 그룹 검사인 경우, network_access 항목 삭제
        const securityGroupItem = items.find(item => item.itemId === 'security_groups');
        const networkAccessItem = items.find(item => item.itemId === 'network_access');
        
        if (securityGroupItem && networkAccessItem) {
          console.log(`  → network_access 항목을 삭제하고 security_groups에 통합`);
          
          // network_access 항목의 findings를 security_groups에 추가
          const combinedFindings = [...securityGroupItem.findings, ...networkAccessItem.findings];
          
          // security_groups 항목 업데이트 (여기서는 삭제만 수행)
          await client.send(new DeleteCommand({
            TableName: process.env.AWS_DYNAMODB_INSPECTION_ITEMS_TABLE || 'InspectionItemResults',
            Key: {
              customerId: networkAccessItem.customerId,
              itemKey: networkAccessItem.itemKey
            }
          }));
          
          console.log(`  ✅ ${networkAccessItem.itemKey} 삭제 완료`);
        }
      }
    }
    
    console.log('\n=== 정리 완료 ===');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

cleanupDuplicateItems();