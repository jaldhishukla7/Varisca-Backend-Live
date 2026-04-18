import winston from 'winston';
import fs from 'fs';
import path from 'path';

const logDir = path.join(__dirname, '../../logs');

// Create the log directory if it does not exist
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} ${level}: ${stack || message}`;
});

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    logFormat
  ),
  transports: [
    // Error logs
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'), 
      level: 'error' 
    }),
    // All logs
    new winston.transports.File({ 
      filename: path.join(logDir, 'combined.log') 
    })
  ],
});

// Always log to console so platform logs (Railway) capture runtime errors.
logger.add(new winston.transports.Console({
  format: process.env.NODE_ENV !== 'production'
    ? combine(
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
      )
    : combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
      )
}));

export default logger;
