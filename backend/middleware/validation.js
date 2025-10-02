/**
 * Input validation middleware
 * Provides common validation functions for request data
 */

const validateRegistration = (req, res, next) => {
  const { username, password, roleArn, companyName } = req.body;
  const errors = [];

  // Username validation (must be email format for Cognito)
  if (!username || typeof username !== 'string' || username.trim().length < 3) {
    errors.push('Username must be at least 3 characters long');
  } else {
    const trimmedUsername = username.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedUsername)) {
      errors.push('Username must be a valid email address');
    }
  }

  // Password validation (Cognito requirements: lowercase + numbers, 8+ chars)
  if (!password || typeof password !== 'string' || password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  } else {
    // Check for lowercase letter
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    // Check for number
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }
  }

  // Role ARN validation
  if (!roleArn || typeof roleArn !== 'string') {
    errors.push('AWS Role ARN is required');
  } else {
    const trimmedArn = roleArn.trim();
    if (!trimmedArn.match(/^arn:aws:iam::\d{12}:role\/[\w+=,.@-]+$/)) {
      errors.push('Invalid AWS Role ARN format');
    }
  }

  // Company name validation
  if (!companyName || typeof companyName !== 'string' || companyName.trim().length < 2) {
    errors.push('Company name must be at least 2 characters long');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input data',
        details: errors.join(', ')
      }
    });
  }

  // Sanitize input
  req.body.username = username.trim().toLowerCase();
  req.body.companyName = companyName.trim();
  req.body.roleArn = roleArn.trim();

  next();
};

const validateLogin = (req, res, next) => {
  const { username, password } = req.body;
  const errors = [];

  if (!username || typeof username !== 'string') {
    errors.push('Username is required');
  }

  if (!password || typeof password !== 'string') {
    errors.push('Password is required');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid login data',
        details: errors.join(', ')
      }
    });
  }

  // Sanitize username
  req.body.username = username.trim().toLowerCase();

  next();
};

const validateStatusUpdate = (req, res, next) => {
  const { status } = req.body;
  const validStatuses = ['approved', 'rejected'];

  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid status value',
        details: `Status must be one of: ${validStatuses.join(', ')}`
      }
    });
  }

  next();
};

/**
 * 검사 시작 요청 검증
 * Requirements: 1.1 - 검사 요청 시 필수 파라미터 검증
 */
const validateInspectionStart = (req, res, next) => {
  const { serviceType, assumeRoleArn, inspectionConfig } = req.body;
  const errors = [];

  // Service type validation
  if (!serviceType || typeof serviceType !== 'string') {
    errors.push('Service type is required');
  } else {
    const validServiceTypes = ['EC2', 'RDS', 'S3', 'IAM', 'VPC'];
    if (!validServiceTypes.includes(serviceType.toUpperCase())) {
      errors.push(`Service type must be one of: ${validServiceTypes.join(', ')}`);
    }
  }

  // Assume role ARN validation
  if (!assumeRoleArn || typeof assumeRoleArn !== 'string') {
    errors.push('Assume role ARN is required');
  } else {
    const trimmedArn = assumeRoleArn.trim();
    if (!trimmedArn.match(/^arn:aws:iam::\d{12}:role\/[\w+=,.@-]+$/)) {
      errors.push('Invalid AWS Role ARN format');
    }
  }

  // Inspection config validation (optional)
  if (inspectionConfig && typeof inspectionConfig !== 'object') {
    errors.push('Inspection config must be an object');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid inspection request data',
        details: errors.join(', ')
      }
    });
  }

  // Sanitize input
  req.body.serviceType = serviceType.toUpperCase();
  req.body.assumeRoleArn = assumeRoleArn.trim();

  next();
};

module.exports = {
  validateRegistration,
  validateLogin,
  validateStatusUpdate,
  validateInspectionStart
};