import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const logDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../logs');

// Custom log categories
const categories = {
    AGENT: 'agent',
    SYSTEM: 'system',
    COST: 'cost',
    CONVERSATION: 'conversation',
    PERFORMANCE: 'performance'
};

// Custom format for better readability
const customFormat = winston.format.printf(({ level, message, timestamp, category, context, metadata, ...rest }) => {
    const coloredTimestamp = '\x1b[90m' + timestamp + '\x1b[0m';
    const coloredCategory = category ? `\x1b[95m[${category}]\x1b[0m` : '';
    const coloredContext = context ? `\x1b[36m[${context}]\x1b[0m` : '';
    
    let log = `${coloredTimestamp} ${level} ${coloredCategory}${coloredContext}: ${message}`;
    
    // Add metadata if present
    if (metadata) {
        log += '\n' + JSON.stringify(metadata, null, 2)
            .split('\n')
            .map(line => '  ' + line)
            .join('\n');
    }
    
    // Add any remaining data
    const restData = Object.keys(rest).length > 0 ? rest : null;
    if (restData) {
        log += '\n  ' + JSON.stringify(restData, null, 2);
    }
    
    return log;
});

// Create separate transports for different log types
const createLoggerTransports = (category) => [
    // Main log file
    new winston.transports.File({
        filename: path.join(logDir, `${category}.log`),
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
        ),
        maxsize: 5242880, // 5MB
        maxFiles: 5
    }),
    // Error-specific log file
    new winston.transports.File({
        filename: path.join(logDir, `${category}-error.log`),
        level: 'error',
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
        ),
        maxsize: 5242880,
        maxFiles: 5
    }),
    // Console output
    new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            customFormat
        )
    })
];

// Create loggers for each category
const loggers = {};
Object.values(categories).forEach(category => {
    loggers[category] = winston.createLogger({
        level: 'debug',
        format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.errors({ stack: true })
        ),
        defaultMeta: { category },
        transports: createLoggerTransports(category)
    });
});

// Performance monitoring
const startTimer = (context) => {
    const start = process.hrtime();
    return (operation) => {
        const [seconds, nanoseconds] = process.hrtime(start);
        const duration = (seconds * 1000 + nanoseconds / 1000000).toFixed(2);
        loggers.performance.debug(`Operation completed`, {
            context,
            operation,
            metadata: { durationMs: duration }
        });
        return duration;
    };
};

// Create contextual logger
export const createLogger = (context, category = categories.SYSTEM) => {
    const logger = loggers[category];
    
    return {
        error: (message, metadata = {}) => logger.error(message, { context, metadata }),
        warn: (message, metadata = {}) => logger.warn(message, { context, metadata }),
        info: (message, metadata = {}) => logger.info(message, { context, metadata }),
        debug: (message, metadata = {}) => logger.debug(message, { context, metadata }),
        
        // Special logging methods for your specific needs
        cost: (metadata) => loggers.cost.info('Cost update', { 
            context,
            metadata
        }),
        
        agentAction: (action, metadata = {}) => loggers.agent.debug(`Agent ${action}`, {
            context,
            metadata
        }),
        
        conversation: (action, metadata = {}) => loggers.conversation.debug(`Conversation ${action}`, {
            context,
            metadata
        }),
        
        // Performance monitoring
        startTimer: () => startTimer(context)
    };
};

// Export categories for use in other files
export const LogCategories = categories;

// Export default logger
export default createLogger('App'); 