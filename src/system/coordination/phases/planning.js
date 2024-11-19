import { log } from '../../../utils/winstonLogger.js';

export class PlanningPhase {
    constructor(coordinator) {
        this.coordinator = coordinator;
    } 

    async execute(director, message, availableAgents) {
        const eventId = log.event.emit('execute', 'PlanningPhase', {
            messageLength: message.content?.length,
            agentCount: availableAgents.length
        });
        const startTime = Date.now();

        try {
            log.debug('Starting planning execution', { 
                messageContent: message.content?.substring(0, 50),
                availableAgents: availableAgents.length
            });
            
            this.coordinator.notifyManager.notifyThinking('director-1', 'planning');
            const plan = await director.planInitialAgentTasks(message.content, availableAgents);
            
            await this._emitDirectorPlan(plan, this.coordinator.conversationManager.getCurrentConversationId());
            
            log.perf.measure('planning-execution', Date.now() - startTime, {
                participantCount: plan.participants.length
            });
            
            log.event.complete(eventId, 'completed', {
                planParticipants: plan.participants.length
            });
            return plan;
        } catch (error) {
            log.error('Planning execution failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    async _emitDirectorPlan(plan, conversationId) {
        const eventId = log.event.emit('emitPlan', 'PlanningPhase', {
            participantCount: plan.participants.length
        });
        const startTime = Date.now();

        try {
            log.debug('Emitting director plan', { 
                participantCount: plan.participants.length,
                conversationId 
            });

            for (const participant of plan.participants) {
                const response = {
                    agentId: 'director-1',
                    role: 'Director',
                    content: `${participant.role}: ${participant.task}`,
                    timestamp: Date.now()
                };
                this.coordinator.conversationManager.logMessage(conversationId, response);
                this.coordinator.notifyManager.notifyResponse(response);
            }

            log.perf.measure('plan-emission', Date.now() - startTime, {
                participantCount: plan.participants.length
            });
            log.event.complete(eventId);
        } catch (error) {
            log.error('Plan emission failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }
}