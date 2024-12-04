import { log } from './logger.js';

export class CostTracker {
    constructor() {
        this.costs = {
            inputTokens: 0,
            outputTokens: 0,
            totalCost: 0
        };
        
        this.rates = {
            input: 0.150 / 1000000,  // $0.150 per 1M input tokens
            output: 0.600 / 1000000  // $0.600 per 1M output tokens
        };

        this.listeners = new Set();
    }

    onCostUpdate(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    notifyListeners() {
        const summary = this.getCostSummary();
        this.listeners.forEach(callback => callback(summary));
    }

    trackRequest(inputTokens, outputTokens) {

        try {
            this.costs.inputTokens += inputTokens;
            this.costs.outputTokens += outputTokens;
            
            const inputCost = inputTokens * this.rates.input;
            const outputCost = outputTokens * this.rates.output;
            const requestCost = inputCost + outputCost;
            
            this.costs.totalCost += requestCost;

            this.notifyListeners();

            return {
                requestCost,
                totalCost: this.costs.totalCost
            };
        } catch (error) {
            log.error('Cost tracking failed', error);
            throw error;
        }
    }

    getCostSummary() {
        return {
            inputTokens: this.costs.inputTokens,
            outputTokens: this.costs.outputTokens,
            inputCost: (this.costs.inputTokens * this.rates.input).toFixed(6),
            outputCost: (this.costs.outputTokens * this.rates.output).toFixed(6),
            totalCost: this.costs.totalCost.toFixed(6)
        };
    }

    reset() {
        this.costs = {
            inputTokens: 0,
            outputTokens: 0,
            totalCost: 0
        };
    }
} 