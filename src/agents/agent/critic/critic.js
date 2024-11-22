// src/agents/critic.js
import { BaseAgent } from '../../base/baseAgent.js';
import { log } from '../../../utils/logger.js';

export class Critic extends BaseAgent {
    constructor(config, llmService) {
        super({ ...config, role: 'Critic' }, llmService);
        this.critiques = new Map();
    }

    async evaluateProposal(context, proposal) {
        const startTime = Date.now();

        try {
            log.debug('Starting proposal evaluation', { 
                proposalLength: proposal.length,
                contextSize: context?.length
            });
            
                const response = await this.llm.makeModelRequest({
                systemPrompt: this.constructSystemPrompt(),
                userPrompt: proposal,
                context: this.validateContext(context),
                agentType: this.role
            });

            this.storeCritique(proposal, response);

            log.perf.measure('evaluationCompletion', Date.now() - startTime, {
                agentId: this.id,
                proposalLength: proposal.length
            });

            return response;

        } catch (error) {
            log.error('Evaluation failed', error);
            throw error;
        }
    }

    async provideFeedback(context, target) {
        const startTime = Date.now();

        try {
            
            const validatedContext = this.validateContext(context);
            const response = await this.llm.makeModelRequest({
                systemPrompt: this.constructSystemPrompt(),
                userPrompt: `Review and provide feedback on: ${target}`,
                context: validatedContext,
                agentType: this.role
            });

            log.perf.measure('feedbackCompletion', Date.now() - startTime, {
                agentId: this.id,
                targetLength: target.length
            });

            return response;

        } catch (error) {
            log.error('Feedback generation failed', error);
            throw error;
        }
    }

    storeCritique(proposal, response) {
        try {
            const key = Date.now();
            this.critiques.set(key, {
                proposal,
                response,
                timestamp: key
            });

            // Maintain history limit
            const keys = Array.from(this.critiques.keys()).sort();
            while (keys.length > 15) {
                this.critiques.delete(keys.shift());
            }

        } catch (error) {
            log.error('Failed to store critique', error);
        }
    }

    getRecentCritiques(limit = 3) {
        return Array.from(this.critiques.values())
            .slice(-limit)
            .map(c => `Critique: ${c.response}`)
            .join('\n');
    }
}