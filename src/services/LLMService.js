// src/services/llm.js
import { log } from '../utils/logger.js';
import { RateLimiter } from '../utils/rateLimiter.js';
import { MessageFormatter } from '../utils/messageFormatter.js';
import { CostTracker } from '../utils/costTracker.js';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

export class LLMService {
    constructor(config = { maxRetries: 3, timeout: 10000 }) {
        const eventId = log.event.emit('init', 'LLMService', { config });
        try {
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
        } catch (error) {
            log.error('LLMService initialization failed', error);
            throw error;
        }
    }

    async makeModelRequest(params) {
        const startTime = Date.now();

        let attempts = 0;
        while (attempts < this.config.maxRetries) {
            try {
                log.debug('Starting LLM request', { params });
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

                log.perf.measure('llm-api-call', Date.now() - startTime, {
                    model: formattedData.model,
                    promptTokens: response.usage?.prompt_tokens,
                    completionTokens: response.usage?.completion_tokens
                });

                return MessageFormatter.parseResponse(response.choices[0].message.content);

            } catch (error) {
                attempts++;
                log.error('LLM request failed', { attempt: attempts, error: error.message });
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
  
        if (!agentType) {
            log.debug('[LLMService] No agent type provided, using default model:', this.config.defaultModel);
            return this.config.defaultModel;
        }
        const agentKey = agentType.toLowerCase();
        const model = this.config.modelsByAgent?.[agentKey] || this.config.defaultModel;
        return model;
    }
}