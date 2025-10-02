#!/usr/bin/env node

/**
 * InspectionHistory DynamoDB 테이블 생성 스크립트
 * 
 * 이 스크립트는 AWS 리소스 검사 이력을 저장하기 위한 DynamoDB 테이블을 생성합니다.
 * 
 * 테이블 구조:
 * - Primary Key: customerId (HASH), inspectionId (RANGE)
 * - GSI 1: ServiceTypeIndex - customerId (HASH), serviceType (RANGE)
 * - GSI 2: TimestampIndex - customerId (HASH), timestamp (RANGE)
 * 
 * 사용법:
 * node scripts/create-inspection-history-table.js
 */

require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
  CreateTableCommand,
  DescribeTableCommand,
  waitUntilTableExists
} = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-northeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const tableName = process.env.AWS_DYNAMODB_INSPECTION_HISTORY_TABLE || 'InspectionHistory';

async function createInspectionHistoryTable() {
  try {
    console.log('🚀 InspectionHistory 테이블 생성을 시작합니다...');
    console.log(`테이블명: ${tableName}`);

    // 1. 테이블이 이미 존재하는지 확인
    console.log('\n1️⃣ 기존 테이블 존재 여부 확인 중...');
    
    try {
      const describeCommand = new DescribeTableCommand({ TableName: tableName });
      const existingTable = await client.send(describeCommand);
      
      if (existingTable.Table) {
        console.log('⚠️  테이블이 이미 존재합니다.');
        console.log(`   테이블 상태: ${existingTable.Table.TableStatus}`);
        console.log('   기존 테이블을 사용합니다.');
        return;
      }
    } catch (error) {
      if (error.name !== 'ResourceNotFoundException') {
        throw error;
      }
      console.log('✅ 새 테이블을 생성할 수 있습니다.');
    }

    // 2. 테이블 생성 파라미터 정의
    console.log('\n2️⃣ 테이블 스키마 정의 중...');
    
    const createTableParams = {
      TableName: tableName,
      
      // 키 스키마 정의
      KeySchema: [
        {
          AttributeName: 'customerId',
          KeyType: 'HASH'  // Partition Key
        },
        {
          AttributeName: 'inspectionId',
          KeyType: 'RANGE' // Sort Key
        }
      ],
      
      // 속성 정의
      AttributeDefinitions: [
        {
          AttributeName: 'customerId',
          AttributeType: 'S' // String
        },
        {
          AttributeName: 'inspectionId',
          AttributeType: 'S' // String
        },
        {
          AttributeName: 'serviceType',
          AttributeType: 'S' // String
        },
        {
          AttributeName: 'timestamp',
          AttributeType: 'N' // Number (Unix timestamp)
        }
      ],
      
      // Global Secondary Indexes
      GlobalSecondaryIndexes: [
        {
          IndexName: 'ServiceTypeIndex',
          KeySchema: [
            {
              AttributeName: 'customerId',
              KeyType: 'HASH'
            },
            {
              AttributeName: 'serviceType',
              KeyType: 'RANGE'
            }
          ],
          Projection: {
            ProjectionType: 'ALL'
          },
          BillingMode: 'PAY_PER_REQUEST'
        },
        {
          IndexName: 'TimestampIndex',
          KeySchema: [
            {
              AttributeName: 'customerId',
              KeyType: 'HASH'
            },
            {
              AttributeName: 'timestamp',
              KeyType: 'RANGE'
            }
          ],
          Projection: {
            ProjectionType: 'ALL'
          },
          BillingMode: 'PAY_PER_REQUEST'
        }
      ],
      
      // 빌링 모드 설정 (Pay-per-request)
      BillingMode: 'PAY_PER_REQUEST',
      
      // 테이블 태그
      Tags: [
        {
          Key: 'Environment',
          Value: process.env.NODE_ENV || 'development'
        },
        {
          Key: 'Service',
          Value: 'AWS-Resource-Inspection'
        },
        {
          Key: 'Purpose',
          Value: 'InspectionHistory'
        }
      ]
    };

    console.log('✅ 테이블 스키마 정의 완료');
    console.log('   Primary Key: customerId (HASH), inspectionId (RANGE)');
    console.log('   GSI 1: ServiceTypeIndex');
    console.log('   GSI 2: TimestampIndex');
    console.log('   Billing Mode: PAY_PER_REQUEST');

    // 3. 테이블 생성 실행
    console.log('\n3️⃣ 테이블 생성 중...');
    
    const createCommand = new CreateTableCommand(createTableParams);
    const createResult = await client.send(createCommand);
    
    console.log('✅ 테이블 생성 요청 완료');
    console.log(`   테이블 ARN: ${createResult.TableDescription.TableArn}`);

    // 4. 테이블 생성 완료 대기
    console.log('\n4️⃣ 테이블 활성화 대기 중...');
    console.log('   이 과정은 몇 분 소요될 수 있습니다...');
    
    await waitUntilTableExists(
      { client, maxWaitTime: 300 }, // 최대 5분 대기
      { TableName: tableName }
    );

    // 5. 최종 테이블 상태 확인
    console.log('\n5️⃣ 테이블 상태 최종 확인 중...');
    
    const finalDescribeCommand = new DescribeTableCommand({ TableName: tableName });
    const finalTable = await client.send(finalDescribeCommand);
    
    const table = finalTable.Table;
    
    console.log('\n🎉 InspectionHistory 테이블 생성 완료!');
    console.log('\n📋 테이블 정보:');
    console.log(`   테이블명: ${table.TableName}`);
    console.log(`   상태: ${table.TableStatus}`);
    console.log(`   생성일: ${table.CreationDateTime}`);
    console.log(`   빌링 모드: ${table.BillingModeSummary?.BillingMode || 'PROVISIONED'}`);
    
    console.log('\n🔑 Primary Key:');
    table.KeySchema.forEach(key => {
      console.log(`   ${key.AttributeName} (${key.KeyType === 'HASH' ? 'Partition Key' : 'Sort Key'})`);
    });
    
    console.log('\n🗂️  Global Secondary Indexes:');
    table.GlobalSecondaryIndexes?.forEach(index => {
      console.log(`   ${index.IndexName}:`);
      console.log(`     상태: ${index.IndexStatus}`);
      console.log(`     키: ${index.KeySchema.map(k => k.AttributeName).join(', ')}`);
    });

    console.log('\n✨ 테이블이 성공적으로 생성되었습니다!');
    console.log('\n🔧 다음 단계:');
    console.log('   - 테이블 검증: node scripts/verify-inspection-history-table.js');
    console.log('   - 샘플 데이터 생성: node scripts/seed-inspection-history.js');
    console.log('   - 애플리케이션 시작: npm start');

  } catch (error) {
    console.error('\n❌ 테이블 생성 중 오류 발생:', error.message);
    
    if (error.name === 'ResourceInUseException') {
      console.error('💡 테이블이 이미 존재하거나 생성 중입니다.');
    } else if (error.name === 'LimitExceededException') {
      console.error('💡 DynamoDB 테이블 생성 한도를 초과했습니다.');
    } else if (error.name === 'UnauthorizedOperation' || error.name === 'AccessDenied') {
      console.error('💡 AWS 권한을 확인해주세요. DynamoDB 테이블 생성 권한이 필요합니다.');
    } else {
      console.error('상세 오류:', error);
    }
    
    process.exit(1);
  }
}

// 스크립트 실행
if (require.main === module) {
  createInspectionHistoryTable();
}

module.exports = createInspectionHistoryTable;