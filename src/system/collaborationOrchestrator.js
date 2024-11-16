import { Logger } from '../utils/logger.js';

export class CollaborationOrchestrator {
    constructor(conversationManager, agents, qualityGate, notifyResponse, onAgentThinking) {
        this.conversationManager = conversationManager;
        this.agents = agents;
        this.qualityGate = qualityGate;
        this.notifyResponse = notifyResponse;
        this.notifyThinking = onAgentThinking;
    }

    async orchestrateDiscussion(conversationId, message) {
        try {
            Logger.info(`[SystemCoordinator] Starting orchestration for conversation: ${conversationId}`);
            
            // Get or create conversation
            let conversation = this.conversationManager.getConversation(conversationId) || 
                this.conversationManager.createConversation({
                    id: conversationId,
                    messages: []
                });

            Logger.debug('[SystemCoordinator] Logging user message:', message);
            this.conversationManager.logMessage(conversationId, {
                agentId: 'user',
                content: message.content,
                timestamp: Date.now()
            });

            // Get director and validate
            const director = this.agents.get('director-1');
            if (!director) {
                Logger.error('[SystemCoordinator] Director agent not found');
                throw new Error('Director agent not found');
            }

            // Get available agents (excluding director)
            const availableAgents = Array.from(this.agents.values())
                .filter(agent => agent.id !== director.id);

            if (availableAgents.length === 0) {
                Logger.error('[SystemCoordinator] No available agents found for discussion');
                throw new Error('No available agents found for discussion');
            }

            // Phase 1: Get initial discussion plan from director
            Logger.info('[SystemCoordinator] Getting discussion plan from director...');
            
            // Show the thinking indicator for the director
            if (this.notifyThinking) {
                Logger.debug('[CollaborationOrchestrator] Notifying agent thinking:', {
                    agentId: 'director-1',
                    phase: 'thinking'
                });
                this.notifyThinking('director-1', 'thinking');
            }

            const plan = await director.planInitialAgentTasks(message.content, availableAgents);
            Logger.debug('[SystemCoordinator] Received initial plan from director:', plan);

            // Emit director's plan assignments in real-time
            for (const participant of plan.participants) {
                const directorResponse = {
                    agentId: 'director-1',
                    role: 'Director',
                    content: `${participant.role}: ${participant.task}`,
                    timestamp: Date.now()
                };
                
                Logger.debug('[CollaborationOrchestrator] Emitting director response:', directorResponse);
                if (this.notifyResponse) {
                    this.notifyResponse(directorResponse);
                } else {
                    Logger.warn('[CollaborationOrchestrator] No notification callback for director response');
                }

                // Log to conversation manager
                this.conversationManager.logMessage(conversationId, {
                    agentId: 'director-1',
                    content: directorResponse.content,
                    timestamp: Date.now()
                });
            }

            // Phase 2: Execute the initial agent responses to director's tasks
            const agentResponses = [];
            
            // Execute each participant's initial task
            Logger.info('[SystemCoordinator] Executing initial discussion plan...');
            for (const participant of plan.participants) {
                Logger.debug(`[SystemCoordinator] Processing participant: ${participant.id} - ${participant.role}`);
                
                // Get the agent instance
                let agent = this.agents.get(participant.id) || 
                           this.agents.get(participant.id.toLowerCase());
                
                if (!agent) {
                    Logger.warn(`[SystemCoordinator] Agent not found for participant:`, participant);
                    continue;
                }

                // Before generating responses, add this debug log
                Logger.debug(`[SystemCoordinator] Generating response for ${participant.role}:`, {
                    id: participant.id,
                    task: participant.task
                });

                try {
                    // Show which agent's turn it is to think
                    if (this.notifyThinking) {
                        this.notifyThinking(participant.id);
                    }

                    const response = await agent.generateResponse(
                        conversation.messages,
                        participant.task
                    );

                    // Take the agent pre-fix out of the response
                    const agentPrefixes = {
                        'director-1': /^(?:Director:?\s*)/i,
                        'analyst-1': /^(?:Analyst:?\s*)/i,
                        'critic-1': /^(?:Critic:?\s*)/i,
                        'expert-1': /^(?:Expert:?\s*)/i,
                        'system': /^(?:System:?\s*)/i
                    };

                    const cleanedResponse = response.replace(agentPrefixes[participant.id.toLowerCase()], '').trim();
                    
                    const agentResponse = {
                        agentId: participant.id,
                        role: participant.role,
                        content: cleanedResponse,
                        timestamp: Date.now()
                    };

                    Logger.debug('[CollaborationOrchestrator] Emitting agent response:', agentResponse);
                    if (this.notifyResponse) {
                        this.notifyResponse(agentResponse);
                    } else {
                        Logger.warn('[CollaborationOrchestrator] No notification callback for agent response');
                    }

                    // Add response to the collection
                    agentResponses.push({
                        ...agentResponse,
                        response: response
                    });

                    // Only log to conversation manager (don't emit)
                    this.conversationManager.logMessage(conversationId, {
                        agentId: participant.id,
                        content: agentResponse.content,
                        timestamp: Date.now()
                    });

                    Logger.debug(`[SystemCoordinator] Generated response for ${participant.role}:`, {
                        content: agentResponse.content
                    });
                } catch (error) {
                    Logger.error(`[SystemCoordinator] Error processing participant ${participant.id}:`, error);
                }
            }

            // Phase 3: Collaboration Phase
            Logger.info('[SystemCoordinator] Starting collaboration phase...');
            
            // Reset counter here, right before the collaboration phase starts
            this.qualityGate.resetRoundCounter();
            
            while (true) {
                // Increment the counter at the START of each collaboration round
                this.qualityGate.incrementRound();
                
                // Not necessary right now but just keeping as a reminder of how to use the current notification system
                // // Simple round notification through the existing response system
                // if (this.notifyResponse) {
                //     this.notifyResponse({
                //         agentId: 'system',
                //         content: `Starting collaboration round ${this.qualityGate.currentRound}`,
                //         type: 'round-update'  // Add this to differentiate from regular responses
                //     });
                // }
                
                // Quality check now uses the correct round number
                const qualityCheck = await this.qualityGate.validateCollaborationContinuation(
                    conversation,
                    agentResponses
                );

                if (!qualityCheck.shouldContinue) {
                    Logger.info(`[SystemCoordinator] Ending collaboration: ${qualityCheck.reason}`);
                    break;
                }

                // Log the round number to the console
                Logger.info(`[SystemCoordinator] Collaboration round (after shouldContinue) ${this.qualityGate.currentRound} is continuing`);
                
                // Show the thinking indicator for the director
                // Taking this out for now because it seems like there's a race condition with the same function on 231
                // if (this.onAgentThinking) {
                //     this.onAgentThinking('director-1', 'planning');
                // }

                // Get next collaboration plan from director
                const collaborationPlan = await director.planNextAgentInteraction(
                    conversation.messages,
                    agentResponses
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
                const lastResponse = agentResponses[agentResponses.length - 1];
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
                    this.conversationManager.logMessage(conversationId, {
                        agentId: nextAgent.id,
                        content: collaborativeResponse.content,
                        timestamp: Date.now()
                    });
                    
                    // Add to responses collection
                    agentResponses.push(collaborativeResponse);
                } catch (error) {
                    Logger.error('[SystemCoordinator] Error in collaboration round:', error);
                    break;
                }
            }

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
            Logger.error('[SystemCoordinator] Error orchestrating discussion:', error);
            throw error;
        }
    }
}