/**
 * Global error handling middleware
 * Handles different types of errors and returns consistent error responses
 */

const errorHandler = (err, req, res, next) => {
  console.error('Error occurred:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Default error response
  let error = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong!',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    }
  };

  // Handle specific error types
  if (err.name === 'ValidationError') {
    error.error.code = 'VALIDATION_ERROR';
    error.error.message = 'Invalid input data';
    error.error.details = err.message;
    return res.status(400).json(error);
  }

  if (err.name === 'UnauthorizedError' || err.message === 'Unauthorized') {
    error.error.code = 'AUTH_FAILED';
    error.error.message = 'Authentication failed';
    return res.status(401).json(error);
  }

  if (err.name === 'ForbiddenError' || err.message === 'Forbidden') {
    error.error.code = 'PERMISSION_DENIED';
    error.error.message = 'Permission denied';
    return res.status(403).json(error);
  }

  if (err.name === 'NotFoundError') {
    error.error.code = 'USER_NOT_FOUND';
    error.error.message = 'Resource not found';
    return res.status(404).json(error);
  }

  // AWS SDK errors
  if (err.name && err.name.includes('AWS')) {
    error.error.code = 'AWS_ERROR';
    error.error.message = 'AWS service error occurred';
    error.error.details = process.env.NODE_ENV === 'development' ? err.message : 'External service error';
    return res.status(500).json(error);
  }

  // Default 500 error
  res.status(500).json(error);
};

module.exports = errorHandler;