#!/usr/bin/env node

/**
 * DynamoDB 테이블 인덱스 설정 스크립트
 * 
 * 이 스크립트는 다음 인덱스들을 생성합니다:
 * 1. username-index (기존)
 * 2. cognito-sub-index (새로 추가)
 * 
 * 사용법:
 * node scripts/setup-dynamodb-indexes.js
 */

require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
  UpdateTableCommand,
  DescribeTableCommand 
} = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const tableName = process.env.AWS_DYNAMODB_TABLE_NAME || 'aws_v2';

async function setupIndexes() {
  try {
    console.log('🚀 DynamoDB 인덱스 설정을 시작합니다...');
    console.log(`테이블명: ${tableName}`);

    // 1. 현재 테이블 상태 확인
    console.log('\n1️⃣ 현재 테이블 상태 확인 중...');
    const describeParams = {
      TableName: tableName
    };

    const describeCommand = new DescribeTableCommand(describeParams);
    const tableDescription = await client.send(describeCommand);
    
    console.log('✅ 테이블 상태 확인 완료');
    console.log(`   테이블 상태: ${tableDescription.Table.TableStatus}`);
    
    // 기존 인덱스 확인
    const existingIndexes = tableDescription.Table.GlobalSecondaryIndexes || [];
    const indexNames = existingIndexes.map(index => index.IndexName);
    
    console.log(`   기존 인덱스: ${indexNames.length > 0 ? indexNames.join(', ') : '없음'}`);

    // 2. cognito-sub-index가 없으면 생성
    if (!indexNames.includes('cognito-sub-index')) {
      console.log('\n2️⃣ cognito-sub-index 생성 중...');
      
      const updateParams = {
        TableName: tableName,
        AttributeDefinitions: [
          {
            AttributeName: 'cognitoSub',
            AttributeType: 'S'
          }
        ],
        GlobalSecondaryIndexUpdates: [
          {
            Create: {
              IndexName: 'cognito-sub-index',
              KeySchema: [
                {
                  AttributeName: 'cognitoSub',
                  KeyType: 'HASH'
                }
              ],
              Projection: {
                ProjectionType: 'ALL'
              }
            }
          }
        ]
      };

      const updateCommand = new UpdateTableCommand(updateParams);
      await client.send(updateCommand);
      
      console.log('✅ cognito-sub-index 생성 요청 완료');
      console.log('⏳ 인덱스 생성이 완료될 때까지 기다려주세요 (몇 분 소요될 수 있습니다)');
      
      // 인덱스 생성 완료 대기
      let indexReady = false;
      let attempts = 0;
      const maxAttempts = 30; // 최대 5분 대기
      
      while (!indexReady && attempts < maxAttempts) {
        attempts++;
        console.log(`   인덱스 상태 확인 중... (${attempts}/${maxAttempts})`);
        
        await new Promise(resolve => setTimeout(resolve, 10000)); // 10초 대기
        
        const checkCommand = new DescribeTableCommand(describeParams);
        const checkResult = await client.send(checkCommand);
        
        const cognitoSubIndex = checkResult.Table.GlobalSecondaryIndexes?.find(
          index => index.IndexName === 'cognito-sub-index'
        );
        
        if (cognitoSubIndex && cognitoSubIndex.IndexStatus === 'ACTIVE') {
          indexReady = true;
          console.log('✅ cognito-sub-index 생성 완료!');
        }
      }
      
      if (!indexReady) {
        console.log('⚠️  인덱스 생성이 아직 진행 중입니다. AWS 콘솔에서 상태를 확인해주세요.');
      }
    } else {
      console.log('\n2️⃣ cognito-sub-index가 이미 존재합니다.');
    }

    // 3. username-index 확인
    if (!indexNames.includes('username-index')) {
      console.log('\n⚠️  username-index가 존재하지 않습니다.');
      console.log('   이 인덱스는 기존 시스템에서 필요합니다. 수동으로 생성해주세요.');
    } else {
      console.log('\n3️⃣ username-index 확인 완료 ✅');
    }

    console.log('\n🎉 DynamoDB 인덱스 설정이 완료되었습니다!');
    console.log('\n📋 설정된 인덱스:');
    console.log('   - username-index: 사용자명으로 검색');
    console.log('   - cognito-sub-index: Cognito Sub로 검색');
    console.log('\n✨ 이제 Cognito Sub와 DynamoDB 사용자를 연결할 수 있습니다.');

  } catch (error) {
    console.error('\n❌ 인덱스 설정 중 오류 발생:', error.message);
    
    if (error.name === 'ResourceInUseException') {
      console.error('💡 테이블이 업데이트 중입니다. 잠시 후 다시 시도해주세요.');
    } else if (error.name === 'ResourceNotFoundException') {
      console.error('💡 테이블을 찾을 수 없습니다. 테이블명을 확인해주세요.');
    } else {
      console.error('상세 오류:', error);
    }
    
    process.exit(1);
  }
}

// 스크립트 실행
if (require.main === module) {
  setupIndexes();
}

module.exports = setupIndexes;