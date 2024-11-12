import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify/dist/purify.es.js';
import { Logger } from '../utils/logger.js';

export class ChatInterface {
    constructor(app) {
        this.app = app;
        this.chatMessages = null;
        this.userInput = null;
        this.sendButton = null;
        this.currentConversationId = null;
        this.loadingMessage = null;
        
        // Wait for DOM to be ready before initializing
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            this.initialize();
        }
    }

    initialize() {
        Logger.info('[ChatInterface] Initializing ChatInterface...');
        try {
            // Initialize DOM elements
            this.chatMessages = document.getElementById('chat-messages');
            this.userInput = document.getElementById('user-input');
            this.sendButton = document.getElementById('send-button');

            if (!this.chatMessages || !this.userInput || !this.sendButton) {
                throw new Error('Required UI elements not found');
            }

            this.setupEventListeners();
            this.setupResponseListener();
            Logger.info('[ChatInterface] ChatInterface initialized successfully');
        } catch (error) {
            Logger.error('[ChatInterface] Failed to initialize ChatInterface:', error);
            throw error;
        }
    }

    setupEventListeners() {
        // Send button click handler
        this.sendButton.addEventListener('click', () => this.handleSendMessage());

        // Enter key handler
        this.userInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                this.handleSendMessage();
            }
        });
    }

    setupResponseListener() {
        Logger.debug('[ChatInterface] Setting up response listener');
        this.app.onResponse((response) => {
            Logger.debug('[ChatInterface] Received response:', {
                agentId: response.agentId,
                role: response.role,
                contentPreview: response.content.substring(0, 50)
            });
            
            // Remove loading message if it exists
            if (this.loadingMessage && this.loadingMessage.parentNode) {
                this.loadingMessage.remove();
                this.loadingMessage = null;
            }

            // Add response to UI
            this.appendMessage(response.agentId, response.content);
        });
    }

    async handleSendMessage() {
        const content = this.userInput.value.trim();
        if (!content) return;

        try {
            Logger.debug('[ChatInterface] Send button clicked, content:', content);

            // Disable input during processing
            this.userInput.disabled = true;
            this.sendButton.disabled = true;

            // Add user message to UI
            this.appendMessage('user', content);
            this.userInput.value = '';

            // Add loading indicator
            Logger.debug('[ChatInterface] Adding loading message');
            this.loadingMessage = this.appendMessage('system', 'Processing...');

            Logger.debug('[ChatInterface] Calling processUserMessage...');
            const result = await this.app.processUserMessage(
                { content },
                this.currentConversationId
            );
            Logger.debug('[ChatInterface] Received final result:', result);

            // Update conversation ID if new
            this.currentConversationId = result.conversationId;

            // Only handle errors from the result
            if (result.responses && Array.isArray(result.responses)) {
                result.responses.forEach(response => {
                    if (response.error) {
                        this.appendErrorMessage(response.content);
                    }
                });
            }

            // Remove loading message if it still exists
            if (this.loadingMessage && this.loadingMessage.parentNode) {
                this.loadingMessage.remove();
                this.loadingMessage = null;
            }

        } catch (error) {
            Logger.error('[ChatInterface] Error processing message:', error);
            this.appendErrorMessage('Failed to process message. Please try again.');
            if (this.loadingMessage && this.loadingMessage.parentNode) {
                this.loadingMessage.remove();
            }
        } finally {
            this.userInput.disabled = false;
            this.sendButton.disabled = false;
            this.userInput.focus();
        }
    }

    appendMessage(type, content) {
        Logger.debug('[ChatInterface] Appending message:', { type, content });
        const chatMessages = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        
        // Determine message class based on type and content
        let messageClass = 'message';
        let agentLabel = '';
        
        // Check for message type using more specific prefixes
        if (type === 'user') {
            messageClass += ' user-message';
            agentLabel = 'You';
        } else if (type === 'director-1' || content.startsWith('Director assigns')) {
            messageClass += ' director-message';
            agentLabel = 'Director';
        } else if (type === 'analyst-1' || content.match(/^Analyst:/i)) {
            messageClass += ' analyst-message';
            agentLabel = 'Analyst';
        } else if (type === 'critic-1' || content.match(/^Critic:/i)) {
            messageClass += ' critic-message';
            agentLabel = 'Critic';
        } else if (type === 'expert-1' || content.match(/^Expert:/i)) {
            messageClass += ' expert-message';
            agentLabel = 'Expert';
        } else if (type === 'system') {
            messageClass += ' system-message';
        } else {
            // Default to agent type based on ID
            messageClass += ' agent-message';
            agentLabel = type;
        }

        messageDiv.className = messageClass;
        messageDiv.setAttribute('data-agent', agentLabel);
        
        // Clean up the content by removing agent prefixes
        let messageContent = content;
        const agentPrefixes = ['Analyst:', 'Critic:', 'Expert:', 'Director assigns'];
        
        for (const prefix of agentPrefixes) {
            if (content.startsWith(prefix)) {
                messageContent = content.substring(prefix.length).trim();
                break;
            }
        }
        
        // Split content into paragraphs if it contains newlines
        const paragraphs = messageContent.split('\n').filter(p => p.trim());
        if (paragraphs.length > 1) {
            paragraphs.forEach(paragraph => {
                const p = document.createElement('p');
                p.textContent = paragraph.trim();
                messageDiv.appendChild(p);
            });
        } else {
            messageDiv.textContent = messageContent;
        }
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        Logger.debug('[ChatInterface] Message appended successfully');
        return messageDiv;
    }

    appendErrorMessage(content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message error-message';
        messageDiv.textContent = content;
        document.getElementById('chat-messages').appendChild(messageDiv);
        Logger.warn('[ChatInterface] Error message appended:', content);
    }

    handleError(error) {
        Logger.error('[ChatInterface] Application error:', error);
        this.appendErrorMessage('An error occurred. Please refresh the page and try again.');
    }

    appendSummaryMessage(content) {
        const chatMessages = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message summary-message';
        messageDiv.setAttribute('data-agent', 'Summary');
        
        // Create a header for the summary
        const headerDiv = document.createElement('div');
        headerDiv.className = 'summary-header';
        headerDiv.textContent = '🔍 Conversation Summary';
        
        // Configure marked options for better rendering
        marked.setOptions({
            breaks: true,
            gfm: true,
            headerIds: false
        });
        
        // Create content div and render markdown
        const contentDiv = document.createElement('div');
        contentDiv.className = 'summary-content';
        
        // Parse markdown and sanitize with specific configuration
        const sanitizedHtml = DOMPurify.sanitize(marked.parse(content), {
            ALLOWED_TAGS: [
                'p', 'br', 'strong', 'em', 'h1', 'h2', 'h3', 'h4',
                'ul', 'ol', 'li', 'blockquote', 'code', 'pre'
            ],
            ALLOWED_ATTR: ['class'],
            KEEP_CONTENT: true
        });
        
        contentDiv.innerHTML = sanitizedHtml;
        
        messageDiv.appendChild(headerDiv);
        messageDiv.appendChild(contentDiv);
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        Logger.debug('[ChatInterface] Summary message appended');
        return messageDiv;
    }
} 