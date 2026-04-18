// ─── Centralized Error Handling Middleware ───────────────────────────────
import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export interface ApiError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export class AppError extends Error implements ApiError {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// Generic error messages for production
const GENERIC_ERROR_MESSAGES = {
  400: 'Bad request. Please check your input and try again.',
  401: 'Unauthorized. Please log in and try again.',
  403: 'Forbidden. You do not have permission to perform this action.',
  404: 'Resource not found.',
  409: 'Conflict. The resource already exists.',
  422: 'Validation failed. Please check your input.',
  429: 'Too many requests. Please try again later.',
  500: 'Internal server error. Please try again.',
  503: 'Service unavailable. Please try again later.',
};

export function errorHandler(
  err: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  let { statusCode = 500, message } = err;

  // Log detailed error for debugging
  const errorDetails = {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString(),
  };

  if (statusCode >= 500) {
    logger.error(`Server Error: ${err.message}`, errorDetails);
  } else {
    logger.warn(`Client Error: ${err.message}`, errorDetails);
  }

  // Don't leak raw stack in production; keep 422 validation messages readable in admin UI
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (!isDevelopment) {
    if (statusCode >= 500) {
      message = GENERIC_ERROR_MESSAGES[500];
    } else if (statusCode >= 400 && statusCode < 500 && statusCode !== 422) {
      message = GENERIC_ERROR_MESSAGES[statusCode as keyof typeof GENERIC_ERROR_MESSAGES] || GENERIC_ERROR_MESSAGES[400];
    }
    // 422: keep Joi / validation message so admins can fix the form
  }

  res.status(statusCode).json({
    error: message,
    ...(isDevelopment && {
      stack: err.stack,
      details: err.message,
    }),
  });
}

// Async error wrapper to catch unhandled promise rejections
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Validation error handler for Joi
export function handleValidationError(err: any): AppError {
  if (err.isJoi) {
    const message = err.details.map((detail: any) => detail.message).join('; ');
    return new AppError(message, 422);
  }
  return err;
}

// Database error handler
export function handleDatabaseError(err: any): AppError {
  // Handle common database errors
  if (err.code === '23505') { // Unique constraint violation
    return new AppError('Resource already exists.', 409);
  }
  if (err.code === '23503') { // Foreign key constraint violation
    return new AppError('Referenced resource does not exist.', 400);
  }
  if (err.code === '23514') { // Check constraint violation
    return new AppError('Data validation failed.', 400);
  }
  if (err.code === 'ECONNREFUSED') {
    return new AppError('Database connection failed.', 503);
  }
  
  return err;
}
