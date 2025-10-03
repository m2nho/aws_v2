/**
 * 검사 항목 분류 수정 스크립트
 * network_access로 잘못 분류된 보안 그룹 관련 항목들을 security_groups로 통합
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand, DeleteCommand, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

require('dotenv').config();

const client = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1'
}));

const ITEMS_TABLE = process.env.AWS_DYNAMODB_INSPECTION_ITEMS_TABLE || 'InspectionItemResults';

async function fixItemClassification() {
  try {
    console.log('=== 검사 항목 분류 수정 시작 ===');
    
    // 1. 모든 network_access 항목 조회
    console.log('\n1. network_access 항목들 조회 중...');
    const scanResult = await client.send(new ScanCommand({
      TableName: ITEMS_TABLE,
      FilterExpression: 'itemId = :itemId',
      ExpressionAttributeValues: {
        ':itemId': 'network_access'
      }
    }));
    
    const networkAccessItems = scanResult.Items || [];
    console.log(`발견된 network_access 항목: ${networkAccessItems.length}개`);
    
    if (networkAccessItems.length === 0) {
      console.log('수정할 항목이 없습니다.');
      return;
    }
    
    // 2. 각 고객별로 security_groups 항목과 통합
    const customerGroups = {};
    networkAccessItems.forEach(item => {
      if (!customerGroups[item.customerId]) {
        customerGroups[item.customerId] = [];
      }
      customerGroups[item.customerId].push(item);
    });
    
    console.log(`\n2. ${Object.keys(customerGroups).length}명의 고객 데이터 처리 중...`);
    
    for (const [customerId, items] of Object.entries(customerGroups)) {
      console.log(`\n고객 ${customerId} 처리 중...`);
      
      // 기존 security_groups 항목 조회
      const existingSecurityGroupsKey = `EC2#security_groups`;
      let existingItem = null;
      
      try {
        const getResult = await client.send(new GetCommand({
          TableName: ITEMS_TABLE,
          Key: {
            customerId: customerId,
            itemKey: existingSecurityGroupsKey
          }
        }));
        existingItem = getResult.Item;
      } catch (error) {
        console.log(`  기존 security_groups 항목 조회 실패: ${error.message}`);
      }
      
      // network_access 항목들을 security_groups로 통합
      for (const networkItem of items) {
        if (existingItem) {
          // 기존 security_groups 항목이 있으면 통합
          const updatedFindings = [...(existingItem.findings || []), ...(networkItem.findings || [])];
          const updatedRecommendations = [...new Set([...(existingItem.recommendations || []), ...(networkItem.recommendations || [])])];
          const totalIssues = (existingItem.issuesFound || 0) + (networkItem.issuesFound || 0);
          const maxRiskLevel = getRiskPriority(existingItem.riskLevel) > getRiskPriority(networkItem.riskLevel) 
            ? existingItem.riskLevel : networkItem.riskLevel;
          const minScore = Math.min(existingItem.score || 100, networkItem.score || 100);
          
          await client.send(new UpdateCommand({
            TableName: ITEMS_TABLE,
            Key: {
              customerId: customerId,
              itemKey: existingSecurityGroupsKey
            },
            UpdateExpression: 'SET findings = :findings, recommendations = :recommendations, issuesFound = :issuesFound, riskLevel = :riskLevel, score = :score, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
              ':findings': updatedFindings,
              ':recommendations': updatedRecommendations,
              ':issuesFound': totalIssues,
              ':riskLevel': maxRiskLevel,
              ':score': minScore,
              ':updatedAt': Date.now()
            }
          }));
          
          console.log(`  ✅ 기존 security_groups 항목에 통합 완료`);
        } else {
          // 기존 항목이 없으면 network_access를 security_groups로 변환
          const updatedItem = {
            ...networkItem,
            itemKey: existingSecurityGroupsKey,
            itemId: 'security_groups',
            itemName: '보안 그룹 규칙',
            updatedAt: Date.now()
          };
          
          await client.send(new PutCommand({
            TableName: ITEMS_TABLE,
            Item: updatedItem
          }));
          
          console.log(`  ✅ network_access를 security_groups로 변환 완료`);
          existingItem = updatedItem; // 다음 항목 처리를 위해 설정
        }
        
        // 기존 network_access 항목 삭제
        await client.send(new DeleteCommand({
          TableName: ITEMS_TABLE,
          Key: {
            customerId: customerId,
            itemKey: networkItem.itemKey
          }
        }));
        
        console.log(`  🗑️  network_access 항목 삭제 완료`);
      }
    }
    
    console.log('\n=== 검사 항목 분류 수정 완료 ===');
    console.log('모든 network_access 항목이 security_groups로 통합되었습니다.');
    
  } catch (error) {
    console.error('수정 중 오류 발생:', error);
  }
}

function getRiskPriority(riskLevel) {
  const priorities = {
    'LOW': 1,
    'MEDIUM': 2,
    'HIGH': 3,
    'CRITICAL': 4
  };
  return priorities[riskLevel] || 0;
}

// 스크립트 실행
if (require.main === module) {
  fixItemClassification();
}

module.exports = { fixItemClassification };