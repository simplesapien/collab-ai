import { Director } from './director.js';
import { Analyst } from './analyst.js';
import { Critic } from './critic.js';
import { Expert } from './expert.js';
import { Logger } from '../utils/logger.js';

export class AgentFactory {
    // Map of agent types to their classes
    static agentTypes = {
        Director,
        Analyst,
        Critic,
        Expert
    };

    static createAgent(agentConfig, llmService) {
        try {
            // Get the appropriate agent class
            const AgentClass = this.agentTypes[agentConfig.type];
            
            if (!AgentClass) {
                Logger.error(`Unknown agent type: ${agentConfig.type}`);
                throw new Error(`Unknown agent type: ${agentConfig.type}`);
            }

            // Create new agent instance using the BaseAgent constructor through inheritance
            return new AgentClass(agentConfig, llmService);

        } catch (error) {
            Logger.error(`Failed to create agent of type ${agentConfig.type}:`, error);
            throw error;
        }
    }

    static registerAgentType(type, AgentClass) {
        if (this.agentTypes[type]) {
            Logger.warn(`Overwriting existing agent type: ${type}`);
        }
        this.agentTypes[type] = AgentClass;
    }
} 