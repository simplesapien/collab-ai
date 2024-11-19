// src/conversation/conversationManager.js
import { log } from '../../utils/winstonLogger.js';
import { Validators } from '../../utils/validators.js';

export class ConversationManager {
    constructor(config = { maxConversations: 100, maxMessageAge: 24 * 60 * 60 * 1000 }) {
        const eventId = log.event.emit('init', 'ConversationManager');
        const startTime = Date.now();

        try {
            this.conversations = new Map();
            this.config = config;
            this.metadata = new Map();
            this.currentConversationId = null;

            log.debug('Conversation manager initialized', {
                maxConversations: config.maxConversations,
                maxMessageAge: config.maxMessageAge
            });

            log.state.change('ConversationManager', 'uninitialized', 'ready');
            log.perf.measure('conversation-manager-init', Date.now() - startTime);
            log.event.complete(eventId, 'completed');
        } catch (error) {
            log.error('Conversation manager initialization failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    logMessage(conversationId, message) {
        const eventId = log.event.emit('logMessage', 'ConversationManager', {
            conversationId,
            messageType: message?.type || 'standard'
        });
        const startTime = Date.now();

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

            log.perf.measure('message-logging', Date.now() - startTime, {
                conversationId,
                messageId: enhancedMessage.id
            });

            log.event.complete(eventId, 'completed', {
                messageId: enhancedMessage.id,
                conversationLength: conversation.messages.length
            });

            return enhancedMessage;
        } catch (error) {
            log.error('Message logging failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    getConversation(conversationId) {
        const eventId = log.event.emit('getConversation', 'ConversationManager', {
            conversationId
        });
        const startTime = Date.now();

        try {
            const conversation = this.conversations.get(conversationId);
            if (!conversation) {
                log.debug('Conversation not found', {
                    conversationId,
                    availableConversations: this.conversations.size
                });
                log.event.complete(eventId, 'completed', { found: false });
                return undefined;
            }
            
            this.updateMetadata(conversationId, { lastAccessed: Date.now() });

            log.perf.measure('conversation-retrieval', Date.now() - startTime, {
                conversationId,
                messageCount: conversation.messages.length
            });

            log.event.complete(eventId, 'completed', {
                found: true,
                messageCount: conversation.messages.length
            });

            return conversation;
        } catch (error) {
            log.error('Conversation retrieval failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    createConversation(conversationData) {
        const eventId = log.event.emit('createConversation', 'ConversationManager', {
            conversationId: conversationData.id
        });
        const startTime = Date.now();

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

            log.state.change('Conversation', 'creating', 'active', {
                conversationId: conversationData.id
            });

            log.perf.measure('conversation-creation', Date.now() - startTime, {
                conversationId: conversationData.id
            });

            log.event.complete(eventId, 'completed', {
                conversationId: conversationData.id
            });

            return conversation;
        } catch (error) {
            log.error('Conversation creation failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    updateMetadata(conversationId, additional = {}) {
        const eventId = log.event.emit('updateMetadata', 'ConversationManager', {
            conversationId
        });
        const startTime = Date.now();

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

            log.perf.measure('metadata-update', Date.now() - startTime, {
                conversationId,
                messageCount: metadata.messageCount
            });

            log.event.complete(eventId, 'completed', {
                messageCount: metadata.messageCount,
                participantCount: metadata.participants.length
            });
        } catch (error) {
            log.error('Metadata update failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    cleanup() {
        const eventId = log.event.emit('cleanup', 'ConversationManager');
        const startTime = Date.now();

        try {
            const now = Date.now();
            let removedCount = 0;
            
            // Remove old conversations
            for (const [id, meta] of this.metadata.entries()) {
                if (now - meta.lastUpdated > this.config.maxMessageAge) {
                    log.debug('Removing expired conversation', {
                        conversationId: id,
                        age: now - meta.lastUpdated
                    });
                    this.conversations.delete(id);
                    this.metadata.delete(id);
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
                    removedCount++;
                }
            }

            log.perf.measure('conversation-cleanup', Date.now() - startTime, {
                removedCount,
                remainingCount: this.conversations.size
            });

            log.event.complete(eventId, 'completed', {
                removedCount,
                remainingCount: this.conversations.size
            });
        } catch (error) {
            log.error('Conversation cleanup failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    getConversationStats(conversationId) {
        const eventId = log.event.emit('getConversationStats', 'ConversationManager', {
            conversationId
        });
        const startTime = Date.now();

        try {
            const conversation = this.conversations.get(conversationId);
            if (!conversation) {
                log.debug('No conversation found for stats', { conversationId });
                log.event.complete(eventId, 'completed', { found: false });
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

            log.perf.measure('stats-calculation', Date.now() - startTime, {
                conversationId,
                messageCount: stats.messageCount
            });

            log.event.complete(eventId, 'completed', {
                messageCount: stats.messageCount,
                participantCount: stats.participantCount
            });

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
        const eventId = log.event.emit('getCurrentConversationId', 'ConversationManager');
        const startTime = Date.now();

        try {
            log.debug('Getting current conversation ID', {
                currentId: this.currentConversationId
            });

            log.perf.measure('get-current-conversation-id', Date.now() - startTime);
            log.event.complete(eventId, 'completed', {
                hasCurrentId: !!this.currentConversationId
            });

            return this.currentConversationId;
        } catch (error) {
            log.error('Failed to get current conversation ID', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }
}