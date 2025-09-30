const app = require('./app');
const config = require('./config');

const PORT = config.port;

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📊 Environment: ${config.nodeEnv}`);
  console.log(`🌐 Frontend URL: ${config.frontendUrl}`);
  console.log(`⚡ AWS Region: ${config.aws.region}`);
  
  if (config.nodeEnv === 'development') {
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    console.log(`🔗 API base: http://localhost:${PORT}/api`);
  }
});