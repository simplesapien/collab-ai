import { log } from '../../../utils/logger.js';
import { Phase } from './base.js';

export class ResponsePhase extends Phase {
    constructor(coordinator) {
        super(coordinator, 'ResponsePhase');
        this.internalData = {}
    }

    async execute(conversation, plan) {
        return this.executeWithLogging(
            async () => {
                const responses = [];
                
                for (const participant of plan.participants) {
                    if (this.coordinator.isCancelled) {
                        return responses;
                    }

                    const agent = this.coordinator.agentManager.getAgent(participant.id);
                    if (!agent) {
                        log.debug('Agent not found for participant', { agentId: participant.id });
                        continue;
                    }

                    this.coordinator.notifyManager.notifyThinking(agent.id, 'thinking');
                    
                    try {
                        const response = await this.coordinator.agentManager.generateAgentResponse(
                            agent.id,
                            conversation,
                            participant.task
                        );

                        const formattedResponse = this.coordinator.agentManager.formatAgentResponse(
                            response,
                            agent.id,
                            participant.role
                        );

                        log.debug('Formatted agent response for response phase:', {
                            agentId: agent.id,
                            role: participant.role,
                            content: formattedResponse.content,
                            conversationId: conversation.id
                        });

                        this.coordinator.conversationManager.logMessage(conversation.id, formattedResponse);
                        this.coordinator.notifyManager.notifyResponse(formattedResponse);
                        responses.push(formattedResponse);
                    } catch (error) {
                        log.error(`Error generating response for response phase for agent ${agent.id}:`, {
                            error: error.message,
                            stack: error.stack,
                            task: participant.task,
                            conversationId: conversation.id
                        });
                    }
                }
                
                return responses;
            },
            {
                conversationId: conversation.id,
                participantCount: plan.participants.length
            }
        );
    }
}
