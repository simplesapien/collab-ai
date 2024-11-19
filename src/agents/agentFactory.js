import { Analyst } from './types/analyst.js';
import { Critic } from './types/critic.js';
import { Director } from './types/director.js';
import { Expert } from './types/expert.js';
import { log } from '../utils/winstonLogger.js';

export class AgentFactory {
    static createAgent(config, llmService) {
        const eventId = log.event.emit('createAgent', 'AgentFactory', { agentType: config.type });
        
        const startTime = Date.now();

        try {
            log.state.change('AgentFactory', 'idle', 'creating', { agentType: config.type });

            const agentTypes = {
                'Analyst': Analyst,
                'Critic': Critic,
                'Director': Director,
                'Expert': Expert
            };

            const AgentClass = agentTypes[config.type];
            if (!AgentClass) {
                log.error(`Unknown agent type: ${config.type}`);
                log.event.complete(eventId, 'failed');
                throw new Error(`Unknown agent type: ${config.type}`);
            }

            const agent = new AgentClass(config, llmService);
            log.perf.measure('agentCreation', Date.now() - startTime, { agentType: config.type });

            log.state.change('AgentFactory', 'creating', 'completed', { agentId: agent.id });

            log.event.complete(eventId, 'completed', { agentId: agent.id });
            return agent;

        } catch (error) {
            log.error('Agent creation failed', error);
            log.state.change('AgentFactory', 'creating', 'failed');
            log.event.complete(eventId, 'failed');
            throw error;
        }
    }
} 