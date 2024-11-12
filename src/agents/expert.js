// src/agents/expert.js
import { BaseAgent } from './baseAgent.js';
import { Logger } from '../utils/logger.js';

export class Expert extends BaseAgent {
    constructor(config, llmService) {
        super({ ...config, role: 'Expert' }, llmService);
        this.expertise = config.knowledgeBase;
        this.insights = new Map();
    }

    async provideExpertise(context, query) {
        try {
            Logger.debug(`${this.role} providing expertise for query:`, query);
            Logger.debug('Incoming context:', context);
            
            const validatedContext = this.validateContext(context);
            Logger.debug('Validated context:', validatedContext);

            const systemPrompt = `As ${this.name}, provide expert insight on the following query:
            Draw from your expertise in: ${this.expertise.join(', ')}.
            Provide detailed, authoritative information while maintaining clarity.
            
            Important: Keep your response focused and under 3-4 sentences.
            Focus on the most important points only.
            
            Recent insights: ${this.getRecentInsights()}`;

            const response = await this.llm.makeModelRequest({
                systemPrompt: systemPrompt,
                userPrompt: query,
                context: validatedContext,
                agentType: this.role
            });
            
            this.storeInsight(query, response);
            return response;
        } catch (error) {
            Logger.error('Error in Expert.provideExpertise:', error);
            throw error;
        }
    }

    async validateInformation(context, information) {
        try {
            console.log(`${this.role} validating information:`, information);
            console.log('Incoming context:', context);
            
            const validatedContext = this.validateContext(context);
            console.log('Validated context:', validatedContext);

            const systemPrompt = `Validate the following information based on your expertise.
            Identify any inaccuracies or areas needing clarification.`;
            
            return await this.llm.makeModelRequest({
                systemPrompt: systemPrompt,
                userPrompt: `Validate: ${information}`,
                context: validatedContext,
                agentType: this.role
            });
        } catch (error) {
            Logger.error('Error in Expert.validateInformation:', error);
            throw error;
        }
    }

    storeInsight(query, response) {
        const key = Date.now();
        this.insights.set(key, {
            query,
            response,
            timestamp: key,
            domain: this.determineDomain(query)
        });

        // Maintain history
        const keys = Array.from(this.insights.keys()).sort();
        while (keys.length > 25) {
            this.insights.delete(keys.shift());
        }
    }

    getRecentInsights(limit = 3) {
        return Array.from(this.insights.values())
            .slice(-limit)
            .map(i => `${i.domain} Insight: ${i.response}`)
            .join('\n');
    }

    determineDomain(query) {
        // Simple domain determination based on keyword matching
        for (const domain of this.expertise) {
            if (query.toLowerCase().includes(domain.toLowerCase())) {
                return domain;
            }
        }
        return 'General';
    }
}