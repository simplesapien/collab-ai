// src/app.js
import { System } from './system/system.js';
import { agentConfigs } from './config/agentConfigs.js';
import { Logger } from './utils/logger.js';
import { generateId } from './utils/generators.js';

export class Application {
    constructor() {
        this.system = new System();
        this.activeConversations = new Map();
        this.responseCallbacks = new Set();
        this.notifyResponseListeners = this.notifyResponseListeners.bind(this);
    }

    onResponse(callback) {
        this.responseCallbacks.add(callback);
        return () => this.responseCallbacks.delete(callback);
    }

    notifyResponseListeners(response) {
        Logger.debug('🔔 Application notifying listeners of response:', response);
        this.responseCallbacks.forEach(callback => {
            try {
                callback(response);
            } catch (error) {
                Logger.error('Error in response callback:', error);
            }
        });
    }

    async initialize() {
        try {
            await this.system.initialize(
                agentConfigs, 
                this.notifyResponseListeners.bind(this)
            );
            
            Logger.info('Application initialized successfully');
        } catch (error) {
            Logger.error('Failed to initialize application:', error);
            throw error;
        }
    }

    async processUserMessage(message, conversationId = null) {
        try {
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
                timestamp: Date.now()
            };

            Logger.info(`Processing user message for conversation ${conversationId}`);
            
            // Add debug log before orchestrating discussion
            Logger.debug('Starting discussion orchestration with callback:', !!this.responseCallbacks.size);
            const discussionResults = await this.system.collaborationOrchestrator.orchestrateDiscussion(
                conversationId,
                enhancedMessage
            );

            return {
                conversationId,
                responses: discussionResults.responses,
                summary: discussionResults.summary
            };

        } catch (error) {
            Logger.error('Error processing user message:', error);
            return {
                conversationId,
                responses: [{
                    agentId: 'system',
                    content: 'I apologize, but I encountered an error processing your message. Please try again.',
                    error: true
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

    async onAgentThinking(callback) {
        Logger.debug('Setting up thinking callback');
        this.thinkingCallback = callback;
        if (this.system) {
            this.system.onAgentThinking = (agentId, phase) => {
                Logger.debug('Thinking callback triggered:', { agentId, phase });
                if (this.thinkingCallback) {
                    this.thinkingCallback(agentId, phase);
                }
            };
        }
    }
}