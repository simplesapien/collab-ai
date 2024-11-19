import { log } from '../../utils/winstonLogger.js';
import { PlanningPhase } from './phases/planning.js';

export class Coordinator {
    constructor(conversationManager, agentManager, qualityGate, notifyManager) {
        const eventId = log.event.emit('init', 'Coordinator');
        try {
            this.conversationManager = conversationManager;
            this.agentManager = agentManager;
            this.qualityGate = qualityGate;
            this.notifyManager = notifyManager;
            this.isProcessing = false;
            this.isCancelled = false;
            this.planningPhase = new PlanningPhase(this);
            
            log.state.change('Coordinator', 'uninitialized', 'ready');
            log.event.complete(eventId);
        } catch (error) {
            log.error('Coordinator initialization failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    async coordinateDiscussion(conversationId, message) {
        const eventId = log.event.emit('coordinateDiscussion', 'Coordinator', {
            conversationId,
            messageLength: message?.content?.length
        });
        const startTime = Date.now();

        this.isProcessing = true;
        this.isCancelled = false;

        try {
            log.debug('Starting coordination', { 
                conversationId,
                messagePreview: message?.content?.substring(0, 50)
            });
            
            const conversation = await this._initializeConversation(conversationId, message);
            const director = await this._getDirector();
            const availableAgents = this._getAvailableAgents(director.id);
            
            log.debug('Initial setup complete', {
                conversationId,
                directorId: director.id,
                availableAgentCount: availableAgents.length
            });

            // Phase 1: Planning
            if (this.isCancelled) {
                log.debug('Process cancelled during planning phase');
                return;
            }
            const plan = await this.planningPhase.execute(director, message, availableAgents);
            
            // Phase 2: Initial Responses
            if (this.isCancelled) {
                log.debug('Process cancelled during initial responses phase');
                return;
            }
            const agentResponses = await this._executeInitialResponses(conversation, plan);
            
            // Phase 3: Collaboration
            if (this.isCancelled) {
                log.debug('Process cancelled during collaboration phase');
                return;
            }
            const collaborationResults = await this._executeCollaborationPhase(
                conversation, 
                director, 
                agentResponses
            );

            // Phase 4: Final Summary
            if (this.isCancelled) {
                log.debug('Process cancelled during final summary phase');
                return;
            }
            
            this.notifyManager.notifyThinking('director-1', 'synthesizing');
            const finalSummary = await director.synthesizeDiscussion(conversation.messages);

            log.perf.measure('discussion-coordination', Date.now() - startTime, {
                phases: 4,
                responseCount: agentResponses.length,
                summaryLength: finalSummary?.length
            });

            if (this.notifyManager.notifyResponse) {
                const summaryResponse = {
                    agentId: 'director-1',
                    role: 'Summary',
                    content: finalSummary,
                    timestamp: Date.now()
                };
                this.notifyManager.notifyResponse(summaryResponse);
            }

            log.event.complete(eventId, 'completed', {
                planParticipants: plan.participants.length,
                responseCount: agentResponses.length,
                summaryGenerated: !!finalSummary
            });

            return {
                plan: plan.participants,
                responses: agentResponses,
                summary: finalSummary
            };

        } catch (error) {
            log.error('Discussion coordination failed', error);
            
            if (this.isCancelled) {
                log.event.complete(eventId, 'cancelled');
                return {
                    responses: [],
                    summary: null,
                    cancelled: true
                };
            }
            
            log.event.complete(eventId, 'failed');
            throw error;
        } finally {
            this.isProcessing = false;
            this.isCancelled = false;
        }
    }

    async _initializeConversation(conversationId, message) {
        const eventId = log.event.emit('initializeConversation', 'Coordinator', {
            conversationId
        });
        const startTime = Date.now();

        try {
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

            log.perf.measure('conversation-initialization', Date.now() - startTime, {
                conversationId,
                isNew: !this.conversationManager.getConversation(conversationId)
            });

            log.event.complete(eventId);
            return conversation;
        } catch (error) {
            log.error('Conversation initialization failed', error);
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }

    // Phase 1: Planning - execute the planning 
    async _executeInitialPlanning(director, message, availableAgents) {
        log.debug(`[Coordinator] Executing initial planning`, { messageContent: message.content });
        this.notifyManager.notifyThinking('director-1', 'planning');
        const plan = await director.planInitialAgentTasks(message.content, availableAgents);
        await this._emitDirectorPlan(plan, this.conversationManager.getCurrentConversationId());
        return plan;
    }

    // Phase 1: Planning - emit the plan to the UI
    async _emitDirectorPlan(plan, conversationId) {
        log.debug(`[Coordinator] Emitting director plan`, { participantCount: plan.participants.length });
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
        log.debug(`[Coordinator] Executing initial responses for ${conversation.id}`);
        const responses = [];
        
        for (const participant of plan.participants) {
            if (this.isCancelled) {
                log.debug('[Coordinator] Cancelling remaining initial responses');
                // Don't throw an error, just return collected responses
                return responses;
            }

            log.debug('[Coordinator] Processing participant response', { participant });
            
            const agent = this.agentManager.getAgent(participant.id);
            if (!agent) {
                log.warn('[Coordinator] Agent not found for participant', { agentId: participant.id });
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
                log.error(`[Coordinator] Error generating response for agent ${agent.id}:`, error);
            }
        }

        return responses;
    }

    // Phase 3: Collaboration - execute the collaboration
    async _executeCollaborationPhase(conversation, director, initialResponses) {
        log.info('[Coordinator] Starting collaboration phase...');
        
        this.qualityGate.resetRoundCounter();
        
        while (true) {
            if (this.isCancelled) {
                log.debug('[Coordinator] Cancelling collaboration phase');
                break;
            }

            const currentRound = this.qualityGate.incrementRound();
            
            const qualityCheck = await this.qualityGate.performQualityCheck(
                conversation,
                initialResponses
            );

            log.debug('[Coordinator] Quality check result:', {
                shouldContinue: qualityCheck.shouldContinue,
                reason: qualityCheck.reason,
                round: currentRound
            });

            if (!qualityCheck.shouldContinue) {
                log.info(`[Coordinator] Ending collaboration: ${qualityCheck.reason}`);
                break;
            }

            const collaborationPlan = await director.planNextAgentInteraction(
                conversation.messages,
                initialResponses
            );

            if (!this._isValidCollaborationPlan(collaborationPlan)) {
                log.debug('[Coordinator] Invalid collaboration plan - ending phase');
                break;
            }

            const nextAgentId = `${collaborationPlan.nextAgent.toLowerCase()}-1`;
            const nextAgent = this.agentManager.getAgent(nextAgentId);
            
            if (!nextAgent) {
                log.error('[Coordinator] Next agent not found:', nextAgentId);
                break;
            }

            if (this.agentManager.isConsecutiveResponse(initialResponses, nextAgentId)) {
                log.debug('[Coordinator] Preventing consecutive responses from same agent');
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
                log.error('[Coordinator] Error in collaboration round:', error);
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
            log.debug('[Coordinator] Cancelling current process');
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