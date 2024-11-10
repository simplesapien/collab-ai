// src/agents/baseAgent.js
import { Logger } from '../utils/logger.js';

export class BaseAgent {
    constructor(config, llmService) {
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
        try {
            const validatedContext = this.validateContext(context);
            console.log(`${this.role} generating response with context:`, validatedContext);
            
            this.updateState(validatedContext, prompt);
            
            const systemPrompt = this.constructSystemPrompt();
            console.log(`Generating response for ${this.role} using LLM service with role:`, this.role);
            
            const response = await this.llm.makeModelRequest({
                systemPrompt: systemPrompt,
                userPrompt: prompt,
                context: validatedContext,
                agentType: this.role
            });
            
            this.updateMemory(prompt, response);
            return response;
        } catch (error) {
            Logger.error(`Error generating response for agent ${this.id}:`, error);
            throw error;
        }
    }

    constructSystemPrompt() {
        return `You are ${this.name}, ${this.role}. ${this.personality}
        Your expertise includes: ${this.knowledgeBase.join(', ')}.
        
        Previous context: ${this.getRelevantHistory()}
        
        Respond in character, considering your unique perspective and expertise.
        Keep responses focused and under 3 sentences.`;
    }

    async respondToAgent(previousResponse, task) {
        try {
            const systemPrompt = `You are ${this.name}, ${this.role}. ${this.personality}
            
            Review this response from ${previousResponse.role}:
            "${previousResponse.response}"
            
            Your task: ${task}
            
            Build upon or respectfully challenge their points while adding your unique expertise 
            from: ${this.knowledgeBase.join(', ')}.
            
            Keep your response focused and under 3 sentences.
            Previous context: ${this.getRelevantHistory()}`;
    
            console.log(`Generating agent response for ${this.role} using LLM service`);
            
            const response = await this.llm.makeModelRequest({
                systemPrompt: systemPrompt,
                userPrompt: previousResponse.response,
                context: [],
                agentType: this.role
            });
            
            this.updateMemory(previousResponse.response, response);
            return response;
        } catch (error) {
            Logger.error(`Error generating response for agent ${this.id}:`, error);
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

    updateMemory(prompt, response) {
        const key = Date.now();
        this.memory.set(key, { prompt, response });
        
        // Cleanup old memories
        const keys = Array.from(this.memory.keys()).sort();
        while (keys.length > 50) {
            this.memory.delete(keys.shift());
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
        console.log('Validating context:', context);
        
        // If undefined or null, return empty array
        if (!context) {
            console.log('Context was null/undefined, using empty array');
            return [];
        }
        
        // If already an array, return as is
        if (Array.isArray(context)) {
            console.log('Context is already an array');
            return context;
        }
        
        // If single message, wrap in array
        console.log('Converting single message to array');
        return [context];
    }
}