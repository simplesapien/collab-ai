import { EventEmitter } from 'events';
import { log } from '../../utils/winstonLogger.js';

export class NotificationService extends EventEmitter {
    constructor() {
        const eventId = log.event.emit('init', 'NotificationService');
        const startTime = Date.now();

        try {
            super();
            this.activeStates = new Map();
            this.currentProcessId = null;
            
            log.state.change('NotificationService', 'initializing', 'ready');
            
            log.perf.measure('notification-service-init', Date.now() - startTime);
            log.event.complete(eventId, 'completed');
        } catch (error) {
            log.error('NotificationService initialization failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    startNewProcess() {
        const eventId = log.event.emit('processStart', 'NotificationService');
        const startTime = Date.now();

        try {
            this.currentProcessId = Date.now();
            
            log.debug('Starting new process', { 
                processId: this.currentProcessId 
            });
            
            log.state.change('Process', 'idle', 'active', { 
                processId: this.currentProcessId 
            });
            
            log.perf.measure('process-start', Date.now() - startTime, {
                processId: this.currentProcessId
            });
            
            log.event.complete(eventId, 'completed', {
                processId: this.currentProcessId
            });
            return this.currentProcessId;
        } catch (error) {
            log.error('Process start failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    updateAgentState(agentId, state, metadata = {}) {
        const eventId = log.event.emit('updateAgentState', 'NotificationService', {
            agentId,
            state
        });
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
            
            log.state.change('Agent', previousState, state, {
                agentId,
                processId: this.currentProcessId,
                metadata
            });

            log.perf.measure('state-update', Date.now() - startTime, {
                agentId,
                state,
                processId: this.currentProcessId
            });
            
            log.event.complete(eventId, 'completed', {
                agentId,
                previousState,
                newState: state
            });
            return stateUpdate;
        } catch (error) {
            log.error('Agent state update failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
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
