/**
 * Rate limiting middleware
 * Prevents abuse by limiting the number of requests per IP
 */

const rateLimitStore = new Map();

const createRateLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    maxRequests = 100,
    message = 'Too many requests, please try again later'
  } = options;

  return (req, res, next) => {
    const clientId = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    // Clean up old entries
    for (const [key, data] of rateLimitStore.entries()) {
      if (now - data.resetTime > windowMs) {
        rateLimitStore.delete(key);
      }
    }
    
    // Get or create client data
    let clientData = rateLimitStore.get(clientId);
    if (!clientData || now - clientData.resetTime > windowMs) {
      clientData = {
        count: 0,
        resetTime: now
      };
      rateLimitStore.set(clientId, clientData);
    }
    
    // Check if limit exceeded
    if (clientData.count >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: message,
          retryAfter: Math.ceil((windowMs - (now - clientData.resetTime)) / 1000)
        }
      });
    }
    
    // Increment counter
    clientData.count++;
    
    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': maxRequests,
      'X-RateLimit-Remaining': Math.max(0, maxRequests - clientData.count),
      'X-RateLimit-Reset': new Date(clientData.resetTime + windowMs).toISOString()
    });
    
    next();
  };
};

// Specific rate limiters for different endpoints
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10, // Stricter limit for auth endpoints
  message: 'Too many authentication attempts, please try again later'
});

const generalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100
});

module.exports = {
  createRateLimiter,
  authLimiter,
  generalLimiter
};