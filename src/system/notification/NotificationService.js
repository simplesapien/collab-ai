import { EventEmitter } from 'events';
import { Logger } from '../../utils/logger.js';

export class NotificationService extends EventEmitter {
    constructor() {
        super();
        this.activeStates = new Map();
        this.currentProcessId = null;
        Logger.debug('[NotificationService] Initialized');
    }

    startNewProcess() {
        this.currentProcessId = Date.now();
        return this.currentProcessId;
    }

    updateAgentState(agentId, state, metadata = {}) {
        const timestamp = Date.now();
        const stateUpdate = {
            agentId,
            state,
            metadata,
            timestamp,
            processId: this.currentProcessId
        };
        
        this.activeStates.set(agentId, stateUpdate);
        this.emit('agentStateChange', stateUpdate);
        this.emit('processCancelled', { processId: this.currentProcessId });
        Logger.debug('[NotificationService] Agent state updated:', { agentId, state });
        return stateUpdate;
    }

    sendResponse(response) {
        const enhancedResponse = {
            ...response,
            timestamp: response.timestamp || Date.now()
        };
        
        this.emit('response', enhancedResponse);
        Logger.debug('[NotificationService] Response sent:', enhancedResponse);
        
        // Clear thinking state for agent when they respond
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
        Logger.error('[NotificationService] Error notification:', errorNotification);
        
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
            Logger.debug('[NotificationService] Agent state cleared:', { agentId });
        }
    }

    getActiveStates() {
        return Object.fromEntries(this.activeStates);
    }

    reset() {
        this.activeStates.clear();
        this.removeAllListeners();
        Logger.debug('[NotificationService] Service reset');
    }

    cancelCurrentProcess() {
        if (this.currentProcessId) {
            Logger.debug('[NotificationService] Cancelling process:', this.currentProcessId);
            
            // Clear all active states
            this.activeStates.forEach((state, agentId) => {
                this.clearAgentState(agentId);
            });

            // Emit cancellation event
            this.emit('processCancelled', { processId: this.currentProcessId });
            
            // Reset process ID
            this.currentProcessId = null;
        }
    }
}
