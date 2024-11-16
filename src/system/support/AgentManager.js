import { AgentFactory } from '../../agents/agentFactory.js';
import { Logger } from '../../utils/logger.js';

export class AgentManager {
    constructor(llmService) {
        this.agents = new Map();
        this.llmService = llmService;
        this.agentPrefixes = {
            'director-1': /^(?:Director:?\s*)/i,
            'analyst-1': /^(?:Analyst:?\s*)/i,
            'critic-1': /^(?:Critic:?\s*)/i,
            'expert-1': /^(?:Expert:?\s*)/i,
            'system': /^(?:System:?\s*)/i
        };
    }

    async initializeAgents(agentConfigs) {
        try {
            for (const [type, config] of Object.entries(agentConfigs)) {
                const agent = this.initializeAgent(config);
                this.agents.set(agent.id, agent);
                Logger.info(`Initialized ${type} agent: ${agent.id}`);
            }
        } catch (error) {
            Logger.error('Error initializing agents:', error);
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
        Logger.debug('[AgentManager] Getting available agents', { excludingId: excludeId });
        const agents = Array.from(this.agents.values())
            .filter(agent => !excludeId || agent.id !== excludeId);

        if (agents.length === 0) {
            Logger.error('[AgentManager] No available agents found');
            throw new Error('No available agents found for discussion');
        }
        return agents;
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
        Logger.debug('[AgentManager] Getting director agent');
        const director = this.getAgent('director-1');
        if (!director) {
            Logger.error('[AgentManager] Director agent not found');
            throw new Error('Director agent not found');
        }
        return director;
    }

    async generateAgentResponse(agentId, conversation, task) {
        const agent = this.getAgent(agentId);
        if (!agent) {
            throw new Error(`Agent not found: ${agentId}`);
        }

        Logger.debug('[AgentManager] Generating response for agent', { 
            agentId: agent.id,
            task: task 
        });

        return await agent.generateResponse(
            conversation.messages,
            task
        );
    }

    formatAgentResponse(response, agentId, role) {
        return {
            agentId: agentId,
            role: role,
            content: this._cleanResponse(response, agentId),
            timestamp: Date.now()
        };
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