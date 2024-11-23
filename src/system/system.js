// src/system/system.js
import { ConversationManager } from './support/ConversationManager.js';
import { LLMService } from '../services/LLMService.js';
import { log } from '../utils/logger.js';
import { QualityGate } from './quality/QualityGate.js';
import { Coordinator } from './coordination/coordinator.js';
import { AgentManager } from './support/AgentManager.js';
import { InsightManager } from './support/InsightManager.js';

export class System {
    constructor() {
        try {
            this.coordinator = null;
            this.agentManager = null;
            this.conversationManager = null;
            this.llmService = null;
            this.qualityGate = new QualityGate();
            this.insightManager = new InsightManager(this.qualityGate);
        } catch (error) {
            log.error('System initialization failed', error);
            throw error;
        }
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
                notifyManager,
                this.insightManager
            );

            // Initialize agents
            await this.agentManager.initializeAgents(agentConfigs);
        } catch (error) {
            log.error('System initialization failed', error);
            throw error;
        }
    }

    async handleMessage(conversationId, message) {
        try {
            // Create or get conversation
            let conversation = this.conversationManager.getConversation(conversationId);
            if (!conversation) {
                conversation = this.conversationManager.createConversation({
                    id: conversationId,
                    messages: []
                });
            }

            // Log the incoming message
            this.conversationManager.logMessage(conversationId, message);

            // Get target agent
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
            return agentResponse;
        } catch (error) {
            log.error('Message handling failed', error);
            throw error;
        }
    }

    getAgentStatus(agentId) {
     
        try {
            return this.agentManager.getAgentStatus(agentId);
        } catch (error) {
            log.error('Agent status retrieval failed', error);
            throw error;
        }
    }

    getAllAgentStatuses() {
        try {          
            return this.agentManager.getAllAgentStatuses();
        } catch (error) {
            log.error('All agent statuses retrieval failed', error);
            throw error;
        }
    }

    getLLMService() {
        return this.llmService;
    }

    cleanup() {
        try {
            return this.notifyManager.cleanup();
        } catch (error) {
            log.error('System cleanup failed', error);
            throw error;
        }
    }
}