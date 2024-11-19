// src/system/system.js
import { ConversationManager } from './support/ConversationManager.js';
import { LLMService } from '../services/llm.js';
import { Logger } from '../utils/logger.js';
import { config } from '../config/config.js';
import { QualityGate } from './quality/QualityGate.js';
import { Coordinator } from './coordination/coordinator.js';
import { AgentManager } from './support/AgentManager.js';

export class System {
    constructor() {
        this.coordinator = null;
        this.agentManager = null;
        this.conversationManager = null;
        this.llmService = null;
        this.qualityGate = new QualityGate();
    }

    async initialize(agentConfigs, notifyManager) {
        try {
            // Initialize services
            this.llmService = new LLMService();
            this.agentManager = new AgentManager(this.llmService);
            this.conversationManager = new ConversationManager();

            // Initialize coordinator with notifyManager
            this.coordinator = new Coordinator(
                this.conversationManager,
                this.agentManager,
                this.qualityGate,
                notifyManager
            );

            // Initialize agents
            await this.agentManager.initializeAgents(agentConfigs);

            Logger.info('[System] Initialized successfully');
        } catch (error) {
            Logger.error('[System] Failed to initialize:', error);
            throw error;
        }
    }

    async handleMessage(conversationId, message) {
        try {
            Logger.debug(`Handling message for conversation ${conversationId}`, message);

            // Create or get conversation
            let conversation = this.conversationManager.getConversation(conversationId);
            if (!conversation) {
                conversation = this.conversationManager.createConversation({
                    id: conversationId,
                    messages: []
                });
                this.activeConversations.add(conversationId);
            }

            // Log the incoming message
            this.conversationManager.logMessage(conversationId, message);

            // Get target agent from AgentManager instead of direct access
            const agent = this.agentManager.getAgent(message.targetAgentId);
            if (!agent) {
                throw new Error(`Agent not found: ${message.targetAgentId}`);
            }

            this.notifyManager.notifyThinking(message.targetAgentId, 'thinking');

            // Generate response
            const response = await agent.generateResponse(
                conversation.messages,
                message.content
            );

            // Log the response
            const agentResponse = {
                agentId: agent.id,
                content: response,
                timestamp: Date.now()
            };
            this.conversationManager.logMessage(conversationId, agentResponse);

            Logger.debug(`Generated response for conversation ${conversationId}`, agentResponse);
            return agentResponse;

        } catch (error) {
            Logger.error(`Error handling message for conversation ${conversationId}:`, error);
            throw error;
        }
    }

    getAgentStatus(agentId) {
        return this.agentManager.getAgentStatus(agentId);
    }

    getAllAgentStatuses() {
        return this.agentManager.getAllAgentStatuses();
    }

    getLLMService() {
        return this.llmService;
    }

    cleanup() {
        try {
            this.notifyManager.cleanup();
            Logger.debug('[System] Cleanup completed');
        } catch (error) {
            Logger.error('[System] Error during cleanup:', error);
        }
    }
}