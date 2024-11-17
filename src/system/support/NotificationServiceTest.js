import { EventEmitter } from 'events';
import logger from '../../utils/winstonLogger.js';

export class NotificationServiceTest extends EventEmitter {
    constructor() {
        super();
        this.activeStates = new Map();
        logger.debug('NotificationService initialized', {
            timestamp: new Date().toISOString()
        });
    }

    updateAgentState(agentId, state, metadata = {}) {
        const timestamp = Date.now();
        const stateUpdate = {
            agentId,
            state,
            metadata,
            timestamp
        };
        
        this.activeStates.set(agentId, stateUpdate);
        this.emit('agentStateChange', stateUpdate);
        
        logger.info('Agent state updated', {
            agentId,
            state,
            metadata
        });
        
        return stateUpdate;
    }

    // Add a test method
    testLogging() {
        logger.debug('Debug message test');
        logger.info('Info message test');
        logger.warn('Warning message test');
        logger.error('Error message test', { 
            additionalInfo: 'Some error details',
            code: 500
        });
    }
} 