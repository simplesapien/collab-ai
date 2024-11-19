// src/agents/analyst.js
import { BaseAgent } from '../base/baseAgent.js';
import { log } from '../../utils/winstonLogger.js';

export class Analyst extends BaseAgent {
    constructor(config, llmService) {
        super({ ...config, role: 'Analyst' }, llmService);
        this.analyses = new Map();
    }

    async analyzeInformation(message, context = []) {
        const eventId = log.event.emit('analyzeInformation', 'Analyst', {
            agentId: this.id,
            contextLength: context?.length
        });
        const startTime = Date.now();

        try {
            log.state.change('Analyst', 'idle', 'analyzing', { agentId: this.id });
            
            const validatedContext = this.validateContext(context);
            const userPrompt = typeof message === 'object' 
                ? (message.content || message.text || JSON.stringify(message))
                : message;

            const response = await this.llm.makeModelRequest({
                systemPrompt: this.constructSystemPrompt(),
                userPrompt: userPrompt,
                context: validatedContext,
                agentType: this.role
            });
            
            this.storeAnalysis(userPrompt, response);

            log.perf.measure('analysisCompletion', Date.now() - startTime, {
                agentId: this.id,
                messageType: typeof message
            });

            log.state.change('Analyst', 'analyzing', 'completed', { agentId: this.id });
            log.event.complete(eventId);
            return response;

        } catch (error) {
            log.error('Analysis failed', error);
            log.state.change('Analyst', 'analyzing', 'failed', { agentId: this.id });
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    storeAnalysis(prompt, response) {
        const eventId = log.event.emit('storeAnalysis', 'Analyst', { 
            agentId: this.id,
            promptLength: prompt.length,
            responseLength: response.length
        });

        try {
            log.debug('Storing analysis', { 
                timestamp: Date.now(),
                promptPreview: prompt.substring(0, 50)
            });
            
            const key = Date.now();
            this.analyses.set(key, {
                prompt,
                response,
                timestamp: key
            });

            // Maintain history limit
            const keys = Array.from(this.analyses.keys()).sort();
            while (keys.length > 20) {
                this.analyses.delete(keys.shift());
            }

            log.event.complete(eventId);
        } catch (error) {
            log.error('Failed to store analysis', error);
            log.event.complete(eventId, 'failed');
        }
    }

    getRecentAnalyses(limit = 3) {
        return Array.from(this.analyses.values())
            .slice(-limit)
            .map(a => `Analysis: ${a.response}`)
            .join('\n');
    }
}