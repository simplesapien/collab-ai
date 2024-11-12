// src/services/llm.js
import { Logger } from '../utils/logger.js';
import { RateLimiter } from './rateLimiter.js';
import { MessageFormatter } from './messageFormatter.js';

export class LLMService {
    constructor(config = { maxRetries: 3, timeout: 10000 }) {
        this.config = config;
        this.requestQueue = [];
        this.rateLimiter = new RateLimiter({
            limit: config.rateLimit?.limit || 50,
            interval: config.rateLimit?.interval || 60000
        });
    }

    async makeModelRequest(params) {
        let attempts = 0;
        
        while (attempts < this.config.maxRetries) {
            try {
                Logger.debug('[LLMService] makeModelRequest params:', params);

                await this.rateLimiter.checkLimit();

                
                // Format messages using MessageFormatter
                const formattedData = MessageFormatter.formatMessages({
                    ...params,
                    modelConfig: {
                        modelsByAgent: this.config.modelsByAgent,
                        defaultModel: this.config.defaultModel
                    }
                });

                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        ...formattedData,
                        temperature: this.config.temperature
                    })
                });

                Logger.debug('[LLMService] API Response Status:', response.status);

                if (!response.ok) {
                    const errorText = await response.text();
                    Logger.error('[LLMService] API Error:', {
                        status: response.status,
                        error: errorText
                    });
                    throw new Error(`API error ${response.status}: ${errorText}`);
                }

                const data = await response.json();
                return MessageFormatter.parseResponse(data.content);

            } catch (error) {
                attempts++;
                Logger.warn(`[LLMService] Request failed (attempt ${attempts}):`, error);
                if (attempts === this.config.maxRetries) {
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000));
            }
        }
    }

    _validateResponse(data) {
        return data && typeof data.content === 'string' && data.content.length > 0;
    }

    _getModelForAgent(agentType) {
        Logger.debug('[LLMService] Getting model for agent:', {
            agentType,
            availableModels: this.config.modelsByAgent,
            defaultModel: this.config.defaultModel
        });

        if (!agentType) {
            Logger.debug('[LLMService] No agent type provided, using default model:', this.config.defaultModel);
            return this.config.defaultModel;
        }
        
        const agentKey = agentType.toLowerCase();
        Logger.debug('[LLMService] Looking up model for agent type:', {
            agentKey,
            modelMapping: this.config.modelsByAgent,
            selectedModel: this.config.modelsByAgent?.[agentKey]
        });
        
        const model = this.config.modelsByAgent?.[agentKey] || this.config.defaultModel;
        Logger.debug(`[LLMService] Final model selection for ${agentKey}:`, model);
        
        return model;
    }
}