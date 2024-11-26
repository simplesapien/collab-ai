import { log } from '../../../utils/logger.js';
import { Phase } from './base.js';

export class PlanningPhase extends Phase {
    constructor(coordinator) {
        super(coordinator, 'PlanningPhase');
    }

    async execute(director, message, availableAgents, storedInsights) {
        return this.executeWithLogging(
            async () => {

                this.coordinator.notifyManager.notifyThinking('director-1', 'planning');
                const plan = await director.planInitialAgentTasks(message.content, availableAgents, storedInsights);

                await this._emitDirectorPlan(plan, this.coordinator.conversationManager.getCurrentConversationId());
                return plan;
            },
            {
                messageLength: message.content?.length,
                agentCount: availableAgents.length
            }
        );
    }

    async _emitDirectorPlan(plan, conversationId) {
        return this.executeWithLogging(
            async () => {
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
            },
            {
                participantCount: plan.participants.length,
                conversationId
            }
        );
    }

    async _initializeConversation(conversationId, message) {
        const startTime = Date.now();

        try {
            const conversation = this.coordinator.conversationManager.getConversation(conversationId) || 
                this.coordinator.conversationManager.createConversation({
                    id: conversationId,
                    messages: []
                });

            this.coordinator.conversationManager.logMessage(conversationId, {
                agentId: 'user',
                content: message.content,
                timestamp: Date.now()
            });

            log.perf.measure('conversation-initialization', Date.now() - startTime, {
                conversationId,
                isNew: !this.coordinator.conversationManager.getConversation(conversationId)
            });

            return conversation;
        } catch (error) {
            log.error('Conversation initialization failed', error);
            throw error;
        }
    }

    async _getDirector() {
        return await this.coordinator.agentManager.getDirector();
    }

    _getAvailableAgents(directorId) {
        return this.coordinator.agentManager.getAvailableAgents(directorId);
    }
}