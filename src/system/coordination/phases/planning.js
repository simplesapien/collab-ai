import { Logger } from '../../../utils/logger.js';

export class PlanningPhase {
    constructor(coordinator) {
        this.coordinator = coordinator;
    } 

    async execute(director, message, availableAgents) {
        Logger.debug(`[PlanningPhase] Executing initial planning`, { messageContent: message.content });
        
        this.coordinator.notifyManager.notifyThinking('director-1', 'planning');
        const plan = await director.planInitialAgentTasks(message.content, availableAgents);
        
        await this._emitDirectorPlan(plan, this.coordinator.conversationManager.getCurrentConversationId());
        return plan;
    }

    async _emitDirectorPlan(plan, conversationId) {
        Logger.debug(`[PlanningPhase] Emitting director plan`, { participantCount: plan.participants.length });
        
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
    }
}