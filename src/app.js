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
        console.log('🔔 Notifying listeners of response:', response);
        this.responseCallbacks.forEach(callback => {
            try {
                callback(response);
            } catch (error) {
                console.error('Error in response callback:', error);
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
            console.log('Processing message in app.js:', message);

            // Create new conversation if none exists
            if (!conversationId) {
                conversationId = generateId('conv-');
                this.activeConversations.set(conversationId, {
                    startTime: Date.now(),
                    messageCount: 0
                });
            }

            // Enhance message with metadata
            const enhancedMessage = {
                agentId: 'user',
                content: message.content,
                timestamp: Date.now()
            };

            Logger.info(`Processing user message for conversation ${conversationId}`);

            // Add logging to debug the discussion responses
            console.log('Calling orchestrateDiscussion...');
            const discussionResults = await this.systemCoordinator.orchestrateDiscussion(
                conversationId,
                enhancedMessage
            );
            console.log('Raw discussion responses:', discussionResults);

            // Format both plan and responses
            let formattedResponses = [];

            // First, add the director's plan for each agent
            console.log('📝 Processing director plan responses');
            discussionResults.plan.forEach(participant => {
                const directorResponse = {
                    agentId: 'director-1',
                    content: `Director assigns ${participant.role}: ${participant.task}`,
                    role: 'Director'
                };
                console.log('🎯 Emitting director response:', directorResponse);
                this.notifyResponseListeners(directorResponse);
            });

            // Then add each agent's response
            console.log('🤖 Processing agent responses');
            for (const response of discussionResults.responses) {
                const formattedResponse = {
                    agentId: response.agentId,
                    content: `${response.role}: ${response.response}`,
                    role: response.role
                };
                console.log('🎯 Emitting agent response:', formattedResponse);
                this.notifyResponseListeners(formattedResponse);
            }

            console.log('Formatted responses:', formattedResponses);

            return {
                conversationId,
                responses: formattedResponses,
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

    async getConversationSummary(conversationId) {
        return await this.systemCoordinator.getConversationSummary(conversationId);
    }

    getSystemStatus() {
        return {
            activeConversations: this.activeConversations.size,
            agents: this.systemCoordinator.getAllAgentStatuses(),
            uptime: process.uptime()
        };
    }
}