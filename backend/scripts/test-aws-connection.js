/**
 * AWS 연결 테스트 스크립트
 * AWS 자격 증명과 서비스 연결을 확인합니다.
 */

require('dotenv').config();
const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');

async function testAWSConnection() {
  console.log('🔍 AWS 연결 테스트 시작...\n');
  
  // 환경 변수 확인
  console.log('📋 환경 변수 확인:');
  console.log(`AWS_REGION: ${process.env.AWS_REGION}`);
  console.log(`AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? '설정됨' : '설정되지 않음'}`);
  console.log(`AWS_SECRET_ACCESS_KEY: ${process.env.AWS_SECRET_ACCESS_KEY ? '설정됨' : '설정되지 않음'}`);
  console.log(`AWS_COGNITO_USER_POOL_ID: ${process.env.AWS_COGNITO_USER_POOL_ID}`);
  console.log(`AWS_COGNITO_CLIENT_ID: ${process.env.AWS_COGNITO_CLIENT_ID}`);
  console.log(`AWS_DYNAMODB_TABLE_NAME: ${process.env.AWS_DYNAMODB_TABLE_NAME}\n`);

  // STS를 통한 자격 증명 확인
  try {
    const stsClient = new STSClient({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    console.log('🔐 AWS 자격 증명 확인 중...');
    const command = new GetCallerIdentityCommand({});
    const result = await stsClient.send(command);
    
    console.log('✅ AWS 자격 증명 성공!');
    console.log(`계정 ID: ${result.Account}`);
    console.log(`사용자 ARN: ${result.Arn}`);
    console.log(`사용자 ID: ${result.UserId}\n`);
    
    return true;
  } catch (error) {
    console.error('❌ AWS 자격 증명 실패:');
    console.error(`오류: ${error.message}\n`);
    return false;
  }
}

// 스크립트 실행
testAWSConnection()
  .then((success) => {
    if (success) {
      console.log('🎉 AWS 연결 테스트 완료! 모든 설정이 올바릅니다.');
    } else {
      console.log('⚠️  AWS 연결 테스트 실패. 자격 증명을 확인해주세요.');
      console.log('\n💡 해결 방법:');
      console.log('1. .env 파일의 AWS_ACCESS_KEY_ID와 AWS_SECRET_ACCESS_KEY를 확인하세요.');
      console.log('2. AWS IAM에서 해당 키가 활성화되어 있는지 확인하세요.');
      console.log('3. 필요한 권한(Cognito, DynamoDB)이 있는지 확인하세요.');
    }
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('💥 예상치 못한 오류:', error);
    process.exit(1);
  });