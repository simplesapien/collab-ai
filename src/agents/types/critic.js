// src/agents/critic.js
import { BaseAgent } from '../base/baseAgent.js';
import { Logger } from '../../utils/logger.js';

export class Critic extends BaseAgent {
    constructor(config, llmService) {
        super({ ...config, role: 'Critic' }, llmService);
        this.critiques = new Map();
    }

    async evaluateProposal(context, proposal) {
        try {
            Logger.debug(`${this.role} evaluating proposal:`, proposal);
            Logger.debug('Incoming context:', context);
            
            const validatedContext = this.validateContext(context);
            Logger.debug('Validated context:', validatedContext);

            const systemPrompt = `As ${this.name}, evaluate the following proposal:
            Consider: feasibility, potential risks, and areas for improvement.
            
            Important Guidelines:
            - Limit response to 3-4 sentences total
            - Include one key strength
            - Include one main risk/challenge
            - Provide one actionable recommendation
            - Be constructive and specific
            
            Recent evaluations: ${this.getRecentCritiques()}`;

            const response = await this.llm.makeModelRequest({
                systemPrompt: systemPrompt,
                userPrompt: proposal,
                context: validatedContext,
                agentType: this.role
            });

            this.storeCritique(proposal, response);
            return response;
        } catch (error) {
            Logger.error('Error in Critic.evaluateProposal:', error);
            throw error;
        }
    }

    async provideFeedback(context, target) {
        try {
            console.log(`${this.role} providing feedback for:`, target);
            console.log('Incoming context:', context);
            
            const validatedContext = this.validateContext(context);
            console.log('Validated context:', validatedContext);

            const systemPrompt = `Provide constructive feedback for the following discussion points.
            Focus on improvement opportunities while maintaining a balanced perspective.`;
            
            return await this.llm.makeModelRequest({
                systemPrompt: systemPrompt,
                userPrompt: `Review and provide feedback on: ${target}`,
                context: validatedContext,
                agentType: this.role
            });
        } catch (error) {
            Logger.error('Error in Critic.provideFeedback:', error);
            throw error;
        }
    }

    storeCritique(proposal, response) {
        const key = Date.now();
        this.critiques.set(key, {
            proposal,
            response,
            timestamp: key
        });

        // Maintain reasonable history
        const keys = Array.from(this.critiques.keys()).sort();
        while (keys.length > 15) {
            this.critiques.delete(keys.shift());
        }
    }

    getRecentCritiques(limit = 3) {
        return Array.from(this.critiques.values())
            .slice(-limit)
            .map(c => `Critique: ${c.response}`)
            .join('\n');
    }
}