import { log } from './logger.js';

export class RateLimiter {
    constructor(config = { limit: 50, interval: 60000 }) {
        this.requests = 0;
        this.lastReset = Date.now();
        this.limit = config.limit;
        this.interval = config.interval;
    }

    async checkLimit() {

        try {
            const currentTime = Date.now();
            const timeSinceReset = currentTime - this.lastReset;

            if (currentTime - this.lastReset > this.interval) {
                log.debug('[RateLimiter] Interval exceeded, resetting counter');
                this.requests = 0;
                this.lastReset = currentTime;
            }

            if (this.requests >= this.limit) {
                const waitTime = this.interval - (currentTime - this.lastReset);
                log.debug(`[RateLimiter] Rate limit exceeded, waiting ${waitTime}ms`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                log.debug('[RateLimiter] Wait complete, resetting counter');
                this.requests = 0;
                this.lastReset = currentTime;
            }

            this.requests++;
        } catch (error) {
            log.error('Rate limit check failed', error);
            throw error;
        }
    }
} 