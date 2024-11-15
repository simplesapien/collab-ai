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
        maxRetries: 3,           
        timeout: 15000,          
        defaultModel: "gpt-4o-mini",  
        temperature: 0.7,         
        modelsByAgent: {                 
            director: "gpt-4o-mini"  
        }
    },
    
    // Add new collaboration settings
    collaboration: {
        maxCollaborationRounds: 5,    // Maximum number of back-and-forth exchanges
        qualityThresholds: {
            minRelevanceScore: 0.7,    // Minimum topic relevance score (0-1)
            minCoherenceScore: 0.6,    // Minimum response coherence score (0-1)
            maxTopicDrift: 0.3,        // Maximum allowed topic drift before termination
        },
        consensusThreshold: 0.8,       // Agreement level needed for consensus (0-1)
        minResponseQuality: 0.65       // Minimum quality score for responses (0-1)
    },
    
    // Memory management settings
    memory: {
        maxMemoryItems: 50,          // Maximum items in memory store
        relevantHistoryLimit: 5      // Number of historical items to consider
    },
    
    // System-wide settings
    system: {
        defaultAgentType: 'Director', // Default agent type
        logLevel: 'debug'             // Default logging level
    }
};