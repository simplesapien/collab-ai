import { EventEmitter } from 'events';
import { log } from '../../utils/winstonLogger.js';

export class NotificationService extends EventEmitter {
    constructor() {
        super();
        this.activeStates = new Map();
        this.currentProcessId = null;
        
        log.state.change('NotificationService', 'initializing', 'ready');
        log.info('NotificationService initialized');
    }

    startNewProcess() {
        const startTime = Date.now();
        this.currentProcessId = startTime;
        
        const eventId = log.event.emit('processStart', 'NotificationService', {
            processId: this.currentProcessId
        });
        log.state.change('Process', 'idle', 'active', { processId: this.currentProcessId });
        
        log.event.complete(eventId);
        return this.currentProcessId;
    }

    updateAgentState(agentId, state, metadata = {}) {
        const startTime = Date.now();
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
        
        log.state.change('Agent', previousState, state, {
            agentId,
            processId: this.currentProcessId,
            metadata
        });

        log.perf.measure('stateUpdate', Date.now() - startTime, {
            agentId,
            state,
            processId: this.currentProcessId
        });
        
        return stateUpdate;
    }

    sendResponse(response) {
        const startTime = Date.now();
        const enhancedResponse = {
            ...response,
            timestamp: response.timestamp || startTime
        };
        
        const eventId = log.event.emit('response', 'NotificationService', {
            agentId: response.agentId,
            type: response.type || 'standard'
        });
        
        this.emit('response', enhancedResponse);
        this.clearAgentState(response.agentId);
        
        log.perf.measure('responseProcessing', Date.now() - startTime, {
            agentId: response.agentId,
            type: response.type
        });
        
        log.event.complete(eventId);
    }

    sendError(error, agentId = null) {
        const eventId = log.event.emit('error', 'NotificationService', { agentId });
        
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
        
        log.event.complete(eventId, 'error');
    }

    clearAgentState(agentId) {
        if (this.activeStates.has(agentId)) {
            const state = this.activeStates.get(agentId);
            this.activeStates.delete(agentId);
            
            this.emit('agentStateCleared', {
                agentId,
                previousState: state
            });
            
            log.state.change('Agent', state.state, 'cleared', { 
                agentId,
                processId: this.currentProcessId
            });
        }
    }

    reset() {
        const eventId = log.event.emit('reset', 'NotificationService');
        
        log.state.change('NotificationService', 'active', 'resetting');
        this.activeStates.clear();
        this.removeAllListeners();
        log.state.change('NotificationService', 'resetting', 'ready');
        
        log.event.complete(eventId);
    }

    cancelCurrentProcess() {
        if (this.currentProcessId) {
            const eventId = log.event.emit('processCancel', 'NotificationService', { 
                processId: this.currentProcessId 
            });
            
            log.state.change('Process', 'active', 'cancelling', {
                processId: this.currentProcessId
            });
            
            this.activeStates.forEach((state, agentId) => {
                this.clearAgentState(agentId);
            });

            this.emit('processCancelled', { processId: this.currentProcessId });
            this.currentProcessId = null;
            
            log.state.change('Process', 'cancelling', 'cancelled');
            log.event.complete(eventId, 'cancelled');
        }
    }
}
