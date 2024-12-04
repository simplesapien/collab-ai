// src/conversation/conversationManager.js
import { log } from '../../utils/logger.js';
import { Validators } from '../../utils/validators.js';

export class ConversationManager {
    constructor(config = { maxConversations: 100, maxMessageAge: 24 * 60 * 60 * 1000 }, insightManager = null) {
        try {
            this.conversations = new Map();
            this.config = config;
            this.metadata = new Map();
            this.currentConversationId = null;
            this.insightManager = insightManager;
        } catch (error) {
            log.error('Conversation manager initialization failed', error);
            throw error;
        }
    }

    logMessage(conversationId, message) {
        try {
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
            this.currentConversationId = conversationData.id;
            const conversation = {
                id: conversationData.id,
                messages: [],
                ...conversationData
            };
            
            this.conversations.set(conversationData.id, conversation);
            this.updateMetadata(conversationData.id);
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

    getConversationStats(conversationId) {
        try {
            const conversation = this.conversations.get(conversationId);
            if (!conversation) {
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
            throw error;
        }
    }

    _calculateAverageResponseTime(messages) {
        try {
            if (messages.length < 2) {
                return 0;
            }
            
            let totalTime = 0;
            let count = 0;
            
            for (let i = 1; i < messages.length; i++) {
                totalTime += messages[i].timestamp - messages[i-1].timestamp;
                count++;
            }
            
            const average = totalTime / count;

            return average;
        } catch (error) {
            log.error('Average response time calculation failed', error);
            throw error;
        }
    }

    _countMessagesByAgent(messages) {
        try {
            const counts = messages.reduce((acc, msg) => {
                acc[msg.agentId] = (acc[msg.agentId] || 0) + 1;
                return acc;
            }, {});

            return counts;
        } catch (error) {
            log.error('Message counting by agent failed', error);
            throw error;
        }
    }

    getCurrentConversationId() {
        try {
            return this.currentConversationId;
        } catch (error) {
            log.error('Failed to get current conversation ID', error);
            throw error;
        }
    }

}