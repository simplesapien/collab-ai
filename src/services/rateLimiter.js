import { Logger } from '../utils/logger.js';

export class RateLimiter {
    constructor(config = { limit: 50, interval: 60000 }) {
        this.requests = 0;
        this.lastReset = Date.now();
        this.limit = config.limit;
        this.interval = config.interval;
        Logger.debug(`[RateLimiter] Initialized with limit: ${this.limit}, interval: ${this.interval}ms`);
    }

    async checkLimit() {
        const currentTime = Date.now();
        const timeSinceReset = currentTime - this.lastReset;
        Logger.debug(`[RateLimiter] Current requests: ${this.requests}, Time since last reset: ${timeSinceReset}ms`);

        if (currentTime - this.lastReset > this.interval) {
            Logger.debug('[RateLimiter] Interval exceeded, resetting counter');
            this.requests = 0;
            this.lastReset = currentTime;
        }

        if (this.requests >= this.limit) {
            const waitTime = this.interval - (currentTime - this.lastReset);
            Logger.warn(`[RateLimiter] Rate limit exceeded, waiting ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            Logger.debug('[RateLimiter] Wait complete, resetting counter');
            this.requests = 0;
            this.lastReset = currentTime;
        }
        
        this.requests++;
        Logger.debug(`[RateLimiter] Request processed. New count: ${this.requests}`);
    }
} 