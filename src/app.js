// src/app.js
import { System } from './system/system.js';
import { agentConfigs } from './config/agentConfigs.js';
import { log } from './utils/logger.js';
import { generateId } from './utils/generators.js';
import { NotifyManager } from './system/notification/NotifyManager.js';

export class Application {
    constructor() {

        try {
            this.system = new System();
            this.activeConversations = new Map();
            this.notifyManager = new NotifyManager();
            this.thinkingCallback = null;
            this.isCancelling = false;

            log.debug('Application initialized', {
                hasNotifyManager: !!this.notifyManager
            });

        } catch (error) {
            log.error('Application initialization failed', error);
            throw error;
        }
    }

    onResponse(callback) {
        try {
            const cleanup = this.notifyManager.initialize(callback, this.thinkingCallback);
            return cleanup;
        } catch (error) {
            log.error('Response callback registration failed', error);
            throw error;
        }
    }

    onAgentThinking(callback) {
        try {
            this.thinkingCallback = callback;
        } catch (error) {
            log.error('Thinking callback registration failed', error);
            throw error;
        }
    }

    async initialize() {
        const startTime = Date.now();

        try {
            await this.system.initialize(
                agentConfigs,
                this.notifyManager
            );            
            log.perf.measure('application-initialization', Date.now() - startTime);
        } catch (error) {
            log.error('Application initialization failed', error);
            throw error;
        }
    }

    async processUserMessage(message, conversationId = null) {
  
        const startTime = Date.now();

        try {
            this.notifyManager.startNewProcess();

            log.debug('Processing user message', {
                messagePreview: message?.content?.substring(0, 50),
                conversationId
            });

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

            const discussionResults = await this.system.coordinator.coordinateDiscussion(
                conversationId,
                enhancedMessage
            );

            const conversation = this.activeConversations.get(conversationId);
            if (conversation) {
                conversation.messageCount++;
            }

            log.perf.measure('message-processing', Date.now() - startTime, {
                conversationId,
                responseCount: discussionResults.responses?.length
            });

            return {
                conversationId,
                responses: discussionResults.responses || [],
                summary: discussionResults.summary
            };

        } catch (error) {
            log.error('User message processing failed', error);
            
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
        try {
            const status = {
                activeConversations: this.activeConversations.size,
                agents: this.system.getAllAgentStatuses(),
                uptime: process.uptime()
            };
            return status;
        } catch (error) {
            log.error('System status retrieval failed', error);
            throw error;
        }
    }

    async getCostSummary() {
        try {
            const costs = this.system.getLLMService().getCostSummary();
            return costs;
        } catch (error) {
            log.error('Cost summary retrieval failed', error);
            throw error;
        }
    }

    async resetCosts() {
        const startTime = Date.now();
        try {
            this.system.getLLMService().resetCosts();            
            log.perf.measure('cost-reset', Date.now() - startTime);
        } catch (error) {
            log.error('Cost reset failed', error);
            throw error;
        }
    }

    async cancelCurrentProcess() {

        try {
            log.debug('Initiating process cancellation');
            this.isCancelling = true;
            
            this.notifyManager.notifyResponse({
                agentId: 'system',
                role: 'System',
                content: 'Process cancelled. Ready for new input.',
                type: 'cancellation',
                timestamp: Date.now()
            });

            await this.system.coordinator.cancelCurrentProcess();            
        } catch (error) {
            log.error('Process cancellation failed', error);
            throw error;
        } finally {
            setTimeout(() => {
                this.isCancelling = false;
            }, 100);
        }
    }
}
