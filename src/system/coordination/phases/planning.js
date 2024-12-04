import { log } from '../../../utils/logger.js';
import { Phase } from './base.js';
import { inspectObject, getMethods, getProperties } from '../../../utils/inspector.js';

export class PlanningPhase extends Phase {
    constructor(coordinator) {
        super(coordinator, 'PlanningPhase');
    }

    async execute(director, message, availableAgents, conversationId) {
    
        return this.executeWithLogging(
            async () => {
                this.coordinator.notifyManager.notifyThinking('director-1', 'planning');                
                const plan = await this.executeWithRetry({
                    operation: async () => {
                        return director.planInitialAgentTasks(
                            message.content, 
                            availableAgents, 
                            conversationId
                        );
                    },
                    qualityCheck: async (plan) => {
                        // Custom quality check for plans
                        return this.coordinator.qualityGate.checkPlanQuality(
                            plan,
                            availableAgents
                        );
                    },
                    agentId: 'director-1',
                    task: 'planning initial tasks',
                    metadata: { conversationId }
                });

                if (plan) {
                    await this._emitDirectorPlan(plan, conversationId);
                } else {
                    console.log('PlanningPhase - No plan received');
                }
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

            return conversation;
        } catch (error) {
            console.error('PlanningPhase - Conversation initialization failed:', error);
            throw error;
        }
    }

    async _getDirector() {
        const director = await this.coordinator.agentManager.getDirector();
        return director;
    }

    _getAvailableAgents(directorId) {
        const agents = this.coordinator.agentManager.getAvailableAgents(directorId);
        return agents;
    }
}