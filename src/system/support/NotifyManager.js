import { Logger } from '../../utils/logger.js';

export class NotificationHandler {
    constructor() {
        this.notifyResponse = null;
        this.onAgentThinkingCallback = null;
    }

    initialize(notifyCallback) {
        this.notifyResponse = notifyCallback;
        Logger.debug('[NotificationHandler] Initialized with callback');
    }

    notify(response) {
        if (this.notifyResponse) {
            this.notifyResponse(response);
        }

    }

    setOnAgentThinking(callback) {
        this.onAgentThinkingCallback = callback;
        Logger.debug('[NotificationHandler] Set agent thinking callback');
    }

    onAgentThinking(agentId, phase = 'thinking') {
        if (this.onAgentThinkingCallback) {
            this.onAgentThinkingCallback(agentId, phase);
        }
    }
} 