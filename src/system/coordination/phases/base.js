import { log } from '../../../utils/logger.js';

// Base class for all phases
// This class is used to simplify the logging and performance metrics for each phase
export class Phase {
    constructor(coordinator, phaseName) {
        this.coordinator = coordinator;
        this.phaseName = phaseName;
    }

    async executeWithLogging(operation, metadata = {}) {
        const eventId = log.event.emit('execute', this.phaseName, metadata);
        const startTime = Date.now();

        try {
            if (this.coordinator.isCancelled) {
                log.debug(`Process cancelled during ${this.phaseName}`);
                log.event.complete(eventId, 'cancelled', metadata);
                return null;
            }

            const result = await operation();

            // Get final metadata including operation results
            const finalMetadata = {
                ...metadata,
                ...(typeof result === 'object' ? {
                    responseCount: result.collaborativeResponses?.length || 0,
                    totalResponses: result.allResponses?.length || 0
                } : {})
            };

            log.perf.measure(`${this.phaseName}-execution`, Date.now() - startTime, finalMetadata);
            log.event.complete(eventId, 'completed', finalMetadata);
            
            return result;
        } catch (error) {
            log.error(`${this.phaseName} execution failed`, error);
            log.event.complete(eventId, 'failed', metadata);
            throw error;
        }
    }
} 