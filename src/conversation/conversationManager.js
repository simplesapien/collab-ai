// src/conversation/conversationManager.js
import { Logger } from '../utils/logger.js';
import { Validators } from '../utils/validators.js';

export class ConversationManager {
    constructor(config = { maxConversations: 100, maxMessageAge: 24 * 60 * 60 * 1000 }) {
        this.conversations = new Map();
        this.config = config;
        this.metadata = new Map();
    }

    logMessage(conversationId, message) {
        try {
            if (!Validators.isValidMessage(message)) {
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

            Logger.debug(`Message logged for conversation ${conversationId}`, enhancedMessage);
            return enhancedMessage;
        } catch (error) {
            Logger.error('Error in logMessage:', error);
            throw error;
        }
    }

    getConversation(conversationId) {
        const conversation = this.conversations.get(conversationId);
        if (!conversation) {
            Logger.warn(`Conversation ${conversationId} not found`);
            return undefined;
        }
        
        this.updateMetadata(conversationId, { lastAccessed: Date.now() });
        return conversation;
    }

    createConversation(conversation) {
        try {
            if (!Validators.isValidConversation(conversation)) {
                throw new Error('Invalid conversation format');
            }

            const enhancedConversation = {
                ...conversation,
                created: Date.now(),
                messages: conversation.messages || [],
                metadata: {
                    participantIds: new Set(),
                    messageCount: 0,
                    lastActivity: Date.now()
                }
            };

            this.conversations.set(conversation.id, enhancedConversation);
            this.updateMetadata(conversation.id);
            this.cleanup();

            Logger.info(`Created new conversation ${conversation.id}`);
            return enhancedConversation;
        } catch (error) {
            Logger.error('Error in createConversation:', error);
            throw error;
        }
    }

    updateMetadata(conversationId, additional = {}) {
        const conversation = this.conversations.get(conversationId);
        if (!conversation) return;

        this.metadata.set(conversationId, {
            lastUpdated: Date.now(),
            messageCount: conversation.messages.length,
            participants: Array.from(new Set(conversation.messages.map(m => m.agentId))),
            ...additional
        });
    }

    cleanup() {
        const now = Date.now();
        
        // Remove old conversations
        for (const [id, meta] of this.metadata.entries()) {
            if (now - meta.lastUpdated > this.config.maxMessageAge) {
                Logger.info(`Removing expired conversation ${id}`);
                this.conversations.delete(id);
                this.metadata.delete(id);
            }
        }

        // Limit total conversations
        if (this.conversations.size > this.config.maxConversations) {
            const sortedConversations = Array.from(this.metadata.entries())
                .sort(([, a], [, b]) => a.lastUpdated - b.lastUpdated);
                
            while (this.conversations.size > this.config.maxConversations) {
                const [oldestId] = sortedConversations.shift();
                Logger.info(`Removing oldest conversation ${oldestId} due to limit`);
                this.conversations.delete(oldestId);
                this.metadata.delete(oldestId);
            }
        }
    }

    getConversationStats(conversationId) {
        const conversation = this.conversations.get(conversationId);
        if (!conversation) return null;

        const messages = conversation.messages;
        return {
            messageCount: messages.length,
            participantCount: new Set(messages.map(m => m.agentId)).size,
            duration: Date.now() - conversation.created,
            averageResponseTime: this._calculateAverageResponseTime(messages),
            messagesByAgent: this._countMessagesByAgent(messages)
        };
    }

    _calculateAverageResponseTime(messages) {
        if (messages.length < 2) return 0;
        
        let totalTime = 0;
        let count = 0;
        
        for (let i = 1; i < messages.length; i++) {
            totalTime += messages[i].timestamp - messages[i-1].timestamp;
            count++;
        }
        
        return totalTime / count;
    }

    _countMessagesByAgent(messages) {
        return messages.reduce((acc, msg) => {
            acc[msg.agentId] = (acc[msg.agentId] || 0) + 1;
            return acc;
        }, {});
    }
}