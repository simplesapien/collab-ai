import { Logger } from '../../utils/logger.js';

export class Coordinator {
    constructor(conversationManager, agents, qualityGate, notifyResponse, onAgentThinking) {
        this.conversationManager = conversationManager;
        this.agents = agents;
        this.qualityGate = qualityGate;
        this.notifyResponse = notifyResponse;
        this.notifyThinking = onAgentThinking;
        Logger.debug('[Coordinator] Initialized with dependencies');
    }

    async orchestrateDiscussion(conversationId, message) {
        try {
            Logger.debug(`[Coordinator] Starting orchestration for conversation: ${conversationId}`, { message });
            
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
            if (this.qualityGate.currentRound > 1) {
                if (this.notifyThinking) {
                    this.notifyThinking('director-1', 'synthesizing');
                }

                const finalSummary = await director.synthesizeDiscussion(conversation.messages);
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

    async _getDirector() {
        Logger.debug(`[Coordinator] Getting director agent`);
        const director = this.agents.get('director-1');
        if (!director) {
            Logger.error(`[Coordinator] Director agent not found`);
            throw new Error('Director agent not found');
        }
        return director;
    }

    _getAvailableAgents(directorId) {
        Logger.debug(`[Coordinator] Getting available agents`, { excludingDirectorId: directorId });
        const availableAgents = Array.from(this.agents.values())
            .filter(agent => agent.id !== directorId);

        if (availableAgents.length === 0) {
            Logger.error(`[Coordinator] No available agents found`);
            throw new Error('No available agents found for discussion');
        }
        return availableAgents;
    }

    async _executeInitialPlanning(director, message, availableAgents) {
        Logger.debug(`[Coordinator] Executing initial planning`, { messageContent: message.content });
        this._notifyAgentThinking('director-1', 'thinking');
        const plan = await director.planInitialAgentTasks(message.content, availableAgents);
        await this._emitDirectorPlan(plan);
        return plan;
    }

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

    _cleanResponse(response, agentId) {
        const agentPrefixes = {
            'director-1': /^(?:Director:?\s*)/i,
            'analyst-1': /^(?:Analyst:?\s*)/i,
            'critic-1': /^(?:Critic:?\s*)/i,
            'expert-1': /^(?:Expert:?\s*)/i,
            'system': /^(?:System:?\s*)/i
        };
        return response.replace(agentPrefixes[agentId.toLowerCase()], '').trim();
    }

    _notifyAgentThinking(agentId, phase = 'thinking') {
        if (this.notifyThinking) {
            this.notifyThinking(agentId, phase);
        }
    }

    async _executeInitialResponses(conversation, plan) {
        Logger.debug(`[Coordinator] Executing initial responses for ${conversation.id}`);
        const responses = [];
        
        for (const participant of plan.participants) {
            Logger.debug(`[Coordinator] Processing participant response`, { participant });
            
            const agent = this.agents.get(participant.id);
            
            if (!agent) {
                Logger.warn(`[Coordinator] Agent not found for participant`, { agentId: participant.id });
                continue;
            }

            this._notifyAgentThinking(agent.id, 'thinking');
            
            try {
                Logger.debug(`[Coordinator] Generating response for agent`, { 
                    agentId: agent.id,
                    task: participant.task 
                });

                const response = await agent.generateResponse(
                    conversation.messages,
                    participant.task
                );

                const formattedResponse = {
                    agentId: agent.id,
                    role: participant.role,
                    content: this._cleanResponse(response, agent.id),
                    timestamp: Date.now()
                };

                Logger.debug(`[Coordinator] Agent response received`, { 
                    agentId: agent.id,
                    responseLength: formattedResponse.content.length 
                });

                this.conversationManager.logMessage(conversation.id, formattedResponse);
                responses.push(formattedResponse);
                
                if (this.notifyResponse) {
                    this.notifyResponse(formattedResponse);
                }
            } catch (error) {
                Logger.error(`[Coordinator] Error generating response for agent ${agent.id}:`, error);
            }
        }

        Logger.debug(`[Coordinator] Completed initial responses`, { 
            totalResponses: responses.length 
        });

        return responses;
    }

    async _executeCollaborationPhase(conversation, director, initialResponses) {
        Logger.info('[SystemCoordinator] Starting collaboration phase...');
        
        // Reset counter here, right before the collaboration phase starts
        this.qualityGate.resetRoundCounter();
        
        while (true) {
            // Increment the counter at the START of each collaboration round
            this.qualityGate.incrementRound();
            
            // Quality check now uses the correct round number
            const qualityCheck = await this.qualityGate.validateCollaborationContinuation(
                conversation,
                initialResponses
            );

            if (!qualityCheck.shouldContinue) {
                Logger.info(`[SystemCoordinator] Ending collaboration: ${qualityCheck.reason}`);
                break;
            }

            // Log the round number to the console
            Logger.info(`[SystemCoordinator] Collaboration round (after shouldContinue) ${this.qualityGate.currentRound} is continuing`);

            // Get next collaboration plan from director
            const collaborationPlan = await director.planNextAgentInteraction(
                conversation.messages,
                initialResponses
            );

            if (!collaborationPlan || 
                !collaborationPlan.nextAgent || 
                collaborationPlan.respondTo.includes(collaborationPlan.nextAgent)) {
                Logger.debug('[SystemCoordinator] Invalid collaboration plan - preventing self-response');
                break;
            }

            // Get the next agent to respond
            const nextAgentId = `${collaborationPlan.nextAgent.toLowerCase()}-1`;
            const nextAgent = this.agents.get(nextAgentId);
            
            if (!nextAgent) {
                Logger.error(`[SystemCoordinator] Next agent not found: ${nextAgentId}`);
                break;
            }

            // Add validation to ensure the next agent hasn't just responded
            const lastResponse = initialResponses[initialResponses.length - 1];
            if (lastResponse && lastResponse.agentId === nextAgentId) {
                Logger.debug('[SystemCoordinator] Preventing consecutive responses from same agent');
                break;
            }

            try {
                // Add this line before generating collaborative response
                if (this.notifyThinking) {
                    this.notifyThinking(nextAgentId);
                }

                const task = `Respond to ${collaborationPlan.respondTo.join(' and ')}'s points: ${collaborationPlan.task}`;
                const response = await nextAgent.generateResponse(
                    conversation.messages,
                    task
                );

                const collaborativeResponse = {
                    agentId: nextAgent.id,
                    role: collaborationPlan.nextAgent,
                    content: response,
                    timestamp: Date.now()
                };

                Logger.debug('[CollaborationOrchestrator] Emitting collaborative response:', collaborativeResponse);
                if (this.notifyResponse) {
                    this.notifyResponse(collaborativeResponse);
                } else {
                    Logger.warn('[CollaborationOrchestrator] No notification callback for collaborative response');
                }

                // Only log to conversation manager (don't emit)
                this.conversationManager.logMessage(conversation.id, {
                    agentId: nextAgent.id,
                    content: collaborativeResponse.content,
                    timestamp: Date.now()
                });
                
                // Add to responses collection
                initialResponses.push(collaborativeResponse);
            } catch (error) {
                Logger.error('[SystemCoordinator] Error in collaboration round:', error);
                break;
            }
        }

        return initialResponses;
    }
}