// src/services/llm.js
import { Logger } from '../utils/logger.js';
import { RateLimiter } from './rateLimiter.js';
import { MessageFormatter } from './messageFormatter.js';
import { CostTracker } from './costTracker.js';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

export class LLMService {
    constructor(config = { maxRetries: 3, timeout: 10000 }) {
        this.config = config;
        this.requestQueue = [];
        this.rateLimiter = new RateLimiter({
            limit: config.rateLimit?.limit || 50,
            interval: config.rateLimit?.interval || 60000
        });
        this.costTracker = new CostTracker();
        
        // Initialize OpenAI client
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }

    async makeModelRequest(params) {
        let attempts = 0;
        
        while (attempts < this.config.maxRetries) {
            try {
                Logger.debug('[LLMService] makeModelRequest params:', params);
                await this.rateLimiter.checkLimit();

                // Get recent context in a more conversational format
                // There were issues that the LLM wasn't able to follow instructions because the 
                // context was too long. This limits the context to the last 5 messages, and 
                // formats it in a way that may be easier for the LLM to understand.
                const recentContext = params.context ? params.context.slice(-5).map(msg => ({
                    role: msg.agentId === 'user' ? 'user' : 'assistant',
                    content: msg.content
                })) : [];

                // Format messages using MessageFormatter
                const formattedData = MessageFormatter.formatMessages({
                    ...params,
                    context: recentContext, // Pass the limited context
                    modelConfig: {
                        modelsByAgent: this.config.modelsByAgent,
                        defaultModel: this.config.defaultModel
                    }
                });

                // Make direct OpenAI API call
                const response = await this.openai.chat.completions.create({
                    model: formattedData.model || 'gpt-4o-mini',
                    messages: formattedData.messages,
                    temperature: this.config.temperature || 0.7,
                });

                // Track costs
                if (response.usage) {
                    this.costTracker.trackRequest(
                        response.usage.prompt_tokens,
                        response.usage.completion_tokens
                    );
                }

                Logger.debug('[LLMService] API Response:', response);

                return MessageFormatter.parseResponse(response.choices[0].message.content);

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

    getCostSummary() {
        return this.costTracker.getCostSummary();
    }

    resetCosts() {
        this.costTracker.reset();
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