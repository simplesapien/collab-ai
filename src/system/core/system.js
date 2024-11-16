// src/system/system.js
import { ConversationManager } from '../support/ConversationManager.js';
import { LLMService } from '../../services/llm.js';
import { Logger } from '../../utils/logger.js';
import { config } from '../../config/config.js';
import { AgentFactory } from '../../agents/agentFactory.js';
import { QualityGate } from '../../quality/QualityGate.js';
import { Coordinator } from './coordinator.js';
import { AgentManager } from '../support/AgentManager.js';
import { NotificationHandler } from '../support/NotifyManager.js';

export class System {
    constructor() {
        this.conversationManager = new ConversationManager(config.conversation);
        this.llmService = new LLMService(config.llm);
        this.agentManager = new AgentManager(this.llmService);
        this.activeConversations = new Set();
        this.qualityGate = new QualityGate(config.collaboration);
        this.coordinator = null;
        this.notificationHandler = new NotificationHandler();
    }

    async initialize(agentConfigs, notifyCallback, thinkingCallback) {
        try {
            // Initialize notification handler with both callbacks
            this.notificationHandler.initialize(
                notifyCallback,
                thinkingCallback
            );
            
            // Initialize all agents via AgentManager
            await this.agentManager.initializeAgents(agentConfigs);
            
            // Create coordinator with notification handler
            this.coordinator = new Coordinator(
                this.conversationManager,
                this.agentManager,
                this.qualityGate, 
                (response) => this.notificationHandler.notify(response),
                (agentId, phase) => this.notificationHandler.notifyThinking(agentId, phase)
            );
            
        } catch (error) {
            Logger.error('Error initializing System:', error);
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

            this.notificationHandler.notifyThinking(message.targetAgentId, 'thinking');

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
}