/**
 * Global configuration object for all system components
 */
export const config = {
    // Conversation management settings
    conversation: {
        maxConversations: 100,          // Maximum number of concurrent conversations
        maxMessageAge: 24 * 60 * 60 * 1000, // Message retention period (24 hours)
        maxMessagesPerConversation: 100 // Maximum messages per conversation
    },
    
    // LLM service configuration
    llm: {
        maxRetries: 3,           // Maximum retry attempts for failed requests
        timeout: 15000,          // Request timeout in milliseconds
        defaultModel: "gpt-3.5-turbo",  // Default model for most agents
        temperature: 0.7,         // Response randomness (0-1)
        modelsByAgent: {                 // Specific models for different agents
            director: "gpt-4o-mini"  // Use GPT-4 for director
        }
    },
    
    // Memory management settings
    memory: {
        maxMemoryItems: 50,          // Maximum items in memory store
        relevantHistoryLimit: 5      // Number of historical items to consider
    },
    
    // System-wide settings
    system: {
        defaultAgentType: 'Director', // Default agent type
        logLevel: 'info'             // Default logging level
    }
};