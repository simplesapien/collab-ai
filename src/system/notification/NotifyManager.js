import { Logger } from '../../utils/logger.js';
import { NotificationService } from './NotificationService.js';

export class NotifyManager {
    constructor() {
        this.notificationService = new NotificationService();
        this.subscriptions = new Map();
        this.currentProcessId = null;
        Logger.debug('[NotifyManager] Initialized');
    }

    initialize(responseCallback, thinkingCallback) {
        try {
            const responseListener = (response) => {
                if (responseCallback) responseCallback(response);
            };

            const thinkingListener = (stateUpdate) => {
                if (thinkingCallback) {
                    thinkingCallback(stateUpdate.agentId, stateUpdate.state);
                }
            };

            const errorListener = (error) => {
                if (!responseCallback) return;

                if (error?.type === 'cancellation' || error?.message?.includes('cancelled')) {
                    responseCallback({
                        agentId: 'system',
                        role: 'System',
                        content: 'Process cancelled. Ready for new input.',
                        type: 'cancellation',
                        timestamp: Date.now()
                    });
                    return;
                }

                const errorMessage = error?.error?.message || 
                                   error?.message || 
                                   'An unknown error occurred';
                
                responseCallback({
                    agentId: error?.agentId || 'system',
                    role: 'System',
                    content: `Error: ${errorMessage}`,
                    type: 'error',
                    error: { message: errorMessage },
                    timestamp: Date.now()
                });
            };

            this.notificationService.on('response', responseListener);
            this.notificationService.on('agentStateChange', thinkingListener);
            this.notificationService.on('error', errorListener);

            this.subscriptions.set('response', responseListener);
            this.subscriptions.set('agentStateChange', thinkingListener);
            this.subscriptions.set('error', errorListener);

            return () => {
                this.notificationService.removeListener('response', responseListener);
                this.notificationService.removeListener('agentStateChange', thinkingListener);
                this.notificationService.removeListener('error', errorListener);
                this.subscriptions.clear();
            };
        } catch (error) {
            Logger.error('[NotifyManager] Error during initialization:', error);
            return () => {};
        }
    }

    notifyResponse(response) {
        try {
            this.notificationService.sendResponse(response);
        } catch (error) {
            Logger.error('[NotifyManager] Error sending response:', error);
            this.notificationService.sendError(error, response?.agentId);
        }
    }

    notifyThinking(agentId, phase = 'thinking') {
        try {
            this.notificationService.updateAgentState(agentId, phase);
        } catch (error) {
            Logger.error('[NotifyManager] Error updating agent state:', error);
            this.notificationService.sendError(error, agentId);
        }
    }

    notifyError(error, agentId = null) {
        try {
            if (error?.type === 'cancellation' || error?.message?.includes('cancelled')) {
                this.notificationService.sendResponse({
                    agentId: 'system',
                    role: 'System',
                    content: 'Process cancelled. Ready for new input.',
                    type: 'cancellation',
                    timestamp: Date.now()
                });
                return;
            }

            const errorObj = error instanceof Error ? error : new Error(error?.message || error || 'Unknown error');
            this.notificationService.sendError({ error: errorObj, agentId: agentId || 'system' });
        } catch (err) {
            Logger.error('[NotifyManager] Error in notifyError:', err);
            this.notificationService.sendResponse({
                agentId: 'system',
                role: 'System',
                content: 'An unexpected error occurred',
                type: 'error',
                error: { message: 'An unexpected error occurred' },
                timestamp: Date.now()
            });
        }
    }

    startNewProcess() {
        this.currentProcessId = this.notificationService.startNewProcess();
        return this.currentProcessId;
    }
}
