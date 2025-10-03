const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

require('dotenv').config();

const client = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1'
}));

async function debugCurrentData() {
  try {
    console.log('=== 현재 데이터 구조 확인 ===');
    
    const customerId = '0b2294d8-7fc2-4122-b5aa-71c107a615a5';
    
    // 1. 최신 검사 히스토리 확인
    console.log('\n1. 최신 검사 히스토리 확인...');
    const historyResult = await client.send(new QueryCommand({
      TableName: process.env.AWS_DYNAMODB_INSPECTION_HISTORY_TABLE || 'InspectionHistory',
      KeyConditionExpression: 'customerId = :customerId',
      ExpressionAttributeValues: {
        ':customerId': customerId
      },
      ScanIndexForward: false,
      Limit: 1
    }));
    
    if (historyResult.Items && historyResult.Items.length > 0) {
      const latestInspection = historyResult.Items[0];
      console.log('✅ 최신 검사 발견:');
      console.log('  - Inspection ID:', latestInspection.inspectionId);
      console.log('  - Service Type:', latestInspection.serviceType);
      console.log('  - Status:', latestInspection.status);
      console.log('  - Has Results:', !!latestInspection.results);
      console.log('  - Has itemSummary:', !!latestInspection.itemSummary);
      
      if (latestInspection.results) {
        console.log('\n📊 Results 구조:');
        console.log('  - Summary:', JSON.stringify(latestInspection.results.summary, null, 2));
        console.log('  - Findings Count:', latestInspection.results.findings?.length || 0);
        
        if (latestInspection.results.findings && latestInspection.results.findings.length > 0) {
          console.log('\n🔍 첫 번째 Finding 구조:');
          const firstFinding = latestInspection.results.findings[0];
          console.log('  Keys:', Object.keys(firstFinding));
          console.log('  - resourceId:', firstFinding.resourceId);
          console.log('  - resourceType:', firstFinding.resourceType);
          console.log('  - issue:', firstFinding.issue);
          console.log('  - riskLevel:', firstFinding.riskLevel);
          console.log('  - has description:', !!firstFinding.description);
          console.log('  - has impact:', !!firstFinding.impact);
          console.log('  - has remediation:', !!firstFinding.remediation);
          console.log('  - has complianceInfo:', !!firstFinding.complianceInfo);
        }
      }
      
      if (latestInspection.itemSummary) {
        console.log('\n📋 ItemSummary 구조:');
        latestInspection.itemSummary.forEach((item, index) => {
          console.log(`  ${index + 1}. ${item.itemName} - ${item.status} (${item.riskLevel})`);
          console.log(`     Issues: ${item.issuesFound}, Score: ${item.score}`);
        });
      }
      
      // 2. 해당 검사의 항목별 결과 확인
      console.log('\n2. 검사 항목별 결과 확인...');
      const itemsResult = await client.send(new QueryCommand({
        TableName: process.env.AWS_DYNAMODB_INSPECTION_ITEMS_TABLE || 'InspectionItemResults',
        KeyConditionExpression: 'customerId = :customerId',
        FilterExpression: 'lastInspectionId = :inspectionId',
        ExpressionAttributeValues: {
          ':customerId': customerId,
          ':inspectionId': latestInspection.inspectionId
        }
      }));
      
      console.log(`✅ 항목별 결과: ${itemsResult.Items?.length || 0}개`);
      
      if (itemsResult.Items && itemsResult.Items.length > 0) {
        itemsResult.Items.forEach((item, index) => {
          console.log(`\n📋 항목 ${index + 1}: ${item.itemName}`);
          console.log('  - Status:', item.status);
          console.log('  - Risk Level:', item.riskLevel);
          console.log('  - Issues Found:', item.issuesFound);
          console.log('  - Has findings:', !!(item.findings && item.findings.length > 0));
          console.log('  - Has findingsSummary:', !!(item.findingsSummary && item.findingsSummary.length > 0));
          
          const findings = item.findings || item.findingsSummary || [];
          if (findings.length > 0) {
            console.log('  🔍 첫 번째 Finding:');
            const firstFinding = findings[0];
            console.log('    - Issue:', firstFinding.issue);
            console.log('    - Resource:', firstFinding.resourceType, firstFinding.resourceId);
            console.log('    - Risk Level:', firstFinding.riskLevel);
            console.log('    - Has description:', !!firstFinding.description);
            console.log('    - Has recommendation:', !!firstFinding.recommendation);
          }
        });
      }
      
    } else {
      console.log('❌ 검사 히스토리가 없습니다.');
    }
    
  } catch (error) {
    console.error('디버깅 중 오류:', error);
  }
}

debugCurrentData();