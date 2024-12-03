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

                    try {
                        let attempts = 0;
                        const maxAttempts = 3;
                        let qualityPassed = false;
                        let formattedResponse;

                        while (!qualityPassed && attempts < maxAttempts) {
                            this.coordinator.notifyManager.notifyThinking(agent.id, 'thinking');
                            
                            const response = await this.coordinator.agentManager.generateAgentResponse(
                                agent.id,
                                conversation,
                                participant.task
                            );

                            formattedResponse = this.coordinator.agentManager.formatAgentResponse(
                                response,
                                agent.id,
                                participant.role
                            );

                            const qualityCheck = await this.coordinator.qualityGate.checkQuality(
                                formattedResponse.content,
                                participant.task
                            );

                            if (qualityCheck.shouldContinue) {
                                qualityPassed = true;
                            } else {
                                attempts++;
                                log.debug(`Quality check failed for ${agent.id}`, {
                                    attempt: attempts,
                                    reason: qualityCheck.reason,
                                    task: participant.task
                                });
                            }
                        }

                        if (qualityPassed) {
                            this.coordinator.conversationManager.logMessage(conversation.id, formattedResponse);
                            this.coordinator.notifyManager.notifyResponse(formattedResponse);
                            responses.push(formattedResponse);
                        } else {
                            log.warn(`Failed quality check after ${maxAttempts} attempts`, {
                                agentId: agent.id,
                                task: participant.task
                            });
                        }
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
