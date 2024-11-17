import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const logDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../logs/winston');

// Get file and line number for error traces
const getCallerInfo = () => {
    const error = new Error();
    const stack = error.stack.split('\n')[3];
    const match = stack.match(/\((.+):(\d+):\d+\)$/);
    return match ? `${path.basename(match[1])}:${match[2]}` : 'unknown';
};

// Create format for different log types
const logFormat = winston.format.printf(({ level, message, timestamp, caller, duration, ...meta }) => {
    let log = `${timestamp} [${level}]`;
    if (caller) log += ` (${caller})`;
    if (duration) log += ` [${duration}ms]`;
    log += `: ${message}`;
    
    if (Object.keys(meta).length > 0) {
        log += '\n' + JSON.stringify(meta, null, 2);
    }
    
    return log;
});

const logger = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
    ),
    transports: [
        // API calls log
        new winston.transports.File({
            filename: path.join(logDir, 'api.log'),
            level: 'debug',
            flags: 'w'
        }),
        // System flow log
        new winston.transports.File({
            filename: path.join(logDir, 'system.log'),
            level: 'debug',
            flags: 'w'
        }),
        // Error log
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            flags: 'w'
        }),
        // Console (errors only)
        new winston.transports.Console({
            level: 'error',
            format: winston.format.combine(
                winston.format.colorize(),
                logFormat
            )
        })
    ]
});

// Performance timer utility
const createTimer = () => {
    const start = process.hrtime();
    return () => {
        const [seconds, nanoseconds] = process.hrtime(start);
        return (seconds * 1000 + nanoseconds / 1000000).toFixed(2);
    };
};

export const log = {
    // System flow logging
    trace: (message, meta = {}) => {
        logger.debug(message, { 
            caller: getCallerInfo(),
            ...meta 
        });
    },

    // API call logging
    api: {
        start: (endpoint, payload) => {
            const timer = createTimer();
            logger.debug(`API Call Started: ${endpoint}`, {
                caller: getCallerInfo(),
                payload
            });
            return timer;
        },
        end: (endpoint, response, timer) => {
            logger.debug(`API Call Completed: ${endpoint}`, {
                caller: getCallerInfo(),
                duration: timer(),
                response
            });
        }
    },

    // Error logging
    error: (message, error = null) => {
        logger.error(message, {
            caller: getCallerInfo(),
            error: error ? {
                message: error.message,
                stack: error.stack
            } : null
        });
    },

    // Performance logging
    perf: (operation, duration) => {
        logger.debug(`Performance: ${operation}`, {
            caller: getCallerInfo(),
            duration
        });
    },

    // Standard levels
    info: (message, meta = {}) => {
        logger.info(message, {
            caller: getCallerInfo(),
            ...meta
        });
    },
    
    debug: (message, meta = {}) => {
        logger.debug(message, {
            caller: getCallerInfo(),
            ...meta
        });
    }
};

export default log; 
