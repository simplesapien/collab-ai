import { Logger } from '../../utils/logger.js';
import { PlanningPhase } from './phases/planning.js';

export class Coordinator {
    constructor(conversationManager, agentManager, qualityGate, notifyManager) {
        this.conversationManager = conversationManager;
        this.agentManager = agentManager;
        this.qualityGate = qualityGate;
        this.notifyManager = notifyManager;
        this.isProcessing = false;
        this.isCancelled = false;
        this.planningPhase = new PlanningPhase(this);
        Logger.debug('[Coordinator] Initialized with dependencies');
    }

    async coordinateDiscussion(conversationId, message) {
        this.isProcessing = true;
        this.isCancelled = false;

        try {
            Logger.debug(`[Coordinator] Starting coordination for conversation: ${conversationId}`);
            
            const conversation = await this._initializeConversation(conversationId, message);
            Logger.debug(`[Coordinator] Conversation initialized`, { conversationId });

            const director = await this._getDirector();
            Logger.debug(`[Coordinator] Director retrieved`, { directorId: director.id });

            const availableAgents = this._getAvailableAgents(director.id);
            Logger.debug(`[Coordinator] Available agents retrieved`, { count: availableAgents.length });
            
            // Phase 1: Planning
            if (this.isCancelled) return;
            const plan = await this.planningPhase.execute(director, message, availableAgents);
            
            // Phase 2: Initial Responses
            if (this.isCancelled) return;
            Logger.debug(`[Coordinator] Starting initial responses phase`);
            const agentResponses = await this._executeInitialResponses(conversation, plan);
            Logger.debug(`[Coordinator] Initial responses complete`, { responseCount: agentResponses.length });
            
            // Phase 3: Collaboration
            if (this.isCancelled) return;
            Logger.debug(`[Coordinator] Starting collaboration phase`);
            const collaborationResults = await this._executeCollaborationPhase(conversation, director, agentResponses);
            Logger.debug(`[Coordinator] Collaboration complete`, { resultCount: collaborationResults.length });
            
            // Phase 4: Final Summary
            if (this.isCancelled) return;
            this.notifyManager.notifyThinking('director-1', 'synthesizing');
            Logger.debug(`[Coordinator] Starting final summary phase`);
            const finalSummary = await director.synthesizeDiscussion(conversation.messages);
            Logger.debug(`[Coordinator] Final summary complete`, { summary: finalSummary });

            // Emit final summary to the UI if the callback is provided
            if (this.notifyManager.notifyResponse) {
                const summaryResponse = {
                    agentId: 'director-1',
                    role: 'Summary',
                    content: finalSummary,
                    timestamp: Date.now()
                };
                Logger.debug('[CollaborationOrchestrator] Emitting final summary:', summaryResponse);
                this.notifyManager.notifyResponse(summaryResponse);
            }
            return {
                plan: plan.participants,
                responses: agentResponses,
                summary: finalSummary
            };
        } catch (error) {
            Logger.error('[Coordinator] Error orchestrating discussion:', error);
            
            // Check if this was a cancellation
            if (this.isCancelled) {
                // Don't throw an error for cancellations
                return {
                    responses: [],
                    summary: null,
                    cancelled: true
                };
            }
            
            throw error;
        } finally {
            this.isProcessing = false;
            this.isCancelled = false;
        }
    }

    async _initializeConversation(conversationId, message) {
        Logger.debug(`[Coordinator] Initializing conversation`, { conversationId });
        const conversation = this.conversationManager.getConversation(conversationId) || 
            this.conversationManager.createConversation({
                id: conversationId,
                messages: []
            });

        this.conversationManager.logMessage(conversationId, {
            agentId: 'user',
            content: message.content,
            timestamp: Date.now()
        });

        return conversation;
    }

    // Phase 1: Planning - execute the planning 
    async _executeInitialPlanning(director, message, availableAgents) {
        Logger.debug(`[Coordinator] Executing initial planning`, { messageContent: message.content });
        this.notifyManager.notifyThinking('director-1', 'planning');
        const plan = await director.planInitialAgentTasks(message.content, availableAgents);
        await this._emitDirectorPlan(plan, this.conversationManager.getCurrentConversationId());
        return plan;
    }

    // Phase 1: Planning - emit the plan to the UI
    async _emitDirectorPlan(plan, conversationId) {
        Logger.debug(`[Coordinator] Emitting director plan`, { participantCount: plan.participants.length });
        for (const participant of plan.participants) {
            const response = {
                agentId: 'director-1',
                role: 'Director',
                content: `${participant.role}: ${participant.task}`,
                timestamp: Date.now()
            };
            this.conversationManager.logMessage(conversationId, response);
            this.notifyManager.notifyResponse(response);
        }
    }

