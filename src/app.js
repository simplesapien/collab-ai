// src/app.js
import { System } from './system/system.js';
import { agentConfigs } from './config/agentConfigs.js';
import { log } from './utils/winstonLogger.js';
import { generateId } from './utils/generators.js';
import { NotifyManager } from './system/notification/NotifyManager.js';

export class Application {
    constructor() {
        const eventId = log.event.emit('init', 'Application');
        const startTime = Date.now();

        try {
            this.system = new System();
            this.activeConversations = new Map();
            this.notifyManager = new NotifyManager();
            this.thinkingCallback = null;
            this.isCancelling = false;

            log.debug('Application initialized', {
                hasNotifyManager: !!this.notifyManager
            });

            log.state.change('Application', 'uninitialized', 'ready');
            log.perf.measure('application-init', Date.now() - startTime);
            log.event.complete(eventId, 'completed');
        } catch (error) {
            log.error('Application initialization failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    onResponse(callback) {
        const eventId = log.event.emit('registerResponseCallback', 'Application');
        const startTime = Date.now();

        try {
            const cleanup = this.notifyManager.initialize(callback, this.thinkingCallback);
            
            log.perf.measure('response-callback-registration', Date.now() - startTime);
            log.event.complete(eventId, 'completed');
            
            return cleanup;
        } catch (error) {
            log.error('Response callback registration failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    onAgentThinking(callback) {
        const eventId = log.event.emit('registerThinkingCallback', 'Application');
        const startTime = Date.now();

        try {
            this.thinkingCallback = callback;
            
            log.debug('Thinking callback registered');
            log.perf.measure('thinking-callback-registration', Date.now() - startTime);
            log.event.complete(eventId, 'completed');
        } catch (error) {
            log.error('Thinking callback registration failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    async initialize() {
        const eventId = log.event.emit('initialize', 'Application');
        const startTime = Date.now();

        try {
            await this.system.initialize(
                agentConfigs,
                this.notifyManager
            );
            
            log.state.change('Application', 'initializing', 'ready');
            log.perf.measure('application-initialization', Date.now() - startTime);
            log.event.complete(eventId, 'completed');
        } catch (error) {
            log.error('Application initialization failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    async processUserMessage(message, conversationId = null) {
        const eventId = log.event.emit('processUserMessage', 'Application', {
            hasConversationId: !!conversationId,
            messageLength: message?.content?.length
        });
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
                log.debug('Created new conversation', { conversationId });
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

            if (discussionResults.cancelled) {
                log.debug('Discussion was cancelled', { conversationId });
                log.event.complete(eventId, 'cancelled');
                return {
                    conversationId,
                    responses: [],
                    summary: null,
                    cancelled: true
                };
            }

            const conversation = this.activeConversations.get(conversationId);
            if (conversation) {
                conversation.messageCount++;
            }

            log.perf.measure('message-processing', Date.now() - startTime, {
                conversationId,
                responseCount: discussionResults.responses?.length
            });

            log.event.complete(eventId, 'completed', {
                responseCount: discussionResults.responses?.length,
                hasSummary: !!discussionResults.summary
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
            
            log.event.complete(eventId, 'failed');
            
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
        const eventId = log.event.emit('getSystemStatus', 'Application');
        const startTime = Date.now();

        try {
            const status = {
                activeConversations: this.activeConversations.size,
                agents: this.system.getAllAgentStatuses(),
                uptime: process.uptime()
            };

            log.perf.measure('status-retrieval', Date.now() - startTime, {
                conversationCount: status.activeConversations
            });

            log.event.complete(eventId, 'completed', {
                conversationCount: status.activeConversations
            });

            return status;
        } catch (error) {
            log.error('System status retrieval failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    async getCostSummary() {
        const eventId = log.event.emit('getCostSummary', 'Application');
        const startTime = Date.now();

        try {
            const costs = this.system.getLLMService().getCostSummary();
            
            log.perf.measure('cost-summary-retrieval', Date.now() - startTime, {
                totalCost: costs.totalCost
            });

            log.event.complete(eventId, 'completed', {
                totalCost: costs.totalCost,
                totalTokens: costs.inputTokens + costs.outputTokens
            });

            return costs;
        } catch (error) {
            log.error('Cost summary retrieval failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    async resetCosts() {
        const eventId = log.event.emit('resetCosts', 'Application');
        const startTime = Date.now();

        try {
            this.system.getLLMService().resetCosts();
            
            log.state.change('CostTracking', 'active', 'reset');
            log.perf.measure('cost-reset', Date.now() - startTime);
            log.event.complete(eventId, 'completed');
        } catch (error) {
            log.error('Cost reset failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    async cancelCurrentProcess() {
        const eventId = log.event.emit('cancelCurrentProcess', 'Application');
        const startTime = Date.now();

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
            
            log.state.change('Process', 'active', 'cancelled');
            log.perf.measure('process-cancellation', Date.now() - startTime);
            log.event.complete(eventId, 'completed');
        } catch (error) {
            log.error('Process cancellation failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        } finally {
            setTimeout(() => {
                this.isCancelling = false;
                log.state.change('Process', 'cancelled', 'ready');
            }, 100);
        }
    }
}
