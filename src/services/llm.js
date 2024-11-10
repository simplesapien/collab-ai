// src/services/llm.js
import { Logger } from '../utils/logger.js';

export class LLMService {
    constructor(config = { maxRetries: 3, timeout: 10000 }) {
        this.config = config;
        this.requestQueue = [];
        this.rateLimit = {
            requests: 0,
            lastReset: Date.now(),
            limit: 50, // requests per minute
            interval: 60000 // 1 minute
        };
    }

    async makeModelRequest(params) {
        let attempts = 0;
        
        while (attempts < this.config.maxRetries) {
            try {
                await this._checkRateLimit();
                
                const { 
                    systemPrompt, 
                    userPrompt, 
                    context = [], 
                    agentType = null 
                } = params;
                
                console.log('makeModelRequest params:', {
                    systemPrompt,
                    userPrompt,
                    context,
                    agentType
                });
                
                if (!systemPrompt) {
                    throw new Error('System prompt is required');
                }
                
                const sanitizedUserPrompt = userPrompt || '';
                const model = this._getModelForAgent(agentType);
                
                const sanitizedContext = context.map(msg => ({
                    ...msg,
                    content: msg.content || '',
                    agentId: msg.agentId || 'assistant'
                }));

                console.log('Sanitized context:', sanitizedContext);
                
                const messages = [
                    { role: "system", content: systemPrompt },
                    ...sanitizedContext.map(msg => ({
                        role: msg.agentId === "user" ? "user" : "assistant",
                        content: msg.content
                    })),
                    { role: "user", content: sanitizedUserPrompt }
                ].filter(msg => msg.content && msg.content.trim() !== '');

                console.log('Final messages array:', messages);

                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        systemPrompt, 
                        userPrompt: sanitizedUserPrompt, 
                        context: sanitizedContext,
                        temperature: this.config.temperature,
                        model
                    })
                });

                console.log('📥 LLM API Response Status:', response.status);

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('❌ LLM API Error:', {
                        status: response.status,
                        error: errorText
                    });
                    throw new Error(`API error ${response.status}: ${errorText}`);
                }

                const data = await response.json();
                console.log('📦 LLM API Response Data:', data);
                
                if (typeof data.content === 'string' && 
                    (data.content.trim().startsWith('{') || data.content.trim().startsWith('['))) {
                    try {
                        const parsedContent = JSON.parse(data.content);
                        console.log('Parsed JSON content:', parsedContent);
                        return parsedContent;
                    } catch (error) {
                        console.warn('Failed to parse content as JSON, returning raw content');
                        return data.content;
                    }
                }
                
                return data.content;

            } catch (error) {
                attempts++;
                Logger.warn(`LLM request failed (attempt ${attempts}):`, error);
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

    async _checkRateLimit() {
        if (Date.now() - this.rateLimit.lastReset > this.rateLimit.interval) {
            this.rateLimit.requests = 0;
            this.rateLimit.lastReset = Date.now();
        }

        if (this.rateLimit.requests >= this.rateLimit.limit) {
            const waitTime = this.rateLimit.interval - (Date.now() - this.rateLimit.lastReset);
            Logger.warn(`Rate limit exceeded, waiting ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            this.rateLimit.requests = 0;
            this.rateLimit.lastReset = Date.now();
        }
    }

    _updateRateLimit() {
        this.rateLimit.requests++;
    }

    _getModelForAgent(agentType) {
        console.log('_getModelForAgent called with:', {
            agentType,
            availableModels: this.config.modelsByAgent,
            defaultModel: this.config.defaultModel
        });

        if (!agentType) {
            console.log('No agent type provided, using default model:', this.config.defaultModel);
            return this.config.defaultModel;
        }
        
        const agentKey = agentType.toLowerCase();
        console.log('Looking up model for agent type:', {
            agentKey,
            modelMapping: this.config.modelsByAgent,
            selectedModel: this.config.modelsByAgent?.[agentKey]
        });
        
        const model = this.config.modelsByAgent?.[agentKey] || this.config.defaultModel;
        console.log(`Final model selection for ${agentKey}:`, model);
        
        return model;
    }
}