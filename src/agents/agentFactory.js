import { Analyst } from './types/analyst.js';
import { Critic } from './types/critic.js';
import { Director } from './types/director.js';
import { Expert } from './types/expert.js';
import { Logger } from '../utils/logger.js';

export class AgentFactory {
    static createAgent(config, llmService) {
        Logger.debug('Creating agent with config:', config);
        
        const agentTypes = {
            'Analyst': Analyst,
            'Critic': Critic,
            'Director': Director,
            'Expert': Expert
        };

        const AgentClass = agentTypes[config.type];
        if (!AgentClass) {
            Logger.error(`Unknown agent type: ${config.type}`);
            throw new Error(`Unknown agent type: ${config.type}`);
        }

        return new AgentClass(config, llmService);
    }
} 