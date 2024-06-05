import winston from 'winston';
import path from 'path';

export const createGQLLogger = (logsDir = ''): winston.Logger => {
  return winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    transports: [
      // Write all logs with importance level of `error` or less to `error.log`
      new winston.transports.File({ filename: path.resolve(logsDir, 'watcher-gql-error.log'), level: 'error' }),
      // Write all logs with importance level of `info` or less to `combined.log`
      new winston.transports.File({ filename: path.resolve(logsDir, 'watcher-gql.log') })
    ]
  });
};
