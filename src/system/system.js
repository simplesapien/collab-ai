// src/system/system.js
import { ConversationManager } from './support/ConversationManager.js';
import { LLMService } from '../services/LLMService.js';
import { log } from '../utils/logger.js';
import { config } from '../config/config.js';
import { QualityGate } from './quality/QualityGate.js';
import { Coordinator } from './coordination/coordinator.js';
import { AgentManager } from './support/AgentManager.js';
import { InsightManager } from './support/InsightManager.js';

export class System {
    constructor() {
        const eventId = log.event.emit('init', 'System');
        const startTime = Date.now();

        try {
            this.coordinator = null;
            this.agentManager = null;
            this.conversationManager = null;
            this.llmService = null;
            this.qualityGate = new QualityGate();
            this.insightManager = new InsightManager(this.qualityGate);

            log.state.change('System', 'uninitialized', 'ready');
            log.perf.measure('system-init', Date.now() - startTime);
            log.event.complete(eventId, 'completed');
        } catch (error) {
            log.error('System initialization failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    async initialize(agentConfigs, notifyManager) {
        const eventId = log.event.emit('initialize', 'System', {
            agentCount: Object.keys(agentConfigs).length
        });
        const startTime = Date.now();

        try {
            log.debug('Starting system initialization', {
                agentConfigCount: Object.keys(agentConfigs).length
            });

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

            log.state.change('System', 'initializing', 'ready');
            log.perf.measure('system-initialization', Date.now() - startTime, {
                agentCount: Object.keys(agentConfigs).length
            });
            
            log.event.complete(eventId, 'completed');
        } catch (error) {
            log.error('System initialization failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    async handleMessage(conversationId, message) {
        const eventId = log.event.emit('handleMessage', 'System', {
            conversationId,
            messageType: message?.type || 'standard'
        });
        const startTime = Date.now();

        try {
            log.debug('Processing message', {
                conversationId,
                messageType: message?.type,
                targetAgentId: message?.targetAgentId
            });

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

            log.perf.measure('message-handling', Date.now() - startTime, {
                conversationId,
                agentId: agent.id
            });

            log.event.complete(eventId, 'completed', {
                responseGenerated: true,
                agentId: agent.id
            });

            return agentResponse;
        } catch (error) {
            log.error('Message handling failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    getAgentStatus(agentId) {
        const eventId = log.event.emit('getAgentStatus', 'System', { agentId });
        const startTime = Date.now();

        try {
            const status = this.agentManager.getAgentStatus(agentId);
            
            log.perf.measure('agent-status-retrieval', Date.now() - startTime, {
                agentId
            });
            
            log.event.complete(eventId, 'completed');
            return status;
        } catch (error) {
            log.error('Agent status retrieval failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    getAllAgentStatuses() {
        const eventId = log.event.emit('getAllAgentStatuses', 'System');
        const startTime = Date.now();

        try {
            const statuses = this.agentManager.getAllAgentStatuses();
            
            log.perf.measure('all-agent-statuses-retrieval', Date.now() - startTime, {
                agentCount: Object.keys(statuses).length
            });
            
            log.event.complete(eventId, 'completed', {
                agentCount: Object.keys(statuses).length
            });
            return statuses;
        } catch (error) {
            log.error('All agent statuses retrieval failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    getLLMService() {
        return this.llmService;
    }

    cleanup() {
        const eventId = log.event.emit('cleanup', 'System');
        const startTime = Date.now();

        try {
            this.notifyManager.cleanup();
            
            log.perf.measure('system-cleanup', Date.now() - startTime);
            log.event.complete(eventId, 'completed');
        } catch (error) {
            log.error('System cleanup failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }
}