import { NotificationService } from './NotificationService.js';
import { log } from '../../utils/winstonLogger.js';

export class NotifyManager {
    constructor() {
        this.notificationService = new NotificationService();
        this.subscriptions = new Map();
        this.currentProcessId = null;
        const eventId = log.event.emit('init', 'NotifyManager');
        log.event.complete(eventId);
    }

    initialize(responseCallback, thinkingCallback) {
        const eventId = log.event.emit('initialize', 'NotifyManager');
        
        try {
            const responseListener = (response) => {
                if (responseCallback) responseCallback(response);
                log.event.handled(eventId, 'responseListener');
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

            log.event.complete(eventId, 'completed', { 
                listeners: ['response', 'agentStateChange', 'error'] 
            });

            return () => {
                this.notificationService.removeListener('response', responseListener);
                this.notificationService.removeListener('agentStateChange', thinkingListener);
                this.notificationService.removeListener('error', errorListener);
                this.subscriptions.clear();
            };
        } catch (error) {
            log.error('NotifyManager initialization failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    notifyResponse(response) {
        const eventId = log.event.emit('notifyResponse', 'NotifyManager', { agentId: response?.agentId });
        try {
            this.notificationService.sendResponse(response);
            log.event.complete(eventId);
        } catch (error) {
            log.error('Error sending response', error);
            this.notificationService.sendError(error, response?.agentId);
            log.event.complete(eventId, 'failed');
        }
    }

    notifyThinking(agentId, phase = 'thinking') {
        const eventId = log.event.emit('notifyThinking', 'NotifyManager', { agentId, phase });
        try {
            this.notificationService.updateAgentState(agentId, phase);
            log.event.complete(eventId);
        } catch (error) {
            log.error('Error updating agent state', error);
            this.notificationService.sendError(error, agentId);
            log.event.complete(eventId, 'failed');
        }
    }

    notifyError(error, agentId = null) {
        const eventId = log.event.emit('notifyError', 'NotifyManager', { agentId });
        try {
            if (error?.type === 'cancellation' || error?.message?.includes('cancelled')) {
                this.notificationService.sendResponse({
                    agentId: 'system',
                    role: 'System',
                    content: 'Process cancelled. Ready for new input.',
                    type: 'cancellation',
                    timestamp: Date.now()
                });
                log.event.complete(eventId, 'cancelled');
                return;
            }

            const errorObj = error instanceof Error ? error : new Error(error?.message || error || 'Unknown error');
            this.notificationService.sendError({ error: errorObj, agentId: agentId || 'system' });
            log.event.complete(eventId);
        } catch (err) {
            log.error('Error in notifyError', err);
            this.notificationService.sendResponse({
                agentId: 'system',
                role: 'System',
                content: 'An unexpected error occurred',
                type: 'error',
                error: { message: 'An unexpected error occurred' },
                timestamp: Date.now()
            });
            log.event.complete(eventId, 'failed');
        }
    }

    startNewProcess() {
        this.currentProcessId = this.notificationService.startNewProcess();
        return this.currentProcessId;
    }
}
