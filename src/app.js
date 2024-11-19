// src/app.js
import { System } from './system/system.js';
import { agentConfigs } from './config/agentConfigs.js';
import { Logger } from './utils/logger.js';
import { generateId } from './utils/generators.js';
import { NotifyManager } from './system/notification/NotifyManager.js';

export class Application {
    constructor() {
        this.system = new System();
        this.activeConversations = new Map();
        this.notifyManager = new NotifyManager();
        this.thinkingCallback = null;
        this.isCancelling = false;
        Logger.debug('[Application] Initialized with NotifyManager');
    }

    onResponse(callback) {
        return this.notifyManager.initialize(callback, this.thinkingCallback);
    }

    onAgentThinking(callback) {
        this.thinkingCallback = callback;
        Logger.debug('[Application] Registered thinking callback');
    }

    async initialize() {
        try {
            await this.system.initialize(
                agentConfigs,
                this.notifyManager
            );
            
            Logger.info('[Application] Initialized successfully');
        } catch (error) {
            Logger.error('[Application] Failed to initialize:', error);
            throw error;
        }
    }

    async processUserMessage(message, conversationId = null) {
        try {
            // Start new process
            this.notifyManager.startNewProcess();

            Logger.debug('Processing message in app.js:', message);

            // Create new conversation if none exists
            if (!conversationId) {
                conversationId = generateId('conv-');
                this.activeConversations.set(conversationId, {
                    startTime: Date.now(),
                    messageCount: 0
                });
            }

            const enhancedMessage = {
                agentId: 'user',
                content: message.content,
                timestamp: Date.now(),
                role: 'user'
            };

            Logger.info(`Processing user message for conversation ${conversationId}`);
            
            // Use system's coordinator directly
            const discussionResults = await this.system.coordinator.coordinateDiscussion(
                conversationId,
                enhancedMessage
            );

            // Check if the process was cancelled
            if (discussionResults.cancelled) {
                return {
                    conversationId,
                    responses: [],
                    summary: null,
                    cancelled: true
                };
            }

            // Update conversation message count
            const conversation = this.activeConversations.get(conversationId);
            if (conversation) {
                conversation.messageCount++;
            }

            return {
                conversationId,
                responses: discussionResults.responses || [],
                summary: discussionResults.summary
            };

        } catch (error) {
            Logger.error('Error processing user message:', error);
            
            // Don't notify error if we're cancelling
            if (!this.isCancelling) {
                this.notifyManager.notifyError(error);
            }
            
            return {
                conversationId,
                error: true,
                responses: [{
                    agentId: 'system',
                    role: 'System',
                    content: 'I apologize, but I encountered an error processing your message. Please try again.',
                    timestamp: Date.now(),
                    type: 'error'
                }],
                summary: null
            };
        }
    }

    getSystemStatus() {
        return {
            activeConversations: this.activeConversations.size,
            agents: this.system.getAllAgentStatuses(),
            uptime: process.uptime()
        };
    }

    async getCostSummary() {
        try {
            const costs = this.system.getLLMService().getCostSummary();
            Logger.info('[Application] Current cost summary:', costs);
            return costs;
        } catch (error) {
            Logger.error('[Application] Error getting cost summary:', error);
            throw error;
        }
    }

    async resetCosts() {
        try {
            this.system.getLLMService().resetCosts();
            Logger.info('[Application] Cost tracking reset');
        } catch (error) {
            Logger.error('[Application] Error resetting costs:', error);
            throw error;
        }
    }

    async cancelCurrentProcess() {
        Logger.debug('[Application] Cancelling current process');
        this.isCancelling = true;
        
        try {
            // Send cancellation notification directly through notify manager
            this.notifyManager.notifyResponse({
                agentId: 'system',
                role: 'System',
                content: 'Process cancelled. Ready for new input.',
                type: 'cancellation',
                timestamp: Date.now()
            });

            // Then cancel the coordinator process
            await this.system.coordinator.cancelCurrentProcess();
        } finally {
            // Reset cancellation state after a short delay
            setTimeout(() => {
                this.isCancelling = false;
            }, 100);
        }
    }
}
