export class RateLimiter {
    constructor(config = { limit: 50, interval: 60000 }) {
        this.requests = 0;
        this.lastReset = Date.now();
        this.limit = config.limit;
        this.interval = config.interval;
        console.log(`RateLimiter initialized with limit: ${this.limit}, interval: ${this.interval}ms`);
    }

    async checkLimit() {
        const currentTime = Date.now();
        const timeSinceReset = currentTime - this.lastReset;
        console.log(`Current requests: ${this.requests}, Time since last reset: ${timeSinceReset}ms`);

        if (currentTime - this.lastReset > this.interval) {
            console.log('Interval exceeded, resetting counter');
            this.requests = 0;
            this.lastReset = currentTime;
        }

        if (this.requests >= this.limit) {
            const waitTime = this.interval - (currentTime - this.lastReset);
            console.warn(`Rate limit exceeded, waiting ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            console.log('Wait complete, resetting counter');
            this.requests = 0;
            this.lastReset = currentTime;
        }
        
        this.requests++;
        console.log(`Request processed. New count: ${this.requests}`);
    }
} 