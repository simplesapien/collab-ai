import { log } from '../../../utils/logger.js';
import { Phase } from './base.js';
import { inspectObject, getMethods, getProperties } from '../../../utils/inspector.js';

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

                    const formattedResponse = await this.executeWithRetry({
                        operation: async () => {
                            const response = await this.coordinator.agentManager.generateAgentResponse(
                                agent.id,
                                conversation,
                                participant.task
                            );

                            return this.coordinator.agentManager.formatAgentResponse(
                                response,
                                agent.id,
                                participant.role
                            );
                        },
                        qualityCheck: async (response) => {
                            return this.coordinator.qualityGate.checkResponseQuality(
                                response.content,
                                participant.task
                            );
                        },
                        agentId: agent.id,
                        task: participant.task,
                        metadata: { conversationId: conversation.id }
                    });

                    if (formattedResponse) {
                        this.coordinator.conversationManager.logMessage(conversation.id, formattedResponse);
                        this.coordinator.notifyManager.notifyResponse(formattedResponse);
                        responses.push(formattedResponse);
                         


                        // TODO: Take these out later. Just using them to check the state of the coordinator class at this point.

                        // Log everything inside the coordinator class
                        // const coordinatorStructure = inspectObject(this.coordinator, 0, 4);
                        // log.debug('[RESPONSE PHASE] Coordinator structure:', coordinatorStructure);
                        
                        // Or use the specific helpers
                        // log.debug('[RESPONSE PHASE] Coordinator methods:', getMethods(this.coordinator));
                        // log.debug('[RESPONSE PHASE] Coordinator properties:', getProperties(this.coordinator));
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
