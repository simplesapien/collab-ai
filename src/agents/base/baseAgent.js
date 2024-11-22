// src/agents/base/baseAgent.js
import { IAgent } from '../interfaces/agent.js';
import { log } from '../../utils/logger.js';

export class BaseAgent extends IAgent {
    constructor(config, llmService) {
        super();
        this.id = config.id;
        this.name = config.name;
        this.role = config.role || config.type;
        this.personality = config.personality;
        this.knowledgeBase = config.knowledgeBase;
        this.llm = llmService;
        this.memory = new Map();
        this.state = {
            lastInteraction: null,
            conversationHistory: [],
            currentTask: null,
            active: true
        };
    }

    async generateResponse(context, prompt) {
        const startTime = Date.now();

        try {
            const validatedContext = this.validateContext(context);
            this.updateState(validatedContext, prompt);
            const systemPrompt = this.constructSystemPrompt();
            
            const response = await this.llm.makeModelRequest({
                systemPrompt: systemPrompt,
                userPrompt: prompt,
                context: validatedContext,
                agentType: this.role
            });
            
            this.updateMemory(prompt, response);

            log.perf.measure('responseGeneration', Date.now() - startTime, {
                agentId: this.id,
                contextSize: context?.length
            });

            return response;

        } catch (error) {
            log.error(`${this.role} response generation failed`, error);
            throw error;
        }
    }

    constructSystemPrompt() {
        return `You are ${this.role}. ${this.personality}
        Your expertise includes: ${this.knowledgeBase.join(', ')}.
        
        Previous context: ${this.getRelevantHistory()}
        
        Core Guidelines:
        - Respond in 2 sharp, specific sentence
        - Build directly on the previous message's key point
        - Focus on immediate, practical next steps
        - Don't over abstract concepts. Focus on concrete, actionable guidance
        - Stay strictly within your role's expertise
        - Do not prefix your response with your role name`;
    }

    async respondToAgent(previousResponse, task) {
        try {

            // Track interaction in state
            this.state.currentTask = `responding_to_${previousResponse.role}`;
            
            const systemPrompt = `You are ${this.name}, ${this.role}. ${this.personality}
            
            You are DIRECTLY responding to this message from ${previousResponse.role}:
            "${previousResponse.response}"
            
            Your task: ${task}
            
            Important Guidelines:
            - Explicitly reference and build upon the points made by ${previousResponse.role}
            - Apply your unique expertise: ${this.knowledgeBase.join(', ')}
            - Keep your response focused and in 2 sentences or less
            - Do not prefix your response with your role name
            
            Previous context: ${this.getRelevantHistory()}`;

            const response = await this.llm.makeModelRequest({
                systemPrompt: systemPrompt,
                userPrompt: previousResponse.response,
                context: [],
                agentType: this.role
            });
            
            // Track the interaction in memory
            this.updateMemory(previousResponse.response, response, previousResponse.role);
            return response;
        } catch (error) {
            throw error;
        }
    }

    updateState(context, prompt) {
        this.state.lastInteraction = new Date();
        this.state.conversationHistory.push({ 
            timestamp: Date.now(),
            context,
            prompt 
        });
        
        // Keep history manageable
        if (this.state.conversationHistory.length > 50) {
            this.state.conversationHistory.shift();
        }
    }

    getRelevantHistory(limit = 5) {
        return this.state.conversationHistory
            .slice(-limit)
            .map(h => `${h.prompt} -> ${h.response || 'awaiting response'}`)
            .join('\n');
    }

    updateMemory(prompt, response, respondingTo = null) {
        try {
            const key = Date.now();
            this.memory.set(key, { 
                prompt, 
                response,
                respondingTo,
                timestamp: key 
            });
            
            // Cleanup old memories
            const keys = Array.from(this.memory.keys()).sort();
            while (keys.length > 50) {
                this.memory.delete(keys.shift());
            }
        } catch (error) {
            log.error(`${this.role} memory update failed`, error);
        }
    }

    getMemory() {
        return Array.from(this.memory.values());
    }

    clearMemory() {
        this.memory.clear();
        this.state.conversationHistory = [];
    }

    getModel() {
        return this.llm.config.modelsByAgent?.[this.role.toLowerCase()] || 
               this.llm.config.defaultModel;
    }

    validateContext(context) {
       try {
            if (!context) {
                return [];
            }
            
            if (Array.isArray(context)) {
                return context;
            }
            
            return [context];
        } catch (error) {
            log.error(`${this.role} context validation failed`, error);
            throw error;
        }
    }
}