import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const logDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../logs');

// Custom log levels
const logLevels = {
    levels: {
        error: 0,
        warn: 1,
        event: 2,
        state: 3,
        perf: 4,
        quality: 5,
        info: 6,
        debug: 7
    },
    colors: {
        error: 'red',
        warn: 'yellow',
        event: 'cyan',
        state: 'blue',
        perf: 'magenta',
        quality: 'green',
        info: 'white',
        debug: 'gray'
    }
};

// Get caller information for stack traces
const getCallerInfo = () => {
    const error = new Error();
    const stack = error.stack.split('\n')[3];
    const match = stack.match(/\((.+):(\d+):\d+\)$/);
    return match ? `${path.basename(match[1])}:${match[2]}` : 'unknown';
};

// Custom format for logs
const logFormat = winston.format.printf(({ level, message, timestamp, caller, eventId, duration, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]`;
    if (caller) log += ` (${caller})`;
    if (eventId) log += ` [Event:${eventId}]`;
    if (duration) log += ` [${duration}ms]`;
    log += `: ${message}`;
    
    if (Object.keys(meta).length > 0) {
        log += '\n' + JSON.stringify(meta, null, 2);
    }
    
    return log;
});

// Initialize Winston logger
const logger = winston.createLogger({
    levels: logLevels.levels,
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
    ),
    transports: [
        // Events log
        new winston.transports.File({
            filename: path.join(logDir, 'events.log'),
            level: 'event',
            flags: 'w'
        }),
        // System state log
        new winston.transports.File({
            filename: path.join(logDir, 'state.log'),
            level: 'state',
            flags: 'w'
        }),
        // Error log
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            flags: 'w'
        }),
        // Console output (all levels in development)
        new winston.transports.Console({
            level: 'error',
            format: winston.format.combine(
                winston.format.colorize({ colors: logLevels.colors }),
                logFormat
            )
        }),
        new winston.transports.File({
            filename: path.join(logDir, 'performance.log'),
            level: 'perf',
            flags: 'w'
        }),
        new winston.transports.File({
            filename: path.join(logDir, 'quality.log'),
            level: 'quality',
            flags: 'w'
        })
    ]
});

// Enhanced event tracking map with more metadata
const eventTracker = new Map();

export const log = {
    event: {
        emit: (eventName, sourceId, payload = {}) => {
            const eventId = `${sourceId}-${Date.now()}`;
            eventTracker.set(eventId, {
                name: eventName,
                source: sourceId,
                startTime: Date.now(),
                status: 'emitted',
                handlers: [],
                steps: [{
                    action: 'emit',
                    timestamp: Date.now(),
                    metadata: payload
                }]
            });
            
            logger.log('event', `Event Emitted: ${eventName}`, {
                eventId,
                source: sourceId,
                payload,
                caller: getCallerInfo()
            });
            
            return eventId;
        },

        handled: (eventId, handlerId, result = {}) => {
            const event = eventTracker.get(eventId);
            if (event) {
                event.handlers.push(handlerId);
                event.steps.push({
                    action: 'handled',
                    timestamp: Date.now(),
                    handler: handlerId,
                    result
                });
                
                logger.log('event', `Event Handled`, {
                    eventId,
                    handler: handlerId,
                    result,
                    duration: Date.now() - event.startTime,
                    caller: getCallerInfo()
                });
            } else {
                logger.warn(`Orphaned event handler detected`, {
                    eventId,
                    handler: handlerId,
                    caller: getCallerInfo()
                });
            }
        },

        complete: (eventId, status = 'completed', metadata = {}) => {
            const event = eventTracker.get(eventId);
            if (event) {
                const duration = Date.now() - event.startTime;
                event.steps.push({
                    action: 'complete',
                    timestamp: Date.now(),
                    status,
                    metadata
                });
                
                logger.log('event', `Event Chain ${status}`, {
                    eventId,
                    name: event.name,
                    handlers: event.handlers,
                    duration,
                    steps: event.steps,
                    caller: getCallerInfo()
                });
                
                // Performance metrics
                logger.log('perf', `Event Chain Performance`, {
                    eventId,
                    duration,
                    handlerCount: event.handlers.length,
                    stepCount: event.steps.length
                });
                
                eventTracker.delete(eventId);
            }
        }
    },

    state: {
        change: (component, fromState, toState, metadata = {}) => {
            const stateEvent = {
                component,
                from: fromState,
                to: toState,
                timestamp: Date.now(),
                ...metadata
            };
            
            logger.log('state', `State Change in ${component}`, {
                ...stateEvent,
                caller: getCallerInfo()
            });
            
            return stateEvent;
        }
    },

    perf: {
        measure: (operation, duration, metadata = {}) => {
            logger.log('perf', `Performance Measurement`, {
                operation,
                duration,
                ...metadata,
                caller: getCallerInfo()
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

    // Standard levels
    warn: (message, meta = {}) => {
        logger.warn(message, {
            caller: getCallerInfo(),
            ...meta
        });
    },

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
