// src/system/systemCoordinator.js
import { ConversationManager } from '../conversation/conversationManager.js';
import { LLMService } from '../services/llm.js';
import { Logger } from '../utils/logger.js';
import { config } from '../config/config.js';
import { AgentFactory } from '../agents/agentFactory.js';

export class SystemCoordinator {
    constructor() {
        this.conversationManager = new ConversationManager(config.conversation);
        this.llmService = new LLMService(config.llm);
        // Map to store all active agents
        this.agents = new Map();
        // Track active conversations
        this.activeConversations = new Set();
        this.notifyResponse = null;
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
            const plan = await director.orchestrateDiscussion(message.content, availableAgents);
            Logger.debug('[SystemCoordinator] Received initial plan from director:', plan);

            // Add emission for director's plan
            for (const participant of plan.participants) {
                const directorResponse = {
                    agentId: 'director-1',
                    content: `Director assigns ${participant.role}: ${participant.task}`,
                    timestamp: Date.now()
                };
                // Emit through the app's notification system
                if (this.notifyResponse) {
                    this.notifyResponse(directorResponse);
                }
            }

            // Phase 2: Execute the initial discussion plan
            const agentResponses = [];
            
            // Validate plan structure
            if (!plan || !plan.participants || !Array.isArray(plan.participants)) {
                throw new Error('Invalid discussion plan received from Director');
            }

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

                Logger.debug(`[SystemCoordinator] Found agent:`, {
                    id: agent.id,
                    role: agent.role
                });

                try {
                    // Generate initial response based on agent type
                    let response;
                    switch (agent.constructor.name) {
                        case 'Analyst':
                            response = await agent.analyzeInformation([message], participant.task);
                            break;
                        case 'Critic':
                            response = await agent.evaluateProposal([message], participant.task);
                            break;
                        case 'Expert':
                            response = await agent.provideExpertise([message], participant.task);
                            break;
                        default:
                            response = await agent.generateResponse([message], participant.task);
                    }

                    Logger.debug(`[SystemCoordinator] Initial response from ${participant.role}:`, response);

                    // Add emission for agent response
                    const agentResponse = {
                        agentId: participant.id,
                        role: participant.role,
                        task: participant.task,
                        response: response,
                        timestamp: Date.now()
                    };

                    // Emit through the app's notification system
                    if (this.notifyResponse) {
                        this.notifyResponse({
                            agentId: participant.id,
                            content: `${participant.role}: ${response}`,
                            timestamp: Date.now()
                        });
                    }

                    // Add response to the collection
                    agentResponses.push(agentResponse);

                    // Log the message to conversation
                    this.conversationManager.logMessage(conversationId, {
                        agentId: participant.id,
                        content: `${participant.role}: ${response}`,
                        timestamp: Date.now()
                    });

                } catch (error) {
                    Logger.error(`[SystemCoordinator] Error processing participant ${participant.id}:`, error);
                }
            }

            // Phase 3: Collaborative Discussion Phase
            try {
                let iterationCount = 0;
                const maxIterations = 3;  // Adjustable based on needs

                while (iterationCount < maxIterations) {
                    // Get next interaction plan from director
                    const collaborationPlan = await director.facilitateCollaboration(
                        conversation.messages,
                        agentResponses
                    );

                    if (!collaborationPlan || !collaborationPlan.nextAgent) {
                        Logger.info('[SystemCoordinator] No further collaboration needed');
                        break;
                    }

                    // Find the agent and the response they should build upon
                    const nextAgent = Array.from(this.agents.values())
                        .find(agent => agent.role === collaborationPlan.nextAgent);
                        
                    const previousResponse = agentResponses.find(
                        r => r.role === collaborationPlan.respondTo[0]
                    );

                    if (!nextAgent || !previousResponse) {
                        Logger.error('[SystemCoordinator] Could not find required agent or response');
                        break;
                    }

                    // Generate collaborative response
                    const response = await nextAgent.respondToAgent(
                        previousResponse,
                        collaborationPlan.task
                    );

                    // Format and log the collaborative response
                    const collaborativeResponse = {
                        agentId: nextAgent.id,
                        role: nextAgent.role,
                        task: collaborationPlan.task,
                        response: response,
                        timestamp: Date.now(),
                        inResponseTo: previousResponse.agentId
                    };

                    agentResponses.push(collaborativeResponse);

                    // Log to conversation manager
                    this.conversationManager.logMessage(conversationId, {
                        agentId: nextAgent.id,
                        content: `${nextAgent.role} (responding to ${previousResponse.role}): ${response}`,
                        timestamp: Date.now()
                    });

                    iterationCount++;
                }

            } catch (error) {
                Logger.error('[SystemCoordinator] Error in collaboration phase:', error);
                // Continue with the responses we have so far
            }

            Logger.info('[SystemCoordinator] Discussion execution completed. Total responses:', agentResponses.length);
            
            // Generate summary once and store it
            const finalSummary = await director.synthesizeDiscussion(conversation.messages);
            Logger.debug('[SystemCoordinator] Final agent summary:', finalSummary);
            
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

    async getConversationSummary(conversationId) {
        const conversation = this.conversationManager.getConversation(conversationId);
        if (!conversation) return null;

        const director = this.agents.get('director-1');
        return await director.synthesizeDiscussion(conversation.messages);
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
}