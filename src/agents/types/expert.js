// src/agents/expert.js
import { BaseAgent } from '../base/baseAgent.js';
import { log } from '../../utils/winstonLogger.js';

export class Expert extends BaseAgent {
    constructor(config, llmService) {
        super({ ...config, role: 'Expert' }, llmService);
        this.expertise = config.knowledgeBase;
        this.insights = new Map();
        
        log.info('Expert initialized', {
            agentId: this.id,
            expertise: this.expertise
        });
    }

    async provideExpertise(context, query) {
        const eventId = log.event.emit('provideExpertise', 'Expert', {
            agentId: this.id,
            contextLength: context?.length
        });
        const startTime = Date.now();

        try {
            log.state.change('Expert', 'idle', 'analyzing', { agentId: this.id });
            
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

            log.state.change('Expert', 'analyzing', 'completed', { agentId: this.id });
            log.event.complete(eventId, 'completed', { 
                responseLength: response.length,
                domain: this.determineDomain(query),
                duration: Date.now() - startTime
            });
            return response;

        } catch (error) {
            log.error('Expertise generation failed', error);
            log.state.change('Expert', 'analyzing', 'failed', { agentId: this.id });
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    storeInsight(query, response) {
        const eventId = log.event.emit('storeInsight', 'Expert', { 
            agentId: this.id 
        });

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

            log.event.complete(eventId);
        } catch (error) {
            log.error('Failed to store insight', error);
            log.event.complete(eventId, 'failed');
        }
    }

    getRecentInsights(limit = 3) {
        return Array.from(this.insights.values())
            .slice(-limit)
            .map(i => `${i.domain} Insight: ${i.response}`)
            .join('\n');
    }

    determineDomain(query) {
        const eventId = log.event.emit('determineDomain', 'Expert', { 
            agentId: this.id 
        });

        try {
            for (const domain of this.expertise) {
                if (query.toLowerCase().includes(domain.toLowerCase())) {
                    log.event.complete(eventId);
                    return domain;
                }
            }
            log.event.complete(eventId);
            return 'General';
        } catch (error) {
            log.error('Domain determination failed', error);
            log.event.complete(eventId, 'failed');
            return 'Unknown';
        }
    }
}