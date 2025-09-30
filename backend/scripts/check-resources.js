ㅐ
require('dotenv').config();
const { cognitoService, dynamoService, stsService } = require('../services');

async function main() {
    console.log('=== AWS 리소스 및 서비스 확인 ===\n');

    try {
        // STS로 자격증명 확인
        console.log('🔍 AWS 자격증명 확인 중...');
        const identity = await stsService.getCallerIdentity();
        console.log('✅ AWS 자격증명 유효');
        console.log(`   계정 ID: ${identity.account}`);
        console.log(`   리전: ${process.env.AWS_REGION}`);

        // Cognito 서비스 확인
        console.log('\n🔍 Cognito 서비스 확인 중...');
        const cognitoUsers = await cognitoService.listUsers(1);
        console.log('✅ Cognito User Pool 연결 성공');
        console.log(`   User Pool ID: ${process.env.COGNITO_USER_POOL_ID}`);
        console.log(`   Client ID: ${process.env.COGNITO_CLIENT_ID}`);

        // DynamoDB 서비스 확인
        console.log('\n🔍 DynamoDB 서비스 확인 중...');
        const dynamoUsers = await dynamoService.getAllUsers();
        console.log('✅ DynamoDB 테이블 연결 성공');
        console.log(`   테이블명: ${process.env.DYNAMODB_TABLE_NAME}`);
        console.log(`   현재 사용자 수: ${dynamoUsers.count}`);

        console.log('\n🎉 모든 AWS 리소스가 정상적으로 설정되었습니다!');

    } catch (error) {
        console.error('\n❌ 오류 발생:', error.message);
        console.log('\n📝 확인사항:');
        console.log('1. .env 파일의 AWS 자격증명이 올바른지 확인');
        console.log('2. AWS 리소스가 생성되었는지 확인');
        console.log('3. 필요한 IAM 권한이 있는지 확인');
    }
}

main();