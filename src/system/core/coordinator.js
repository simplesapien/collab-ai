import { Logger } from '../../utils/logger.js';

export class Coordinator {
    constructor(conversationManager, agentManager, qualityGate, notifyResponse, onAgentThinking) {
        this.conversationManager = conversationManager;
        this.agentManager = agentManager;
        this.qualityGate = qualityGate;
        this.notifyResponse = notifyResponse;
        this.notifyThinking = onAgentThinking;
        Logger.debug('[Coordinator] Initialized with dependencies');
    }

    async coordinateDiscussion(conversationId, message) {
        try {
            Logger.debug(`[Coordinator] Starting coordination for conversation: ${conversationId}`, { message });
            
            const conversation = await this._initializeConversation(conversationId, message);
            Logger.debug(`[Coordinator] Conversation initialized`, { conversationId });

            const director = await this._getDirector();
            Logger.debug(`[Coordinator] Director retrieved`, { directorId: director.id });

            const availableAgents = this._getAvailableAgents(director.id);
            Logger.debug(`[Coordinator] Available agents retrieved`, { count: availableAgents.length });
            
            // Phase 1: Planning
            Logger.debug(`[Coordinator] Starting planning phase`);
            const plan = await this._executeInitialPlanning(director, message, availableAgents);
            Logger.debug(`[Coordinator] Planning complete`, { plan });
            
            // Phase 2: Initial Responses
            Logger.debug(`[Coordinator] Starting initial responses phase`);
            const agentResponses = await this._executeInitialResponses(conversation, plan);
            Logger.debug(`[Coordinator] Initial responses complete`, { responseCount: agentResponses.length });
            
            // Phase 3: Collaboration
            Logger.debug(`[Coordinator] Starting collaboration phase`);
            const collaborationResults = await this._executeCollaborationPhase(conversation, director, agentResponses);
            Logger.debug(`[Coordinator] Collaboration complete`, { resultCount: collaborationResults.length });
            
            // Phase 4: Final Summary
            this.notifyThinking('director-1', 'synthesizing');
            Logger.debug(`[Coordinator] Starting final summary phase`);
            const finalSummary = await director.synthesizeDiscussion(conversation.messages);
            Logger.debug(`[Coordinator] Final summary complete`, { summary: finalSummary });

            // Emit final summary to the UI if the callback is provided
            if (this.notifyResponse) {
                const summaryResponse = {
                    agentId: 'director-1',
                    role: 'Summary',
                    content: finalSummary,
                    timestamp: Date.now()
                };
                Logger.debug('[CollaborationOrchestrator] Emitting final summary:', summaryResponse);
                this.notifyResponse(summaryResponse);
            }
            return {
                plan: plan.participants,
                responses: agentResponses,
                summary: finalSummary
            };
        } catch (error) {
            Logger.error('[Coordinator] Error orchestrating discussion:', error);
            throw error;
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
        this._notifyAgentThinking('director-1', 'thinking');
        const plan = await director.planInitialAgentTasks(message.content, availableAgents);
        await this._emitDirectorPlan(plan);
        return plan;
    }

    // Phase 1: Planning - emit the plan to the UI
    async _emitDirectorPlan(plan) {
        Logger.debug(`[Coordinator] Emitting director plan`, { participantCount: plan.participants.length });
        for (const participant of plan.participants) {
            const directorResponse = {
                agentId: 'director-1',
                role: 'Director',
                content: `${participant.role}: ${participant.task}`,
                timestamp: Date.now()
            };
            
            if (this.notifyResponse) {
                this.notifyResponse(directorResponse);
            }
        }
    }

    // Phase 2: Initial Responses - notify the UI that the agent is thinking
    _notifyAgentThinking(agentId, phase = 'thinking') {
        if (this.notifyThinking) {
            this.notifyThinking(agentId, phase);
        }
    }

    // Phase 2: Initial Responses - execute the responses
    async _executeInitialResponses(conversation, plan) {
        Logger.debug(`[Coordinator] Executing initial responses for ${conversation.id}`);
        const responses = [];
        
        for (const participant of plan.participants) {
            Logger.debug('[Coordinator] Processing participant response', { participant });
            
            const agent = this.agentManager.getAgent(participant.id);
            
            if (!agent) {
                Logger.warn('[Coordinator] Agent not found for participant', { agentId: participant.id });
                continue;
            }

            this._notifyAgentThinking(agent.id, 'thinking');
            
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
                responses.push(formattedResponse);
                
                this._emitResponse(formattedResponse);
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
            this.qualityGate.incrementRound();
            
            const qualityCheck = await this.qualityGate.validateCollaborationContinuation(
                conversation,
                initialResponses
            );

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

    async _handleCollaborativeResponse(agent, conversation, plan, responses) {
        this._notifyAgentThinking(agent.id);

        const task = `Respond to ${plan.respondTo.join(' and ')}'s points: ${plan.task}`;
        const response = await this.agentManager.generateAgentResponse(agent.id, conversation, task);

        const collaborativeResponse = this.agentManager.formatAgentResponse(
            response,
            agent.id,
            plan.nextAgent
        );

        this._emitResponse(collaborativeResponse);
        this.conversationManager.logMessage(conversation.id, collaborativeResponse);
        responses.push(collaborativeResponse);
    }

    // Helper methods
    _isValidCollaborationPlan(plan) {
        return plan && 
            plan.nextAgent && 
            !plan.respondTo.includes(plan.nextAgent);
    }
    
    _emitResponse(response) {
        if (this.notifyResponse) {
            this.notifyResponse(response);
        }
    }

    async _getDirector() {
        return await this.agentManager.getDirector();
    }

    _getAvailableAgents(directorId) {
        return this.agentManager.getAvailableAgents(directorId);
    }
}