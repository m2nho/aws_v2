#!/usr/bin/env node

/**
 * 관리자 사용자 생성 스크립트
 * 
 * 사용법:
 * node scripts/create-admin-user.js <username> <password> <companyName>
 * 
 * 예시:
 * node scripts/create-admin-user.js admin@company.com AdminPassword123! "관리자회사"
 */

require('dotenv').config();
const cognitoService = require('../services/cognitoService');
const dynamoService = require('../services/dynamoService');

async function createAdminUser() {
  try {
    // 명령행 인수 확인
    const args = process.argv.slice(2);
    if (args.length < 3) {
      console.error('사용법: node scripts/create-admin-user.js <username> <password> <companyName>');
      console.error('예시: node scripts/create-admin-user.js admin@company.com AdminPassword123! "관리자회사"');
      process.exit(1);
    }

    const [username, password, companyName] = args;

    console.log('🚀 관리자 사용자 생성을 시작합니다...');
    console.log(`사용자명: ${username}`);
    console.log(`회사명: ${companyName}`);

    // 1. 기존 사용자 확인
    console.log('\n1️⃣ 기존 사용자 확인 중...');
    const existingUser = await dynamoService.getUserByUsername(username);
    if (existingUser.success) {
      console.error(`❌ 오류: 사용자 '${username}'이 이미 존재합니다.`);
      process.exit(1);
    }

    // 2. Cognito에 사용자 생성
    console.log('2️⃣ AWS Cognito에 사용자 생성 중...');
    const cognitoResult = await cognitoService.createUser(username, password);
    
    if (!cognitoResult.success) {
      console.error('❌ Cognito 사용자 생성 실패:', cognitoResult.error);
      process.exit(1);
    }

    console.log('✅ Cognito 사용자 생성 완료');
    console.log(`   Cognito Sub: ${cognitoResult.cognitoSub}`);

    // 3. DynamoDB에 관리자 메타데이터 저장
    console.log('3️⃣ DynamoDB에 관리자 메타데이터 저장 중...');
    const dynamoResult = await dynamoService.createUser({
      username,
      companyName,
      roleArn: 'arn:aws:iam::admin:role/AdminRole', // 관리자용 기본 ARN
      isAdmin: true // 관리자 권한 부여
    });

    if (!dynamoResult.success) {
      console.error('❌ DynamoDB 저장 실패, Cognito 사용자 롤백 중...');
      try {
        await cognitoService.deleteUser(username);
        console.log('✅ Cognito 사용자 롤백 완료');
      } catch (rollbackError) {
        console.error('❌ 롤백 실패:', rollbackError.message);
      }
      console.error('DynamoDB 오류:', dynamoResult.error);
      process.exit(1);
    }

    // 4. 관리자 상태를 'approved'로 변경
    console.log('4️⃣ 관리자 상태를 승인됨으로 변경 중...');
    const statusResult = await dynamoService.updateUserStatus(dynamoResult.userId, 'approved');
    
    if (!statusResult.success) {
      console.error('❌ 상태 업데이트 실패:', statusResult.error);
    } else {
      console.log('✅ 관리자 상태 업데이트 완료');
    }

    console.log('\n🎉 관리자 사용자 생성이 완료되었습니다!');
    console.log('📋 생성된 관리자 정보:');
    console.log(`   사용자 ID: ${dynamoResult.userId}`);
    console.log(`   사용자명: ${username}`);
    console.log(`   회사명: ${companyName}`);
    console.log(`   관리자 권한: 예`);
    console.log(`   상태: approved`);
    console.log('\n✨ 이제 이 계정으로 로그인하여 관리자 패널에 접근할 수 있습니다.');

  } catch (error) {
    console.error('\n❌ 관리자 사용자 생성 중 오류 발생:', error.message);
    console.error('상세 오류:', error);
    process.exit(1);
  }
}

// 스크립트 실행
if (require.main === module) {
  createAdminUser();
}

module.exports = createAdminUser;