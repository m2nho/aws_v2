const { 
  CognitoIdentityProviderClient 
} = require('@aws-sdk/client-cognito-identity-provider');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { STSClient } = require('@aws-sdk/client-sts');

// AWS 클라이언트 설정
const awsConfig = {
  region: process.env.AWS_REGION || 'ap-northeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

// AWS 클라이언트 인스턴스 생성
const cognitoClient = new CognitoIdentityProviderClient(awsConfig);
const dynamoDBClient = new DynamoDBClient(awsConfig);
const dynamoDBDocClient = DynamoDBDocumentClient.from(dynamoDBClient, {
  marshallOptions: {
    removeUndefinedValues: true
  }
});
const stsClient = new STSClient(awsConfig);

module.exports = {
  cognitoClient,
  dynamoDBClient,
  dynamoDBDocClient,
  stsClient,
  awsConfig,
};