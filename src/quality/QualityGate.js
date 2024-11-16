import { Logger } from '../utils/logger.js';

export class QualityGate {
    constructor(config = {}) {
        this.maxCollaborationRounds = config.maxCollaborationRounds || 15;
        this.currentRound = 0;
        Logger.debug(`[QualityGate] Initialized with max rounds: ${this.maxCollaborationRounds}`);
    }

    async validateCollaborationContinuation(conversation, agentResponses) {
        Logger.debug(`[QualityGate] Validating continuation - Round ${this.currentRound}/${this.maxCollaborationRounds}`);
        
        if (this.currentRound >= this.maxCollaborationRounds) {
            Logger.info(`[QualityGate] Max rounds (${this.maxCollaborationRounds}) reached at round ${this.currentRound}`);
            return {
                shouldContinue: false,
                reason: 'MAX_ROUNDS_REACHED'
            };
        }

        const qualityMetrics = await this.analyzeResponseQuality(conversation, agentResponses);
        return this._validateMetrics(qualityMetrics);
    }

    _validateMetrics(metrics) {
        if (metrics.topicDrift > 0.3) {
            Logger.info('[QualityGate] Stopping due to topic drift');
            return {
                shouldContinue: false,
                reason: 'TOPIC_DRIFT'
            };
        }

        if (metrics.consensusReached) {
            Logger.info('[QualityGate] Stopping due to consensus reached');
            return {
                shouldContinue: false,
                reason: 'CONSENSUS_REACHED'
            };
        }

        return {
            shouldContinue: true,
            qualityMetrics: metrics
        };
    }

    resetRoundCounter() {
        const oldValue = this.currentRound;
        this.currentRound = 0;
        Logger.info(`[QualityGate] Round counter reset from ${oldValue} to ${this.currentRound}`);
    }

    incrementRound() {
        const oldValue = this.currentRound;
        this.currentRound++;
        Logger.info(`[QualityGate] Round counter incremented from ${oldValue} to ${this.currentRound}`);
        return this.currentRound;
    }

    async analyzeResponseQuality(conversation, agentResponses) {
        // This would integrate with your LLM service to analyze responses
        // Placeholder for now
        return {
            topicRelevance: 0.8,
            topicDrift: 0.1,
            consensusReached: false,
            responseCoherence: 0.9
        };
    }
} 