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
                    
                    const qualityCheck = await this.coordinator.qualityGate.checkCollaborationRound(
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
        const task = `Respond to ${plan.respondTo.join(' and ')}'s points: ${plan.task}`;
        
        this.coordinator.notifyManager.notifyThinking(agent.id, 'thinking');

        const collaborativeResponse = await this.executeWithRetry({
            operation: async () => {
                const response = await this.coordinator.agentManager.generateAgentResponse(
                    agent.id, 
                    conversation, 
                    task
                );

                return this.coordinator.agentManager.formatAgentResponse(
                    response,
                    agent.id,
                    plan.nextAgent
                );
            },
            qualityCheck: async (response) => {
                return this.coordinator.qualityGate.checkCollaborativeResponse(
                    response.content,
                    task
                );
            },
            agentId: agent.id,
            task: task,
            metadata: { conversationId: conversation.id }
        });

        if (collaborativeResponse) {
            this.coordinator.conversationManager.logMessage(conversation.id, collaborativeResponse);
            this.coordinator.notifyManager.notifyResponse(collaborativeResponse);
            responses.push(collaborativeResponse);
        }

        return collaborativeResponse;
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
