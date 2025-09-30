#!/usr/bin/env node

/**
 * DynamoDB 테이블 상태 확인 스크립트
 * 
 * 사용법:
 * node scripts/check-dynamodb-table.js
 */

require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
  DescribeTableCommand,
  ScanCommand 
} = require('@aws-sdk/client-dynamodb');
const { dynamoDBDocClient } = require('../config/aws');

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-northeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const tableName = process.env.AWS_DYNAMODB_TABLE_NAME || 'aws_v2';

async function checkTable() {
  try {
    console.log('🔍 DynamoDB 테이블 상태 확인 중...');
    console.log(`테이블명: ${tableName}`);

    // 1. 테이블 메타데이터 확인
    console.log('\n1️⃣ 테이블 메타데이터 확인...');
    
    const describeParams = {
      TableName: tableName
    };
    const describeCommand = new DescribeTableCommand(describeParams);
    const tableInfo = await client.send(describeCommand);
    
    const table = tableInfo.Table;
    
    console.log('✅ 테이블 정보:');
    console.log(`   테이블명: ${table.TableName}`);
    console.log(`   상태: ${table.TableStatus}`);
    console.log(`   생성일: ${table.CreationDateTime}`);
    console.log(`   아이템 수: ${table.ItemCount || 0}`);
    console.log(`   테이블 크기: ${table.TableSizeBytes || 0} bytes`);
    console.log(`   빌링 모드: ${table.BillingModeSummary?.BillingMode || 'PROVISIONED'}`);

    // Primary Key 정보
    console.log('\n🔑 Primary Key:');
    table.KeySchema.forEach(key => {
      console.log(`   ${key.AttributeName} (${key.KeyType === 'HASH' ? 'Partition Key' : 'Sort Key'})`);
    });

    // 속성 정의
    console.log('\n📝 속성 정의:');
    table.AttributeDefinitions.forEach(attr => {
      console.log(`   ${attr.AttributeName}: ${attr.AttributeType}`);
    });

    // Global Secondary Indexes
    if (table.GlobalSecondaryIndexes && table.GlobalSecondaryIndexes.length > 0) {
      console.log('\n🗂️  Global Secondary Indexes:');
      table.GlobalSecondaryIndexes.forEach(index => {
        console.log(`   ${index.IndexName}:`);
        console.log(`     상태: ${index.IndexStatus}`);
        console.log(`     키: ${index.KeySchema.map(k => k.AttributeName).join(', ')}`);
        console.log(`     프로젝션: ${index.Projection.ProjectionType}`);
        console.log(`     아이템 수: ${index.ItemCount || 0}`);
      });
    }

    // 2. 테이블 데이터 샘플 확인
    console.log('\n2️⃣ 테이블 데이터 샘플 확인...');
    
    const scanParams = {
      TableName: tableName,
      Limit: 5 // 최대 5개 아이템만 조회
    };
    
    const scanResult = await dynamoDBDocClient.send(new ScanCommand(scanParams));
    
    if (scanResult.Items && scanResult.Items.length > 0) {
      console.log(`✅ ${scanResult.Items.length}개의 아이템 발견:`);
      
      scanResult.Items.forEach((item, index) => {
        console.log(`\n   아이템 ${index + 1}:`);
        console.log(`     userId: ${item.userId?.S || item.userId || 'N/A'}`);
        console.log(`     username: ${item.username?.S || item.username || 'N/A'}`);
        console.log(`     companyName: ${item.companyName?.S || item.companyName || 'N/A'}`);
        console.log(`     status: ${item.status?.S || item.status || 'N/A'}`);
        console.log(`     isAdmin: ${item.isAdmin?.BOOL !== undefined ? item.isAdmin.BOOL : (item.isAdmin || 'N/A')}`);
        console.log(`     createdAt: ${item.createdAt?.S || item.createdAt || 'N/A'}`);
      });
      
      if (scanResult.Count > 5) {
        console.log(`\n   ... 그리고 ${scanResult.Count - 5}개 더`);
      }
    } else {
      console.log('📭 테이블이 비어있습니다.');
    }

    // 3. 테이블 상태 요약
    console.log('\n📊 테이블 상태 요약:');
    
    const isHealthy = table.TableStatus === 'ACTIVE' && 
                     (!table.GlobalSecondaryIndexes || 
                      table.GlobalSecondaryIndexes.every(idx => idx.IndexStatus === 'ACTIVE'));
    
    if (isHealthy) {
      console.log('✅ 테이블이 정상 상태입니다.');
      console.log('✅ 모든 인덱스가 활성화되어 있습니다.');
      console.log('✅ 애플리케이션에서 사용할 준비가 되었습니다.');
    } else {
      console.log('⚠️  테이블 또는 인덱스가 아직 준비되지 않았습니다.');
      
      if (table.TableStatus !== 'ACTIVE') {
        console.log(`   테이블 상태: ${table.TableStatus}`);
      }
      
      if (table.GlobalSecondaryIndexes) {
        table.GlobalSecondaryIndexes.forEach(index => {
          if (index.IndexStatus !== 'ACTIVE') {
            console.log(`   인덱스 ${index.IndexName} 상태: ${index.IndexStatus}`);
          }
        });
      }
    }

    console.log('\n🔧 사용 가능한 작업:');
    console.log('   - 관리자 계정 생성: node scripts/create-admin-user.js');
    console.log('   - 애플리케이션 시작: npm start');
    console.log('   - 테이블 재생성: node scripts/create-dynamodb-table.js');

  } catch (error) {
    console.error('\n❌ 테이블 확인 중 오류 발생:', error.message);
    
    if (error.name === 'ResourceNotFoundException') {
      console.error('💡 테이블이 존재하지 않습니다. 다음 명령으로 생성하세요:');
      console.error('   node scripts/create-dynamodb-table.js');
    } else if (error.name === 'UnauthorizedOperation' || error.name === 'AccessDenied') {
      console.error('💡 AWS 권한을 확인해주세요. DynamoDB 읽기 권한이 필요합니다.');
    } else {
      console.error('상세 오류:', error);
    }
    
    process.exit(1);
  }
}

// 스크립트 실행
if (require.main === module) {
  checkTable();
}

module.exports = checkTable;