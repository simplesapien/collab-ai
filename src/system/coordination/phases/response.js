import { log } from '../../../utils/winstonLogger.js';
import { Phase } from './base.js';

export class ResponsePhase extends Phase {
    constructor(coordinator) {
        super(coordinator, 'ResponsePhase');
    }

    async execute(conversation, plan) {
        return this.executeWithLogging(
            async () => {
                const responses = [];
                
                log.info('Starting initial responses phase:', {
                    participantCount: plan.participants.length,
                    conversationId: conversation.id
                });
                
                for (const participant of plan.participants) {
                    if (this.coordinator.isCancelled) {
                        log.debug('Cancelling remaining responses');
                        return responses;
                    }

                    const agent = this.coordinator.agentManager.getAgent(participant.id);
                    if (!agent) {
                        log.warn('Agent not found for participant', { agentId: participant.id });
                        continue;
                    }

                    this.coordinator.notifyManager.notifyThinking(agent.id, 'thinking');
                    
                    try {
                        log.debug('Generating response for agent:', {
                            agentId: agent.id,
                            role: participant.role,
                            task: participant.task
                        });

                        const response = await this.coordinator.agentManager.generateAgentResponse(
                            agent.id,
                            conversation,
                            participant.task
                        );

                        log.info('Raw agent response:', {
                            agentId: agent.id,
                            content: response,
                            conversationId: conversation.id
                        });

                        const formattedResponse = this.coordinator.agentManager.formatAgentResponse(
                            response,
                            agent.id,
                            participant.role
                        );

                        log.info('Formatted agent response:', {
                            agentId: agent.id,
                            role: participant.role,
                            content: formattedResponse.content,
                            conversationId: conversation.id
                        });

                        this.coordinator.conversationManager.logMessage(conversation.id, formattedResponse);
                        this.coordinator.notifyManager.notifyResponse(formattedResponse);
                        responses.push(formattedResponse);
                    } catch (error) {
                        log.error(`Error generating response for agent ${agent.id}:`, {
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
