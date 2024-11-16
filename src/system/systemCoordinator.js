// src/system/systemCoordinator.js
import { ConversationManager } from '../conversation/conversationManager.js';
import { LLMService } from '../services/llm.js';
import { Logger } from '../utils/logger.js';
import { config } from '../config/config.js';
import { AgentFactory } from '../agents/agentFactory.js';
import { QualityGate } from '../quality/QualityGate.js';
import { CollaborationOrchestrator } from './collaborationOrchestrator.js';

export class SystemCoordinator {
    constructor() {
        this.conversationManager = new ConversationManager(config.conversation);
        this.llmService = new LLMService(config.llm);
        // Map to store all active agents
        this.agents = new Map();
        // Track active conversations
        this.activeConversations = new Set();
        this.notifyResponse = null;
        this.qualityGate = new QualityGate(config.collaboration);
        this.collaborationOrchestrator = null;
    }

    async initialize(agentConfigs, notifyCallback) {
        try {
            this.notifyResponse = notifyCallback;
            
            // Initialize the collaboration orchestrator with both callbacks
            this.collaborationOrchestrator = new CollaborationOrchestrator(
                this.conversationManager,
                this.agents,
                this.qualityGate,
                this.notifyResponse,
                (agentId, phase) => this.notifyAgentThinking(agentId, phase)  // Pass the thinking callback
            );

            // Create and initialize each agent type
            for (const [type, config] of Object.entries(agentConfigs)) {
                const agent = this.initializeAgent(config);
                this.agents.set(agent.id, agent);
                Logger.info(`Initialized ${type} agent: ${agent.id}`);
            }
        } catch (error) {
            Logger.error('Error initializing SystemCoordinator:', error);
            throw error;
        }
    }

    initializeAgent(agentConfig) {
        return AgentFactory.createAgent(agentConfig, this.llmService);
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

            // Get target agent
            const agent = this.agents.get(message.targetAgentId);
            if (!agent) {
                throw new Error(`Agent not found: ${message.targetAgentId}`);
            }

            this.notifyAgentThinking(message.targetAgentId, 'thinking');

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
        const agent = this.agents.get(agentId);
        if (!agent) return null;

        return {
            id: agent.id,
            name: agent.name,
            role: agent.role,
            status: agent.state.active ? 'active' : 'inactive',
            lastInteraction: agent.state.lastInteraction,
            currentTask: agent.state.currentTask
        };
    }

    getAllAgentStatuses() {
        return Array.from(this.agents.values()).map(agent => this.getAgentStatus(agent.id));
    }

    getLLMService() {
        return this.llmService;
    }

    notifyAgentThinking(agentId, phase) {
        if (this.onAgentThinking) {
            this.onAgentThinking(agentId, phase);
        }
    }
}