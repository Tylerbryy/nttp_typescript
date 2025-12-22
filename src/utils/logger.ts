/**
 * Logging configuration using Pino.
 */

import pino from 'pino';
import { config } from '../config.js';

/**
 * Logger configuration for Pino.
 */
export const loggerConfig: pino.LoggerOptions = {
  level: config.LOG_LEVEL.toLowerCase(),
  transport:
    process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
};

/**
 * Global logger instance configured with environment settings.
 */
export const logger = pino(loggerConfig);
