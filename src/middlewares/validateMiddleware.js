import { HTTP_STATUS } from '../utils/constants.js';

/**
 * Validation middleware factory
 * @param {Function} validatorFn - Validator function from utils/validators.js
 */
export const validate = (validatorFn) => {
  return (req, res, next) => {
    const { error, value } = validatorFn(req.body);
    
    if (error) {
      return res.status(HTTP_STATUS.UNPROCESSABLE_ENTITY).json({
        success: false,
        message: 'Validation failed',
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
        })),
      });
    }
    
    // Replace req.body with validated value
    req.body = value;
    next();
  };
};

/**
 * Validate query parameters
 */
export const validateQuery = (validatorFn) => {
  return (req, res, next) => {
    const { error, value } = validatorFn(req.query);
    
    if (error) {
      return res.status(HTTP_STATUS.UNPROCESSABLE_ENTITY).json({
        success: false,
        message: 'Validation failed',
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
        })),
      });
    }
    
    req.query = value;
    next();
  };
};
