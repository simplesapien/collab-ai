// src/agents/agent/expert/expert.js
import { BaseAgent } from '../../base/baseAgent.js';
import { log } from '../../../utils/logger.js';

export class Expert extends BaseAgent {
    constructor(config, llmService) {
        super({ ...config, role: 'Expert' }, llmService);
        this.expertise = config.knowledgeBase;
        this.insights = new Map();
    }

    async provideExpertise(context, query) {
        const startTime = Date.now();

        try {
            
            const validatedContext = this.validateContext(context);
            const response = await this.llm.makeModelRequest({
                systemPrompt: this.constructSystemPrompt(),
                userPrompt: query,
                context: validatedContext,
                agentType: this.role
            });
            
            this.storeInsight(query, response);

            log.perf.measure('expertiseGeneration', Date.now() - startTime, {
                agentId: this.id,
                queryLength: query.length,
                domain: this.determineDomain(query)
            });

            return response;

        } catch (error) {
            log.error('Expertise generation failed', error);
            throw error;
        }
    }

    storeInsight(query, response) {
        try {
            const key = Date.now();
            const domain = this.determineDomain(query);
            
            this.insights.set(key, {
                query,
                response,
                timestamp: key,
                domain
            });

            // Maintain history limit
            const keys = Array.from(this.insights.keys()).sort();
            while (keys.length > 25) {
                this.insights.delete(keys.shift());
            }
        } catch (error) {
            log.error('Failed to store insight', error);
        }
    }

    getRecentInsights(limit = 3) {
        return Array.from(this.insights.values())
            .slice(-limit)
            .map(i => `${i.domain} Insight: ${i.response}`)
            .join('\n');
    }

    determineDomain(query) {
        try {
            for (const domain of this.expertise) {
                if (query.toLowerCase().includes(domain.toLowerCase())) {
                    log.event.complete(eventId);
                    return domain;
                }
            }
            return 'General';
        } catch (error) {
            log.error('Domain determination failed', error);
            return 'Unknown';
        }
    }
}