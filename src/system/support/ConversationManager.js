// src/conversation/conversationManager.js
import { log } from '../../utils/logger.js';
import { Validators } from '../../utils/validators.js';
import { InsightManager } from './InsightManager.js';

export class ConversationManager {
    constructor(config = { maxConversations: 100, maxMessageAge: 24 * 60 * 60 * 1000 }) {
        try {
            this.conversations = new Map();
            this.config = config;
            this.metadata = new Map();
            this.currentConversationId = null;
            this.insightManager = new InsightManager();
        } catch (error) {
            log.error('Conversation manager initialization failed', error);
            throw error;
        }
    }

    logMessage(conversationId, message) {
        try {
            log.debug('Logging new message', {
                conversationId,
                agentId: message?.agentId,
                messageType: message?.type
            });
            
            if (!Validators.isValidMessage(message)) {
                log.error('Invalid message format', { message });
                throw new Error('Invalid message format');
            }

            const conversation = this.conversations.get(conversationId) || {
                id: conversationId,
                messages: [],
                created: Date.now()
            };

            const enhancedMessage = {
                ...message,
                timestamp: Date.now(),
                id: `${conversationId}-${conversation.messages.length}`
            };

            conversation.messages.push(enhancedMessage);
            this.conversations.set(conversationId, conversation);
            this.updateMetadata(conversationId);
            this.cleanup();

            return enhancedMessage;
        } catch (error) {
            log.error('Message logging failed', error);
            throw error;
        }
    }

    getConversation(conversationId) {
        try {
            const conversation = this.conversations.get(conversationId);
            if (!conversation) {
                log.debug('Conversation not found', {
                    conversationId,
                    availableConversations: this.conversations.size
                });
                return undefined;
            }
            
            this.updateMetadata(conversationId, { lastAccessed: Date.now() });
            return conversation;
        } catch (error) {
            log.error('Conversation retrieval failed', error);
            throw error;
        }
    }

    createConversation(conversationData) {
        try {
            log.debug('Creating new conversation', {
                conversationId: conversationData.id,
                initialData: !!conversationData
            });

            this.currentConversationId = conversationData.id;
            const conversation = {
                id: conversationData.id,
                messages: [],
                ...conversationData
            };
            
            this.conversations.set(conversationData.id, conversation);
            this.updateMetadata(conversationData.id);
            this.cleanup();
            return conversation;
        } catch (error) {
            log.error('Conversation creation failed', error);
            throw error;
        }
    }

    updateMetadata(conversationId, additional = {}) {
        try {
            const conversation = this.conversations.get(conversationId);
            if (!conversation) {
                log.debug('No conversation found for metadata update', {
                    conversationId
                });
                return;
            }

            const metadata = {
                lastUpdated: Date.now(),
                messageCount: conversation.messages.length,
                participants: Array.from(new Set(conversation.messages.map(m => m.agentId))),
                ...additional
            };

            this.metadata.set(conversationId, metadata);
        } catch (error) {
            log.error('Metadata update failed', error);
            throw error;
        }
    }

    cleanup() {
        const startTime = Date.now();
        try {
            const now = Date.now();
            let removedCount = 0;
            
            // Remove old conversations and their insights
            for (const [id, meta] of this.metadata.entries()) {
                if (now - meta.lastUpdated > this.config.maxMessageAge) {
                    log.debug('Removing expired conversation', {
                        conversationId: id,
                        age: now - meta.lastUpdated
                    });
                    this.conversations.delete(id);
                    this.metadata.delete(id);
                    this.insightManager.insights.delete(id);
                    removedCount++;
                }
            }

            // Handle conversation limit
            if (this.conversations.size > this.config.maxConversations) {
                const sortedConversations = Array.from(this.metadata.entries())
                    .sort(([, a], [, b]) => a.lastUpdated - b.lastUpdated);
                    
                while (this.conversations.size > this.config.maxConversations) {
                    const [oldestId] = sortedConversations.shift();
                    log.debug('Removing oldest conversation', {
                        conversationId: oldestId,
                        reason: 'LIMIT_EXCEEDED'
                    });
                    this.conversations.delete(oldestId);
                    this.metadata.delete(oldestId);
                    this.insightManager.insights.delete(oldestId);
                    removedCount++;
                }
            }

            log.perf.measure('conversation-cleanup', Date.now() - startTime, {
                removedCount,
                remainingCount: this.conversations.size
            });

        } catch (error) {
            log.error('Conversation cleanup failed', error);
            throw error;
        }
    }

    getConversationStats(conversationId) {
        try {
            const conversation = this.conversations.get(conversationId);
            if (!conversation) {
                log.debug('No conversation found for stats', { conversationId });
                return null;
            }

            const messages = conversation.messages;
            const stats = {
                messageCount: messages.length,
                participantCount: new Set(messages.map(m => m.agentId)).size,
                duration: Date.now() - conversation.created,
                averageResponseTime: this._calculateAverageResponseTime(messages),
                messagesByAgent: this._countMessagesByAgent(messages)
            };

            return stats;
        } catch (error) {
            log.error('Stats calculation failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    _calculateAverageResponseTime(messages) {
        const eventId = log.event.emit('calculateAverageResponseTime', 'ConversationManager', {
            messageCount: messages.length
        });
        const startTime = Date.now();

        try {
            if (messages.length < 2) {
                log.debug('Not enough messages for average calculation', {
                    messageCount: messages.length
                });
                log.event.complete(eventId, 'completed', { average: 0 });
                return 0;
            }
            
            let totalTime = 0;
            let count = 0;
            
            for (let i = 1; i < messages.length; i++) {
                totalTime += messages[i].timestamp - messages[i-1].timestamp;
                count++;
            }
            
            const average = totalTime / count;

            log.perf.measure('response-time-calculation', Date.now() - startTime, {
                messageCount: messages.length,
                average
            });

            log.event.complete(eventId, 'completed', { average });
            return average;
        } catch (error) {
            log.error('Average response time calculation failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    _countMessagesByAgent(messages) {
        const eventId = log.event.emit('countMessagesByAgent', 'ConversationManager', {
            messageCount: messages.length
        });
        const startTime = Date.now();

        try {
            const counts = messages.reduce((acc, msg) => {
                acc[msg.agentId] = (acc[msg.agentId] || 0) + 1;
                return acc;
            }, {});

            log.perf.measure('message-count-by-agent', Date.now() - startTime, {
                agentCount: Object.keys(counts).length
            });

            log.event.complete(eventId, 'completed', {
                agentCount: Object.keys(counts).length,
                totalMessages: messages.length
            });

            return counts;
        } catch (error) {
            log.error('Message counting by agent failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    getCurrentConversationId() {
        try {
            log.debug('Getting current conversation ID', {
                currentId: this.currentConversationId
            });

            return this.currentConversationId;
        } catch (error) {
            log.error('Failed to get current conversation ID', error);
            throw error;
        }
    }

    addInsight(conversationId, insight) {
        return this.insightManager.addInsight(conversationId, insight);
    }

    getRecentInsights(conversationId, limit) {
        return this.insightManager.getRecentInsights(conversationId, limit);
    }
}