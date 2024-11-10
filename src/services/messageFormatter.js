import { Logger } from '../utils/logger.js';

export class MessageFormatter {
    static formatMessages(params) {
        const { 
            systemPrompt, 
            userPrompt, 
            context = [], 
            agentType = null,
            modelConfig 
        } = params;

        if (!systemPrompt) {
            Logger.error('System prompt is missing');
            throw new Error('System prompt is required');
        }

        const sanitizedUserPrompt = userPrompt || '';
        const model = this._getModelForAgent(agentType, modelConfig);
        
        const sanitizedContext = context.map(msg => ({
            ...msg,
            content: msg.content || '',
            agentId: msg.agentId || 'assistant'
        }));

        const messages = [
            { role: "system", content: systemPrompt },
            ...sanitizedContext.map(msg => ({
                role: msg.agentId === "user" ? "user" : "assistant",
                content: msg.content
            })),
            { role: "user", content: sanitizedUserPrompt }
        ].filter(msg => msg.content && msg.content.trim() !== '');

        return {
            messages,
            sanitizedContext,
            model,
            systemPrompt,
            userPrompt: sanitizedUserPrompt
        };
    }

    static _getModelForAgent(agentType, modelConfig) {
        const { modelsByAgent, defaultModel } = modelConfig;
        
        if (!agentType) {
            return defaultModel;
        }
        
        const agentKey = agentType.toLowerCase();
        return modelsByAgent?.[agentKey] || defaultModel;
    }

    static parseResponse(content) {
        if (typeof content !== 'string') {
            return content;
        }

        const trimmedContent = content.trim();
        if (trimmedContent.startsWith('{') || trimmedContent.startsWith('[')) {
            try {
                return JSON.parse(trimmedContent);
            } catch (error) {
                Logger.warn('Failed to parse content as JSON:', error);
                return content;
            }
        }
        
        return content;
    }
} 