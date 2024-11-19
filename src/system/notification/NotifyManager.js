import { NotificationService } from './NotificationService.js';
import { log } from '../../utils/winstonLogger.js';

export class NotifyManager {
    constructor() {
        const eventId = log.event.emit('init', 'NotifyManager');
        const startTime = Date.now();

        try {
            this.notificationService = new NotificationService();
            this.subscriptions = new Map();
            this.currentProcessId = null;

            log.state.change('NotifyManager', 'initializing', 'ready');
            log.perf.measure('notify-manager-init', Date.now() - startTime);
            log.event.complete(eventId, 'completed');
        } catch (error) {
            log.error('NotifyManager initialization failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    initialize(responseCallback, thinkingCallback) {
        const eventId = log.event.emit('initialize', 'NotifyManager', {
            hasResponseCallback: !!responseCallback,
            hasThinkingCallback: !!thinkingCallback
        });
        const startTime = Date.now();

        try {
            log.debug('Setting up notification listeners', {
                responseCallback: !!responseCallback,
                thinkingCallback: !!thinkingCallback
            });

            const responseListener = (response) => {
                if (responseCallback) {
                    responseCallback(response);
                    log.debug('Response callback executed', {
                        agentId: response?.agentId,
                        type: response?.type
                    });
                }
            };

            const thinkingListener = (stateUpdate) => {
                if (thinkingCallback) {
                    thinkingCallback(stateUpdate.agentId, stateUpdate.state);
                    log.debug('Thinking callback executed', {
                        agentId: stateUpdate.agentId,
                        state: stateUpdate.state
                    });
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

            log.perf.measure('notification-setup', Date.now() - startTime, {
                listenerCount: this.subscriptions.size
            });

            log.event.complete(eventId, 'completed', { 
                listeners: ['response', 'agentStateChange', 'error'] 
            });

            return () => {
                const cleanupEventId = log.event.emit('cleanup', 'NotifyManager');
                this.notificationService.removeListener('response', responseListener);
                this.notificationService.removeListener('agentStateChange', thinkingListener);
                this.notificationService.removeListener('error', errorListener);
                this.subscriptions.clear();
                log.event.complete(cleanupEventId);
            };
        } catch (error) {
            log.error('NotifyManager initialization failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    notifyResponse(response) {
        const eventId = log.event.emit('notifyResponse', 'NotifyManager', { 
            agentId: response?.agentId,
            responseType: response?.type || 'standard'
        });
        const startTime = Date.now();

        try {
            log.debug('Processing notification response', {
                agentId: response?.agentId,
                type: response?.type
            });

            this.notificationService.sendResponse(response);

            log.perf.measure('response-notification', Date.now() - startTime, {
                agentId: response?.agentId,
                type: response?.type
            });

            log.event.complete(eventId, 'completed');
        } catch (error) {
            log.error('Error sending response', error);
            this.notificationService.sendError(error, response?.agentId);
            log.event.complete(eventId, 'failed');
        }
    }

    notifyThinking(agentId, phase = 'thinking') {
        const eventId = log.event.emit('notifyThinking', 'NotifyManager', { 
            agentId, 
            phase 
        });
        const startTime = Date.now();

        try {
            log.debug('Updating agent thinking state', {
                agentId,
                phase
            });

            this.notificationService.updateAgentState(agentId, phase);

            log.perf.measure('thinking-notification', Date.now() - startTime, {
                agentId,
                phase
            });

            log.event.complete(eventId, 'completed');
        } catch (error) {
            log.error('Error updating agent state', error);
            this.notificationService.sendError(error, agentId);
            log.event.complete(eventId, 'failed');
        }
    }

    startNewProcess() {
        const eventId = log.event.emit('startNewProcess', 'NotifyManager');
        const startTime = Date.now();

        try {
            this.currentProcessId = this.notificationService.startNewProcess();
            
            log.perf.measure('process-start', Date.now() - startTime, {
                processId: this.currentProcessId
            });

            log.event.complete(eventId, 'completed', {
                processId: this.currentProcessId
            });

            return this.currentProcessId;
        } catch (error) {
            log.error('Failed to start new process', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }
}
