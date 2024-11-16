import { Logger } from '../../utils/logger.js';
import { NotificationService } from './NotificationService.js';

export class NotifyManager {
    constructor() {
        this.notificationService = new NotificationService();
        this.subscriptions = new Map();
        Logger.debug('[NotifyManager] Initialized');
    }

    initialize(responseCallback, thinkingCallback) {
        try {
            // Store the callbacks with their event listeners
            const responseListener = (response) => {
                if (responseCallback) {
                    responseCallback(response);
                }
            };

            const thinkingListener = (stateUpdate) => {
                if (thinkingCallback) {
                    thinkingCallback(stateUpdate.agentId, stateUpdate.state);
                }
            };

            const errorListener = (error) => {
                Logger.error('[NotifyManager] Error event received:', error);
                if (responseCallback) {
                    responseCallback({
                        agentId: error.agentId || 'system',
                        role: 'System',
                        content: `Error: ${error.error.message || 'An unknown error occurred'}`,
                        type: 'error',
                        timestamp: Date.now()
                    });
                }
            };

            // Add listeners
            this.notificationService.on('response', responseListener);
            this.notificationService.on('agentStateChange', thinkingListener);
            this.notificationService.on('error', errorListener);

            // Store listeners for cleanup
            this.subscriptions.set('response', responseListener);
            this.subscriptions.set('agentStateChange', thinkingListener);
            this.subscriptions.set('error', errorListener);

            Logger.debug('[NotifyManager] Initialized with callbacks');

            // Return unsubscribe function
            return () => {
                this.notificationService.removeListener('response', responseListener);
                this.notificationService.removeListener('agentStateChange', thinkingListener);
                this.notificationService.removeListener('error', errorListener);
                this.subscriptions.clear();
                Logger.debug('[NotifyManager] Unsubscribed all listeners');
            };
        } catch (error) {
            Logger.error('[NotifyManager] Error during initialization:', error);
            return () => {}; // Return empty function in case of error
        }
    }

    notifyResponse(response) {
        try {
            Logger.debug('[NotifyManager] Sending response:', response);
            this.notificationService.sendResponse(response);
        } catch (error) {
            Logger.error('[NotifyManager] Error sending response:', error);
            this.notificationService.sendError(error, response?.agentId);
        }
    }

    notifyThinking(agentId, phase = 'thinking') {
        try {
            Logger.debug('[NotifyManager] Updating agent state:', { agentId, phase });
            this.notificationService.updateAgentState(agentId, phase);
        } catch (error) {
            Logger.error('[NotifyManager] Error updating agent state:', error);
            this.notificationService.sendError(error, agentId);
        }
    }

    notifyError(error, agentId = null) {
        this.notificationService.sendError(error, agentId);
    }

    getActiveStates() {
        return this.notificationService.getActiveStates();
    }

    cleanup() {
        try {
            this.notificationService.reset();
            Logger.debug('[NotifyManager] Cleanup completed');
        } catch (error) {
            Logger.error('[NotifyManager] Error during cleanup:', error);
        }
    }
}