/**
 * AWS Cognito 설정 확인 스크립트
 * User Pool Client의 인증 플로우 설정을 확인합니다.
 */

require('dotenv').config();
const { 
  CognitoIdentityProviderClient, 
  DescribeUserPoolClientCommand,
  UpdateUserPoolClientCommand 
} = require('@aws-sdk/client-cognito-identity-provider');

async function checkCognitoConfig() {
  console.log('🔍 AWS Cognito 설정 확인 중...\n');

  const client = new CognitoIdentityProviderClient({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  try {
    // User Pool Client 설정 확인
    const describeCommand = new DescribeUserPoolClientCommand({
      UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
      ClientId: process.env.AWS_COGNITO_CLIENT_ID,
    });

    const result = await client.send(describeCommand);
    const clientConfig = result.UserPoolClient;

    console.log('📋 현재 User Pool Client 설정:');
    console.log(`Client Name: ${clientConfig.ClientName}`);
    console.log(`Client ID: ${clientConfig.ClientId}`);
    console.log(`Explicit Auth Flows: ${JSON.stringify(clientConfig.ExplicitAuthFlows, null, 2)}`);
    console.log(`Supported Identity Providers: ${JSON.stringify(clientConfig.SupportedIdentityProviders, null, 2)}\n`);

    // ALLOW_ADMIN_USER_PASSWORD_AUTH 플로우가 활성화되어 있는지 확인
    const hasAdminUserPasswordAuth = clientConfig.ExplicitAuthFlows?.includes('ALLOW_ADMIN_USER_PASSWORD_AUTH');
    
    if (hasAdminUserPasswordAuth) {
      console.log('✅ ALLOW_ADMIN_USER_PASSWORD_AUTH 플로우가 활성화되어 있습니다.');
      return true;
    } else {
      console.log('❌ ALLOW_ADMIN_USER_PASSWORD_AUTH 플로우가 비활성화되어 있습니다.');
      console.log('\n🔧 자동으로 활성화하시겠습니까? (y/n)');
      
      // 자동으로 활성화 시도
      console.log('🔧 ALLOW_ADMIN_USER_PASSWORD_AUTH 플로우를 활성화합니다...');
      
      const updateCommand = new UpdateUserPoolClientCommand({
        UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
        ClientId: process.env.AWS_COGNITO_CLIENT_ID,
        ExplicitAuthFlows: [
          'ALLOW_ADMIN_USER_PASSWORD_AUTH',
          'ALLOW_REFRESH_TOKEN_AUTH',
          'ALLOW_USER_PASSWORD_AUTH',
          'ALLOW_USER_SRP_AUTH'
        ],
      });

      await client.send(updateCommand);
      console.log('✅ ALLOW_ADMIN_USER_PASSWORD_AUTH 플로우가 활성화되었습니다!');
      return true;
    }

  } catch (error) {
    console.error('❌ Cognito 설정 확인 실패:');
    console.error(`오류: ${error.message}`);
    return false;
  }
}

// 스크립트 실행
checkCognitoConfig()
  .then((success) => {
    if (success) {
      console.log('\n🎉 Cognito 설정 확인 완료! 이제 로그인이 정상적으로 작동할 것입니다.');
    } else {
      console.log('\n⚠️  Cognito 설정 확인 실패. AWS 콘솔에서 수동으로 설정해주세요.');
      console.log('\n💡 수동 설정 방법:');
      console.log('1. AWS 콘솔 > Cognito > User Pools로 이동');
      console.log('2. 해당 User Pool 선택');
      console.log('3. App integration 탭 > App clients 선택');
      console.log('4. 해당 클라이언트 편집');
      console.log('5. Authentication flows에서 "ALLOW_ADMIN_USER_PASSWORD_AUTH" 체크');
    }
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('💥 예상치 못한 오류:', error);
    process.exit(1);
  });