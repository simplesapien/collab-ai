// src/utils/logger.js
export class Logger {
      /**
     * Define logging levels and their priorities
     */
      static levels = {
        error: 0,  // Highest priority
        warn: 1,   // Warning messages
        info: 2,   // General information
        debug: 3   // Detailed debug information
    };

    // Default logging level
    static currentLevel = Logger.levels.info;

    static setLevel(level) {
        this.currentLevel = this.levels[level] || this.levels.info;
    }

    static log(level, message, data = null) {
        if (this.levels[level] <= this.currentLevel) {
            const timestamp = new Date().toISOString();
            const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
            
            if (data) {
                console.log(logMessage, data);
            } else {
                console.log(logMessage);
            }
        }
    }

    static error(message, data = null) {
        this.log('error', message, data);
    }

    static warn(message, data = null) {
        this.log('warn', message, data);
    }

    static info(message, data = null) {
        this.log('info', message, data);
    }

    static debug(message, data = null) {
        this.log('debug', message, data);
    }
}