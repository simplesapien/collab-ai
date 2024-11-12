// src/utils/validators.js
export class Validators {
    static isValidMessage(message) {
        return message 
            && typeof message === 'object'
            && typeof message.content === 'string'
            && message.content.trim().length > 0
            && typeof message.agentId === 'string';
    }

    static isValidConversation(conversation) {
        return conversation 
            && typeof conversation === 'object'
            && typeof conversation.id === 'string'
            && Array.isArray(conversation.messages);
    }

    static isValidAgentConfig(config) {
        return config 
            && typeof config === 'object'
            && typeof config.id === 'string'
            && typeof config.name === 'string'
            && typeof config.type === 'string'
            && Array.isArray(config.knowledgeBase);
    }

    static isValidResponse(response) {
        return response 
            && typeof response === 'object'
            && typeof response.content === 'string'
            && response.content.trim().length > 0;
    }

    static isValidParticipant(participant) {
        return participant 
            && typeof participant === 'object'
            && typeof participant.id === 'string'
            && typeof participant.role === 'string'
            && typeof participant.task === 'string';
    }
}