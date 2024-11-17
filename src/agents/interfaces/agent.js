/**
 * @interface IAgent
 * @description Contract that all agents must fulfill
 */
export class IAgent {
    /**
     * @async
     * @param {Array<Object>} context - Conversation context
     * @param {string} prompt - User prompt
     * @returns {Promise<string>} Generated response
     */
    async generateResponse(context, prompt) {
        throw new Error('Method generateResponse() must be implemented');
    }

    /**
     * @async
     * @param {Object} previousResponse - Previous agent's response
     * @param {string} task - Task to perform
     * @returns {Promise<string>} Generated response
     */
    async respondToAgent(previousResponse, task) {
        throw new Error('Method respondToAgent() must be implemented');
    }

    /**
     * @param {Object} context - Context to validate
     * @returns {Array} Validated context
     */
    validateContext(context) {
        throw new Error('Method validateContext() must be implemented');
    }

    /**
     * @returns {string} System prompt for the agent
     */
    constructSystemPrompt() {
        throw new Error('Method constructSystemPrompt() must be implemented');
    }
} 