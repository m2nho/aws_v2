/**
 * Application configuration
 * Centralizes all environment variables and configuration settings
 */

require('dotenv').config();

const config = {
  // Server configuration
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Frontend configuration
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  
  // AWS configuration
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    userPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
    userPoolClientId: process.env.AWS_COGNITO_CLIENT_ID,
    dynamodbTableName: process.env.AWS_DYNAMODB_TABLE_NAME || 'Users'
  },
  
  // JWT configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },
  
  // Security configuration
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
  }
};

// Validate required environment variables
const requiredEnvVars = [
  'AWS_COGNITO_USER_POOL_ID',
  'AWS_COGNITO_CLIENT_ID'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0 && config.nodeEnv === 'production') {
  console.error('Missing required environment variables:', missingEnvVars);
  process.exit(1);
}

if (missingEnvVars.length > 0 && config.nodeEnv !== 'production') {
  console.warn('Warning: Missing environment variables (OK for development):', missingEnvVars);
}

module.exports = config;