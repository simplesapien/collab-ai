import { AgentFactory } from '../../agents/agentFactory.js';
import { log } from '../../utils/logger.js';

export class AgentManager {
    constructor(llmService) {
        try {
            this.agents = new Map();
            this.llmService = llmService;
            this.agentPrefixes = {
                'director-1': /^(?:Director:?\s*)/i,
                'analyst-1': /^(?:Analyst:?\s*)/i,
                'critic-1': /^(?:Critic:?\s*)/i,
                'expert-1': /^(?:Expert:?\s*)/i,
                'system': /^(?:System:?\s*)/i
            };
        } catch (error) {
            log.error('Agent manager initialization failed', error);
            throw error;
        }
    }

    async initializeAgents(agentConfigs) {
        try {
            log.debug('Starting agent initialization', {
                agentTypes: Object.keys(agentConfigs)
            });

            for (const [type, config] of Object.entries(agentConfigs)) {
                const agent = this.initializeAgent(config);
                this.agents.set(agent.id, agent);
                log.debug('Agent initialized', { 
                    type, 
                    agentId: agent.id 
                });
            }
        } catch (error) {
            log.error('Agents initialization failed', error);
            throw error;
        }
    }

    initializeAgent(agentConfig) {
        return AgentFactory.createAgent(agentConfig, this.llmService);
    }

    getAgent(agentId) {
        return this.agents.get(agentId);
    }

    getAvailableAgents(excludeId = null) {
 
        try {
            log.debug('Getting available agents', { 
                excludingId: excludeId,
                totalAgents: this.agents.size
            });

            const agents = Array.from(this.agents.values())
                .filter(agent => !excludeId || agent.id !== excludeId);

            if (agents.length === 0) {
                log.error('No available agents found', {
                    totalAgents: this.agents.size,
                    excludeId
                });
                throw new Error('No available agents found for discussion');
            }
            return agents;
        } catch (error) {
            log.error('Failed to get available agents', error);
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
        return Array.from(this.agents.values())
            .map(agent => this.getAgentStatus(agent.id));
    }

    // Added to maintain compatibility with existing code
    getAgentsMap() {
        return this.agents;
    }

    async getDirector() {
        log.debug('[AgentManager] Getting director agent');
        const director = this.getAgent('director-1');
        if (!director) {
            log.error('[AgentManager] Director agent not found');
            throw new Error('Director agent not found');
        }
        return director;
    }

    async generateAgentResponse(agentId, conversation, task) {
        try {
            const agent = this.getAgent(agentId);
            if (!agent) {
                throw new Error(`Agent not found: ${agentId}`);
            }

            log.debug('Generating agent response', { 
                agentId: agent.id,
                task,
                messageCount: conversation.messages.length
            });

            const response = await agent.generateResponse(
                conversation.messages,
                task
            );
            return response;
        } catch (error) {
            log.error('Agent response generation failed', error);
            throw error;
        }
    }

    formatAgentResponse(response, agentId, role) {
        try {
            const formattedResponse = {
                agentId: agentId,
                role: role,
                content: this._cleanResponse(response, agentId),
                timestamp: Date.now()
            };
            log.debug('Formatted agent response (AgentManager)', { formattedResponse });
            return formattedResponse;
        } catch (error) {
            log.error('Response formatting failed', error);
            throw error;
        }
    }

    _cleanResponse(response, agentId) {
        const prefix = this.agentPrefixes[agentId.toLowerCase()];
        return prefix ? response.replace(prefix, '').trim() : response.trim();
    }

    isConsecutiveResponse(responses, agentId) {
        const lastResponse = responses[responses.length - 1];
        return lastResponse && lastResponse.agentId === agentId;
    }
} 