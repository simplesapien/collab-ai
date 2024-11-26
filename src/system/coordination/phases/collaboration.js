import { log } from '../../../utils/logger.js';
import { Phase } from './base.js';

export class CollaborationPhase extends Phase {
    constructor(coordinator) {
        super(coordinator, 'CollaborationPhase');
    }

    async execute(conversation, director, initialResponses) {

        return this.executeWithLogging(
            async () => {
                const collaborativeResponses = [];
                log.debug('Starting collaboration phase...');
                this.coordinator.qualityGate.resetRoundCounter();
                
                while (true) {
                    if (this.coordinator.isCancelled) {
                        log.debug('Cancelling collaboration phase');
                        break;
                    }

                    this.coordinator.qualityGate.incrementRound();
                    
                    const qualityCheck = await this.coordinator.qualityGate.performQualityCheck(
                        conversation,
                        initialResponses
                    )

                    if (!qualityCheck.shouldContinue) {
                        log.debug(`Ending collaboration: ${qualityCheck.reason}`);
                        break;
                    }

                    const collaborationPlan = await director.planNextAgentInteraction(
                        conversation.messages,
                        initialResponses
                    );

                    if (!this._isValidCollaborationPlan(collaborationPlan)) {
                        log.debug('Invalid collaboration plan - ending phase');
                        break;
                    }

                    const nextAgentId = `${collaborationPlan.nextAgent.toLowerCase()}-1`;
                    const nextAgent = this.coordinator.agentManager.getAgent(nextAgentId);
                    
                    if (!nextAgent) {
                        log.error('Next agent not found:', nextAgentId);
                        break;
                    }

                    if (this.coordinator.agentManager.isConsecutiveResponse(initialResponses, nextAgentId)) {
                        log.debug('Preventing consecutive responses from same agent');
                        break;
                    }

                    try {
                        const response = await this._handleCollaborativeResponse(
                            nextAgent,
                            conversation,
                            collaborationPlan,
                            initialResponses
                        );
                        collaborativeResponses.push(response);
                    } catch (error) {
                        log.error('Error in collaboration round:', error);
                        break;
                    }
                }

                return {
                    allResponses: initialResponses,
                    collaborativeResponses
                };
            },
            {
                conversationId: conversation.id,
                initialResponseCount: initialResponses.length,
                directorId: director.id
            }
        );
    }

    async _handleCollaborativeResponse(agent, conversation, plan, responses) {
        const startTime = Date.now();
        
        this.coordinator.notifyManager.notifyThinking(agent.id, 'thinking');

        try {
            const task = `Respond to ${plan.respondTo.join(' and ')}'s points: ${plan.task}`;
            log.debug('Generating agent response for collaboration:', {
                agentId: agent.id,
                task,
                conversationId: conversation.id
            });

            const response = await this.coordinator.agentManager.generateAgentResponse(
                agent.id, 
                conversation, 
                task
            );

            const collaborativeResponse = this.coordinator.agentManager.formatAgentResponse(
                response,
                agent.id,
                plan.nextAgent
            );

            log.debug('Formatted collaborative response:', {
                agentId: agent.id,
                role: plan.nextAgent,
                content: collaborativeResponse.content,
                conversationId: conversation.id
            });

            this.coordinator.conversationManager.logMessage(conversation.id, collaborativeResponse);
            this.coordinator.notifyManager.notifyResponse(collaborativeResponse);
            responses.push(collaborativeResponse);

            log.perf.measure('agent-response-generation', Date.now() - startTime, {
                agentId: agent.id,
                taskLength: task.length
            });

            return collaborativeResponse;
        } catch (error) {
            log.error('Failed to generate collaborative response:', {
                agentId: agent.id,
                task: plan.task,
                conversationId: conversation.id,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    _isValidCollaborationPlan(plan) {
        return plan && 
            plan.nextAgent && 
            !plan.respondTo.includes(plan.nextAgent);
    }

    async _planNextCollaborationRound(director, conversation, currentResponses) {
        return {
            ...await director.planNextAgentInteraction(conversation.messages, currentResponses),
            complexity: await this._assessDiscussionComplexity(conversation),
            stage: await this._determineDiscussionStage(conversation)
        };
    }

    async _assessDiscussionComplexity(conversation) {
        return 'medium';
    }

    async _determineDiscussionStage(conversation) {
        return 'collaboration';
    }

    _validatePlanComplexity(plan) {
        return true;
    }
}
