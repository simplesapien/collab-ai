// src/main.js
import { Application } from './app.js';
import { Logger } from './utils/logger.js';
import { config } from './config/config.js';

class Main {
    constructor() {
        this.app = new Application();
        this.initializeEventListeners();
    }

    async initialize() {
        try {
            // Set logging level from config
            Logger.setLevel(config.system.logLevel);
            await this.app.initialize();
            this.setupUI();
            Logger.info('Main application initialized successfully');
        } catch (error) {
            Logger.error('Failed to initialize main application:', error);
            this.handleError(error);
        }
    }

    initializeEventListeners() {
        window.addEventListener('load', () => this.initialize());
        window.addEventListener('error', (event) => this.handleError(event.error));
    }

    setupUI() {
        const chatMessages = document.getElementById('chat-messages');
        const userInput = document.getElementById('user-input');
        const sendButton = document.getElementById('send-button');

        let currentConversationId = null;
        let loadingMessage = null;

        // Register for real-time responses
        console.log('🎧 Setting up response listener');
        this.app.onResponse((response) => {
            console.log('📨 Received real-time response in UI:', response);
            
            // Remove loading message if it exists
            if (loadingMessage && loadingMessage.parentNode) {
                console.log('🗑️ Removing loading message');
                loadingMessage.remove();
                loadingMessage = null;
            }

            // Add response to UI
            console.log('➕ Adding message to UI');
            const messageElement = this.appendMessage(response.agentId, response.content);
            console.log('✅ Message added to UI:', messageElement);
        });

        sendButton.addEventListener('click', async () => {
            const content = userInput.value.trim();
            if (!content) return;

            try {
                console.log('🔘 Send button clicked, content:', content);

                // Disable input during processing
                userInput.disabled = true;
                sendButton.disabled = true;

                // Add user message to UI
                this.appendMessage('user', content);
                userInput.value = '';

                // Add loading indicator
                console.log('⏳ Adding loading message');
                loadingMessage = this.appendMessage('system', 'Processing...');

                console.log('🚀 Calling processUserMessage...');
                const result = await this.app.processUserMessage(
                    { content },
                    currentConversationId
                );
                console.log('✨ Received final result:', result);

                // Update conversation ID if new
                currentConversationId = result.conversationId;

                // Add summary if it exists
                if (result.summary) {
                    console.log('📋 Adding summary message');
                    this.appendSummaryMessage(result.summary);
                }

            } catch (error) {
                console.error('❌ Error processing message:', error);
                this.appendErrorMessage('Failed to process message. Please try again.');
                if (loadingMessage && loadingMessage.parentNode) {
                    loadingMessage.remove();
                }
            } finally {
                userInput.disabled = false;
                sendButton.disabled = false;
                userInput.focus();
            }
        });

        // Handle enter key
        userInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendButton.click();
            }
        });
    }

    appendMessage(type, content) {
        console.log('📝 Appending message:', { type, content });
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
        console.log('✅ Message appended successfully');
        return messageDiv;
    }

    appendErrorMessage(content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message error-message';
        messageDiv.textContent = content;
        document.getElementById('chat-messages').appendChild(messageDiv);
    }

    handleError(error) {
        Logger.error('Application error:', error);
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
        
        // Create content div
        const contentDiv = document.createElement('div');
        contentDiv.className = 'summary-content';
        contentDiv.textContent = content;
        
        messageDiv.appendChild(headerDiv);
        messageDiv.appendChild(contentDiv);
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return messageDiv;
    }
}

// Initialize the application
const main = new Main();
// Export for use in frontend
window.app = main.app;