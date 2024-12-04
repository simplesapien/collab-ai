import { log } from '../../../utils/logger.js';

// Base class for all phases
// This class is used to simplify the logging and performance metrics for each phase
export class Phase {
    constructor(coordinator, phaseName) {
        this.coordinator = coordinator;
        this.phaseName = phaseName;
    }

    async executeWithLogging(operation, metadata = {}) {
        try {
            if (this.coordinator.isCancelled) {
                return null;
            }

            const result = await operation();

            const finalMetadata = {
                ...metadata,
                ...(typeof result === 'object' ? {
                    responseCount: result.collaborativeResponses?.length || 0,
                    totalResponses: result.allResponses?.length || 0
                } : {})
            };
            
            return result;
        } catch (error) {
            log.error(`${this.phaseName} execution failed`, error);
            throw error;
        }
    }

    async executeWithRetry({
        operation,
        qualityCheck,
        maxAttempts = 3,
        agentId = null,
        task = null,
        metadata = {}
    }) {
        let attempts = 0;
        let qualityPassed = false;
        let result;

        while (!qualityPassed && attempts < maxAttempts) {
            if (this.coordinator.isCancelled) {
                return null;
            }

            if (agentId) {
                this.coordinator.notifyManager.notifyThinking(agentId, 'thinking');
            }

            try {
                result = await operation();
                
                const qualityResult = await qualityCheck(result);
                
                if (qualityResult.shouldContinue) {
                    qualityPassed = true;
                } else {
                    attempts++;
                }
            } catch (error) {
                attempts++;
                log.error(`Attempt ${attempts} failed in ${this.phaseName}`, {
                    error: error.message,
                    stack: error.stack,
                    task,
                    agentId,
                    ...metadata
                });
            }

        }

        if (!qualityPassed) {
            log.debug(`Failed quality check after ${maxAttempts} attempts in ${this.phaseName}`, {
                agentId,
                task,
                ...metadata
            });
            return null;
        }

        return result;
    }
} 