// src/utils/logger.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export class Logger {
    static levels = {
        error: 0,
        warn: 1,
        info: 2,
        debug: 3
    };

    static currentLevel = Logger.levels.info;
    static logBuffer = [];
    static logFile = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../logs/app.log'
    );

    static initialize() {
        // Ensure logs directory exists
        const logDir = path.dirname(this.logFile);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        // Clear existing log file
        fs.writeFileSync(this.logFile, '', 'utf8');
    }

    static setLevel(level) {
        this.currentLevel = this.levels[level] || this.levels.info;
    }

    static log(level, message, data = null) {
        if (this.levels[level] <= this.currentLevel) {
            const timestamp = new Date().toISOString();
            let logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
            
            if (data) {
                logMessage += '\n' + JSON.stringify(data, null, 2);
            }

            // Add to buffer
            this.logBuffer.push(logMessage);

            // Write buffer to file
            this.flushLogs();
        }
    }

    static flushLogs() {
        if (this.logBuffer.length > 0) {
            try {
                fs.appendFileSync(this.logFile, this.logBuffer.join('\n') + '\n', 'utf8');
                this.logBuffer = [];
            } catch (error) {
                console.error('Failed to write to log file:', error);
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

// Initialize logger when module is loaded
Logger.initialize();