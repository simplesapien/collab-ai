// src/agents/critic.js
import { BaseAgent } from '../../base/baseAgent.js';
import { log } from '../../../utils/logger.js';

export class Critic extends BaseAgent {
    constructor(config, llmService) {
        super({ ...config, role: 'Critic' }, llmService);
        this.critiques = new Map();
        log.state.change('Critic', 'uninitialized', 'ready', { 
            agentId: this.id,
            config 
        });
    }

    async evaluateProposal(context, proposal) {
        const eventId = log.event.emit('evaluateProposal', 'Critic', {
            agentId: this.id,
            contextLength: context?.length
        });
        const startTime = Date.now();

        try {
            log.debug('Starting proposal evaluation', { 
                proposalLength: proposal.length,
                contextSize: context?.length
            });
            
            log.state.change('Critic', 'idle', 'evaluating', { agentId: this.id });
            
            const llmStartTime = Date.now();
            const response = await this.llm.makeModelRequest({
                systemPrompt: this.constructSystemPrompt(),
                userPrompt: proposal,
                context: this.validateContext(context),
                agentType: this.role
            });
            log.perf.measure('llm-request', Date.now() - llmStartTime, {
                method: 'evaluateProposal',
                proposalLength: proposal.length
            });

            this.storeCritique(proposal, response);

            log.perf.measure('evaluationCompletion', Date.now() - startTime, {
                agentId: this.id,
                proposalLength: proposal.length
            });

            log.state.change('Critic', 'evaluating', 'completed', { agentId: this.id });
            log.event.complete(eventId);
            return response;

        } catch (error) {
            log.error('Evaluation failed', error);
            log.state.change('Critic', 'evaluating', 'failed', { agentId: this.id });
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    async provideFeedback(context, target) {
        const eventId = log.event.emit('provideFeedback', 'Critic', {
            agentId: this.id,
            contextLength: context?.length
        });
        const startTime = Date.now();

        try {
            log.state.change('Critic', 'idle', 'providing-feedback', { agentId: this.id });
            
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

            log.state.change('Critic', 'providing-feedback', 'completed', { agentId: this.id });
            log.event.complete(eventId);
            return response;

        } catch (error) {
            log.error('Feedback generation failed', error);
            log.state.change('Critic', 'providing-feedback', 'failed', { agentId: this.id });
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    storeCritique(proposal, response) {
        const eventId = log.event.emit('storeCritique', 'Critic', { 
            agentId: this.id 
        });

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

            log.event.complete(eventId);
        } catch (error) {
            log.error('Failed to store critique', error);
            log.event.complete(eventId, 'failed');
        }
    }

    getRecentCritiques(limit = 3) {
        return Array.from(this.critiques.values())
            .slice(-limit)
            .map(c => `Critique: ${c.response}`)
            .join('\n');
    }
}