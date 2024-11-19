import { log } from '../utils/winstonLogger.js';

export class RateLimiter {
    constructor(config = { limit: 50, interval: 60000 }) {
        this.requests = 0;
        this.lastReset = Date.now();
        this.limit = config.limit;
        this.interval = config.interval;
        log.debug('Rate limiter initialized', {
            limit: this.limit,
            interval: this.interval
        });
    }

    async checkLimit() {
        const eventId = log.event.emit('checkLimit', 'RateLimiter', {
            currentRequests: this.requests,
            limit: this.limit
        });

        try {
            const currentTime = Date.now();
            const timeSinceReset = currentTime - this.lastReset;
            log.debug('Checking rate limit', {
                currentRequests: this.requests,
                timeSinceReset,
                limit: this.limit
            });

            if (currentTime - this.lastReset > this.interval) {
                log.debug('[RateLimiter] Interval exceeded, resetting counter');
                this.requests = 0;
                this.lastReset = currentTime;
            }

            if (this.requests >= this.limit) {
                const waitTime = this.interval - (currentTime - this.lastReset);
                log.warn(`[RateLimiter] Rate limit exceeded, waiting ${waitTime}ms`);
                log.state.change('RateLimiter', 'active', 'waiting', {
                    waitTime,
                    currentRequests: this.requests
                });
                await new Promise(resolve => setTimeout(resolve, waitTime));
                log.debug('[RateLimiter] Wait complete, resetting counter');
                this.requests = 0;
                this.lastReset = currentTime;
            }

            this.requests++;
            log.event.complete(eventId, 'completed', {
                newCount: this.requests
            });
        } catch (error) {
            log.error('Rate limit check failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }
} 