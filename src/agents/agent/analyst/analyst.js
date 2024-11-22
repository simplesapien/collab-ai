// src/agents/agent/analyst/analyst.js
import { BaseAgent } from '../../base/baseAgent.js';
import { log } from '../../../utils/logger.js';

export class Analyst extends BaseAgent {
    constructor(config, llmService) {
        super({ ...config, role: 'Analyst' }, llmService);
        this.analyses = new Map();
    }

    async analyzeInformation(message, context = []) {
      
        const startTime = Date.now();

        try {
            
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

            return response;

        } catch (error) {
            log.error('Analysis failed', error);
            throw error;
        }
    }

    storeAnalysis(prompt, response) {

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

        } catch (error) {
            log.error('Failed to store analysis', error);
        }
    }

    getRecentAnalyses(limit = 3) {
        return Array.from(this.analyses.values())
            .slice(-limit)
            .map(a => `Analysis: ${a.response}`)
            .join('\n');
    }
}