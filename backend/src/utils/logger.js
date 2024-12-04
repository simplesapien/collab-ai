import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const logDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../logs');

// Ensure log directory exists and clean existing logs
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
} else {
    fs.readdirSync(logDir).forEach(file => {
        if (file.endsWith('.log')) {
            fs.unlinkSync(path.join(logDir, file));
        }
    });
}

// Get caller information for stack traces
const getCallerInfo = () => {
    const error = new Error();
    const stack = error.stack.split('\n')[3];
    const match = stack.match(/\((.+):(\d+):\d+\)$/);
    return match ? `${path.basename(match[1])}:${match[2]}` : 'unknown';
};

// Custom format for logs
const logFormat = winston.format.printf(({ level, message, timestamp, caller, duration, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]`;
    if (caller) log += ` (${caller})`;
    if (duration) log += ` [${duration}ms]`;
    log += `: ${message}`;
    
    if (Object.keys(meta).length > 0) {
        log += '\n' + JSON.stringify(meta, null, 2);
    }
    
    return log;
});

// Create separate loggers for each type
const errorLogger = winston.createLogger({
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
    ),
    transports: [
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            flags: 'a'
        }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                logFormat
            )
        })
    ]
});

const perfLogger = winston.createLogger({
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
    ),
    transports: [
        new winston.transports.File({
            filename: path.join(logDir, 'performance.log'),
            flags: 'w'
        })
    ]
});

const debugLogger = winston.createLogger({
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
    ),
    transports: [
        new winston.transports.File({
            filename: path.join(logDir, 'debug.log'),
            flags: 'a'
        })
    ]
});

const insightLogger = winston.createLogger({
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
    ),
    transports: [
        new winston.transports.File({
            filename: path.join(logDir, 'insights.log'),
            flags: 'a'
        })
    ]
});

export const log = {
    error: (message, error = null) => {
        errorLogger.error(message, {
            caller: getCallerInfo(),
            error: error ? {
                message: error.message,
                stack: error.stack
            } : null
        });
    },

    debug: (message, meta = {}) => {
        debugLogger.info(message, {
            caller: getCallerInfo(),
            ...meta
        });
    },

    perf: {
        measure: (operation, duration, metadata = {}) => {
            perfLogger.info(`Performance Measurement`, {
                operation,
                duration,
                ...metadata,
                caller: getCallerInfo()
            });
        }
    },

    insight: {
        store: (conversationId, insight, sourceMessages) => {
            insightLogger.info('New Insight Stored', {
                conversationId,
                insight,
                sourceMessages,
                caller: getCallerInfo()
            });
        }
    }
};

export default log; 
