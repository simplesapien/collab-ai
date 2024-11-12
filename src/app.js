// src/app.js
import { SystemCoordinator } from './system/systemCoordinator.js';
import { agentConfigs } from './config/agentConfigs.js';
import { Logger } from './utils/logger.js';
import { generateId } from './utils/generators.js';

export class Application {
    constructor() {
        this.systemCoordinator = new SystemCoordinator();
        this.activeConversations = new Map();
        this.responseCallbacks = new Set();
    }

    onResponse(callback) {
        this.responseCallbacks.add(callback);
        return () => this.responseCallbacks.delete(callback);
    }

    notifyResponseListeners(response) {
        Logger.debug('🔔 Notifying listeners of response:', response);
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
            await this.systemCoordinator.initialize(agentConfigs, this.notifyResponseListeners.bind(this));
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
            
            // Get discussion results - responses will be emitted in real-time by SystemCoordinator
            const discussionResults = await this.systemCoordinator.orchestrateDiscussion(
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
            agents: this.systemCoordinator.getAllAgentStatuses(),
            uptime: process.uptime()
        };
    }

    async getCostSummary() {
        try {
            const costs = this.systemCoordinator.getLLMService().getCostSummary();
            Logger.info('[Application] Current cost summary:', costs);
            return costs;
        } catch (error) {
            Logger.error('[Application] Error getting cost summary:', error);
            throw error;
        }
    }

    async resetCosts() {
        try {
            this.systemCoordinator.getLLMService().resetCosts();
            Logger.info('[Application] Cost tracking reset');
        } catch (error) {
            Logger.error('[Application] Error resetting costs:', error);
            throw error;
        }
    }
}