const http = require('http');
const app = require('./app');
const config = require('./config');
const webSocketService = require('./services/websocketService');

const PORT = config.port;

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket service
webSocketService.initialize(server);

server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📊 Environment: ${config.nodeEnv}`);
  console.log(`🌐 Frontend URL: ${config.frontendUrl}`);
  console.log(`⚡ AWS Region: ${config.aws.region}`);
  console.log(`🔌 WebSocket endpoint: ws://localhost:${PORT}/ws/inspections`);
  
  if (config.nodeEnv === 'development') {
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    console.log(`🔗 API base: http://localhost:${PORT}/api`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  webSocketService.shutdown();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  webSocketService.shutdown();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});