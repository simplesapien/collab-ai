import { NotificationService } from './NotificationService.js';
import { log } from '../../utils/logger.js';

export class NotifyManager {
    constructor() {
        try {
            this.notificationService = new NotificationService();
            this.subscriptions = new Map();
            this.currentProcessId = null;
        } catch (error) {
            log.error('NotifyManager initialization failed', error);
            throw error;
        }
    }

    initialize(responseCallback, thinkingCallback) {
        try {
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
                if (!responseCallback) return;

                log.debug('Processing error notification', {
                    errorType: error?.type,
                    agentId: error?.agentId
                });

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
                const cleanupEventId = log.event.emit('cleanup', 'NotifyManager');
                this.notificationService.removeListener('response', responseListener);
                this.notificationService.removeListener('agentStateChange', thinkingListener);
                this.notificationService.removeListener('error', errorListener);
                this.subscriptions.clear();
            };
        } catch (error) {
            log.error('NotifyManager initialization failed', error);
            throw error;
        }
    }

    notifyResponse(response) {
        try {
            this.notificationService.sendResponse(response);
        } catch (error) {
            log.error('Error sending response', error);
            this.notificationService.sendError(error, response?.agentId);
        }
    }

    notifyThinking(agentId, phase = 'thinking') {
        try {
            log.debug('Updating agent thinking state', {
                agentId,
                phase
            });

            this.notificationService.updateAgentState(agentId, phase);
        } catch (error) {
            log.error('Error updating agent state', error);
            this.notificationService.sendError(error, agentId);
        }
    }

    startNewProcess() {
        try {
            this.currentProcessId = this.notificationService.startNewProcess();
            return this.currentProcessId;
        } catch (error) {
            log.error('Failed to start new process', error);
            throw error;
        }
    }
}
