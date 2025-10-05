/**
 * Request logging middleware
 * Logs incoming requests for debugging and monitoring
 */

const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log request details (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      body: req.method === 'POST' || req.method === 'PUT' ? 
        JSON.stringify(req.body).substring(0, 200) : undefined
    });
  }

  // Log response when finished (only in development)
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    }
  });

  next();
};

module.exports = requestLogger;