// src/system/systemCoordinator.js
import { ConversationManager } from '../conversation/conversationManager.js';
import { LLMService } from '../services/llm.js';
import { Logger } from '../utils/logger.js';
import { config } from '../config/config.js';
import { AgentFactory } from '../agents/agentFactory.js';
import { CollaborationQualityGate } from '../quality/CollaborationQualityGate.js';

export class SystemCoordinator {
    constructor() {
        this.conversationManager = new ConversationManager(config.conversation);
        this.llmService = new LLMService(config.llm);
        // Map to store all active agents
        this.agents = new Map();
        // Track active conversations
        this.activeConversations = new Set();
        this.notifyResponse = null;
        this.qualityGate = new CollaborationQualityGate(config.collaboration);
    }

    async initialize(agentConfigs, notifyCallback) {
        try {
            this.notifyResponse = notifyCallback;
            // Create and initialize each agent type
            for (const [type, config] of Object.entries(agentConfigs)) {
                const agent = this.initializeAgent(config);
                this.agents.set(agent.id, agent);
                Logger.info(`Initialized ${type} agent: ${agent.id}`);
            }
        } catch (error) {
            Logger.error('Error initializing SystemCoordinator:', error);
            throw error;
        }
    }

    initializeAgent(agentConfig) {
        return AgentFactory.createAgent(agentConfig, this.llmService);
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
            if (this.onAgentThinking) {
                this.onAgentThinking('director-1', 'thinking');
            }

            const plan = await director.orchestrateDiscussion(message.content, availableAgents);
            Logger.debug('[SystemCoordinator] Received initial plan from director:', plan);

            // Emit director's plan assignments in real-time
            for (const participant of plan.participants) {
                const directorResponse = {
                    agentId: 'director-1',
                    role: 'Director',
                    content: `Director assigns ${participant.role}: ${participant.task}`,
                    timestamp: Date.now()
                };
                
                // Emit through the app's notification system
                if (this.notifyResponse) {
                    this.notifyResponse(directorResponse);
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
                    if (this.onAgentThinking) {
                        this.onAgentThinking(participant.id);
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
                        content: `${participant.role}: ${cleanedResponse}`,
                        timestamp: Date.now()
                    };

                    // Only emit through the notification system
                    if (this.notifyResponse) {
                        this.notifyResponse(agentResponse);
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
            this.qualityGate.resetRoundCounter();
            
            while (true) {
                Logger.debug(`[SystemCoordinator] Starting collaboration round ${this.qualityGate.currentRound + 1}`);
                
                // Check quality gates before continuing
                const qualityCheck = await this.qualityGate.validateCollaborationContinuation(
                    conversation,
                    agentResponses
                );

                if (!qualityCheck.shouldContinue) {
                    Logger.info(`[SystemCoordinator] Ending collaboration: ${qualityCheck.reason}`);
                    break;
                }

                // Show the thinking indicator for the director
                // Taking this out for now because it seems like there's a race condition with the same function on 231
                // if (this.onAgentThinking) {
                //     this.onAgentThinking('director-1', 'planning');
                // }

                // Get next collaboration plan from director
                const collaborationPlan = await director.facilitateCollaboration(
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
                    if (this.onAgentThinking) {
                        this.onAgentThinking(nextAgentId);
                    }

                    const task = `Respond to ${collaborationPlan.respondTo.join(' and ')}'s points: ${collaborationPlan.task}`;
                    const response = await nextAgent.generateResponse(
                        conversation.messages,
                        task
                    );

                    const collaborativeResponse = {
                        agentId: nextAgent.id,
                        role: collaborationPlan.nextAgent,
                        content: `${collaborationPlan.nextAgent}: ${response}`,
                        response: response,
                        timestamp: Date.now()
                    };

                    // Only emit through notification system
                    if (this.notifyResponse) {
                        this.notifyResponse(collaborativeResponse);
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

                this.qualityGate.incrementRound();
            }

            // Phase 4: Final Summary (only after collaboration)
            // Show the thinking indicator for the director
            if (this.onAgentThinking) {
                this.onAgentThinking('director-1', 'synthesizing');
            }

            const finalSummary = await director.synthesizeDiscussion(conversation.messages);
            if (this.notifyResponse) {
                this.notifyResponse({
                    agentId: 'director-1',
                    role: 'Summary',
                    content: finalSummary,
                    timestamp: Date.now()
                });
            }

            // Reset is now handled by qualityGate
            this.qualityGate.resetRoundCounter();

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

    async handleMessage(conversationId, message) {
        try {
            Logger.debug(`Handling message for conversation ${conversationId}`, message);

            // Create or get conversation
            let conversation = this.conversationManager.getConversation(conversationId);
            if (!conversation) {
                conversation = this.conversationManager.createConversation({
                    id: conversationId,
                    messages: []
                });
                this.activeConversations.add(conversationId);
            }

            // Log the incoming message
            this.conversationManager.logMessage(conversationId, message);

            // Get target agent
            const agent = this.agents.get(message.targetAgentId);
            if (!agent) {
                throw new Error(`Agent not found: ${message.targetAgentId}`);
            }

            // Add this line before generating response
            if (this.onAgentThinking) {
                this.onAgentThinking(message.targetAgentId);
            }

            // Generate response
            const response = await agent.generateResponse(
                conversation.messages,
                message.content
            );

            // Log the response
            const agentResponse = {
                agentId: agent.id,
                content: response,
                timestamp: Date.now()
            };
            this.conversationManager.logMessage(conversationId, agentResponse);

            Logger.debug(`Generated response for conversation ${conversationId}`, agentResponse);
            return agentResponse;

        } catch (error) {
            Logger.error(`Error handling message for conversation ${conversationId}:`, error);
            throw error;
        }
    }

    getAgentStatus(agentId) {
        const agent = this.agents.get(agentId);
        if (!agent) return null;

        return {
            id: agent.id,
            name: agent.name,
            role: agent.role,
            status: agent.state.active ? 'active' : 'inactive',
            lastInteraction: agent.state.lastInteraction,
            currentTask: agent.state.currentTask
        };
    }

    getAllAgentStatuses() {
        return Array.from(this.agents.values()).map(agent => this.getAgentStatus(agent.id));
    }

    getLLMService() {
        return this.llmService;
    }

    onAgentThinking(agentId) {
        return agentId;
    }
}