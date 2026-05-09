/**
 * Structured logger using Pino. Pretty in dev, JSON in production.
 */
import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  ...(config.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss.l' },
    },
  }),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-eastern-ai-secret"]',
      'req.headers["x-admin-sig"]',
      '*.token',
      '*.secret',
      '*.password',
      '*.api_key',
    ],
    remove: false,
  },
});