    // Phase 2: Initial Responses - execute the responses
    async _executeInitialResponses(conversation, plan) {
        Logger.debug(`[Coordinator] Executing initial responses for ${conversation.id}`);
        const responses = [];
        
        for (const participant of plan.participants) {
            if (this.isCancelled) {
                Logger.debug('[Coordinator] Cancelling remaining initial responses');
                // Don't throw an error, just return collected responses
                return responses;
            }

            Logger.debug('[Coordinator] Processing participant response', { participant });
            
            const agent = this.agentManager.getAgent(participant.id);
            if (!agent) {
                Logger.warn('[Coordinator] Agent not found for participant', { agentId: participant.id });
                continue;
            }

            this.notifyManager.notifyThinking(agent.id, 'thinking');
            
            try {
                const response = await this.agentManager.generateAgentResponse(
                    agent.id,
                    conversation,
                    participant.task
                );

                const formattedResponse = this.agentManager.formatAgentResponse(
                    response,
                    agent.id,
                    participant.role
                );

                this.conversationManager.logMessage(conversation.id, formattedResponse);
                this.notifyManager.notifyResponse(formattedResponse);
                responses.push(formattedResponse);
            } catch (error) {
                Logger.error(`[Coordinator] Error generating response for agent ${agent.id}:`, error);
            }
        }

        return responses;
    }

    // Phase 3: Collaboration - execute the collaboration
    async _executeCollaborationPhase(conversation, director, initialResponses) {
        Logger.info('[Coordinator] Starting collaboration phase...');
        
        this.qualityGate.resetRoundCounter();
        
        while (true) {
            if (this.isCancelled) {
                Logger.debug('[Coordinator] Cancelling collaboration phase');
                break;
            }

            const currentRound = this.qualityGate.incrementRound();
            
            const qualityCheck = await this.qualityGate.performQualityCheck(
                conversation,
                initialResponses
            );

            Logger.debug('[Coordinator] Quality check result:', {
                shouldContinue: qualityCheck.shouldContinue,
                reason: qualityCheck.reason,
                round: currentRound
            });

            if (!qualityCheck.shouldContinue) {
                Logger.info(`[Coordinator] Ending collaboration: ${qualityCheck.reason}`);
                break;
            }

            const collaborationPlan = await director.planNextAgentInteraction(
                conversation.messages,
                initialResponses
            );

            if (!this._isValidCollaborationPlan(collaborationPlan)) {
                Logger.debug('[Coordinator] Invalid collaboration plan - ending phase');
                break;
            }

            const nextAgentId = `${collaborationPlan.nextAgent.toLowerCase()}-1`;
            const nextAgent = this.agentManager.getAgent(nextAgentId);
            
            if (!nextAgent) {
                Logger.error('[Coordinator] Next agent not found:', nextAgentId);
                break;
            }

            if (this.agentManager.isConsecutiveResponse(initialResponses, nextAgentId)) {
                Logger.debug('[Coordinator] Preventing consecutive responses from same agent');
                break;
            }

            try {
                await this._handleCollaborativeResponse(
                    nextAgent,
                    conversation,
                    collaborationPlan,
                    initialResponses
                );
            } catch (error) {
                Logger.error('[Coordinator] Error in collaboration round:', error);
                break;
            }
        }

        return initialResponses;
    }

    // Phase 3: Collaboration - handle the collaborative response
    async _handleCollaborativeResponse(agent, conversation, plan, responses) {
        this.notifyManager.notifyThinking(agent.id, 'thinking');

        const task = `Respond to ${plan.respondTo.join(' and ')}'s points: ${plan.task}`;
        const response = await this.agentManager.generateAgentResponse(agent.id, conversation, task);

        const collaborativeResponse = this.agentManager.formatAgentResponse(
            response,
            agent.id,
            plan.nextAgent
        );

        this.conversationManager.logMessage(conversation.id, collaborativeResponse);
        this.notifyManager.notifyResponse(collaborativeResponse);
        responses.push(collaborativeResponse);
    }

    // Helper methods
    _isValidCollaborationPlan(plan) {
        return plan && 
            plan.nextAgent && 
            !plan.respondTo.includes(plan.nextAgent);
    }

    async _getDirector() {
        return await this.agentManager.getDirector();
    }

    _getAvailableAgents(directorId) {
        return this.agentManager.getAvailableAgents(directorId);
    }

    async cancelCurrentProcess() {
        if (this.isProcessing) {
            Logger.debug('[Coordinator] Cancelling current process');
            this.isCancelled = true;
            
            // Mark this as a cancellation type
            const cancellationResponse = {
                agentId: 'system',
                role: 'System',
                content: 'Process cancelled. Ready for new input.',
                type: 'cancellation',
                timestamp: Date.now()
            };
            
            this.notifyManager.notifyResponse(cancellationResponse);
            this.isProcessing = false;
            
            // Return early without throwing an error
            return;
        }
    }

    // New boilerplate methods for future phases
    async _planNextCollaborationRound(director, conversation, currentResponses) {
        // To be implemented in Phase 2
        return {
            ...await director.planNextAgentInteraction(conversation.messages, currentResponses),
            complexity: await this._assessDiscussionComplexity(conversation),
            stage: await this._determineDiscussionStage(conversation)
        };
    }

    async _assessDiscussionComplexity(conversation) {
        // To be implemented in Phase 3
        return 'medium';
    }

    async _determineDiscussionStage(conversation) {
        // To be implemented in Phase 3
        return 'collaboration';
    }

    _validatePlanComplexity(plan) {
        // To be implemented in Phase 3
        return true;
    }
}