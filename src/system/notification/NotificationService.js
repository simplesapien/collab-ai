import { EventEmitter } from 'events';
import { log } from '../../utils/logger.js';

export class NotificationService extends EventEmitter {
    constructor() {
        try {
            super();
            this.activeStates = new Map();
            this.currentProcessId = null;
        } catch (error) {
            log.error('NotificationService initialization failed', error);
            throw error;
        }
    }

    startNewProcess() {
        try {
            this.currentProcessId = Date.now();
            return this.currentProcessId;
        } catch (error) {
            log.error('Process start failed', error);
            throw error;
        }
    }

    updateAgentState(agentId, state, metadata = {}) {
        const startTime = Date.now();
        try {
            log.debug('Updating agent state', {
                agentId,
                state,
                metadata,
                processId: this.currentProcessId
            });

            const stateUpdate = {
                agentId,
                state,
                metadata,
                timestamp: startTime,
                processId: this.currentProcessId
            };
            
            const previousState = this.activeStates.get(agentId)?.state || 'unknown';
            this.activeStates.set(agentId, stateUpdate);
            
            this.emit('agentStateChange', stateUpdate);
            
            return stateUpdate;
        } catch (error) {
            log.error('Agent state update failed', error);
            throw error;
        }
    }

    sendResponse(response) {
        const enhancedResponse = {
            ...response,
            timestamp: response.timestamp || startTime
        };
        
        this.emit('response', enhancedResponse);
        this.clearAgentState(response.agentId);
    }

    sendError(error, agentId = null) {
        
        const errorNotification = {
            type: 'error',
            error,
            agentId,
            timestamp: Date.now()
        };
        
        this.emit('error', errorNotification);
        log.error('Agent error notification', error instanceof Error ? error : new Error(error));
        
        if (agentId) {
            this.clearAgentState(agentId);
        }
        
    }

    clearAgentState(agentId) {
        if (this.activeStates.has(agentId)) {
            const state = this.activeStates.get(agentId);
            this.activeStates.delete(agentId);
            
            this.emit('agentStateCleared', {
                agentId,
                previousState: state
            });
        }
    }

    reset() {
        this.activeStates.clear();
        this.removeAllListeners();
    }

    cancelCurrentProcess() {
        if (this.currentProcessId) {
            this.activeStates.forEach((state, agentId) => {
                this.clearAgentState(agentId);
            });

            this.emit('processCancelled', { processId: this.currentProcessId });
            this.currentProcessId = null;
        }
    }
}
