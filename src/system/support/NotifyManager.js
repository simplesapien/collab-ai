import { Logger } from '../../utils/logger.js';

export class NotificationHandler {
    constructor() {
        this.responseCallback = null;
        this.thinkingCallback = null;
        Logger.debug('[NotificationHandler] Initialized');
    }

    initialize(responseCallback, thinkingCallback) {
        try {
            this.responseCallback = responseCallback;
            this.thinkingCallback = thinkingCallback;
            Logger.debug('[NotificationHandler] Initialized with callbacks');
            return true;
        } catch (error) {
            Logger.error('[NotificationHandler] Error during initialization:', error);
            return false;
        }
    }

    notify(response) {
        try {
            if (this.responseCallback) {
                Logger.debug('[NotificationHandler] Emitting response');
                this.responseCallback(response);
            }
        } catch (error) {
            Logger.error('[NotificationHandler] Error in response callback:', error);
        }
    }

    notifyThinking(agentId, phase = 'thinking') {
        try {
            if (this.thinkingCallback) {
                Logger.debug('[NotificationHandler] Emitting thinking state:', { agentId, phase });
                this.thinkingCallback(agentId, phase);
            }
        } catch (error) {
            Logger.error('[NotificationHandler] Error in thinking callback:', error);
        }
    }

    clear() {
        this.responseCallback = null;
        this.thinkingCallback = null;
        Logger.debug('[NotificationHandler] Callbacks cleared');
    }
}