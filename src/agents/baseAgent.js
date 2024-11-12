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
            Logger.debug(`${this.role} generating response with context:`, validatedContext);
            
            this.updateState(validatedContext, prompt);
            
            const systemPrompt = this.constructSystemPrompt();
            Logger.debug(`Generating response for ${this.role} using LLM service with role:`, this.role);
            
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
            Logger.debug(`[${this.role}] Starting response to ${previousResponse.role}`, {
                respondingTo: previousResponse.agentId,
                task: task,
                previousResponse: previousResponse.response
            });

            // Track interaction in state
            this.state.currentTask = `responding_to_${previousResponse.role}`;
            
            const systemPrompt = `You are ${this.name}, ${this.role}. ${this.personality}
            
            You are DIRECTLY responding to this message from ${previousResponse.role}:
            "${previousResponse.response}"
            
            Your task: ${task}
            
            Important Guidelines:
            - Explicitly reference and build upon the points made by ${previousResponse.role}
            - Apply your unique expertise: ${this.knowledgeBase.join(', ')}
            - Start your response with "Responding to ${previousResponse.role}'s point about..."
            - Keep your response focused and under 3 sentences
            
            Previous context: ${this.getRelevantHistory()}`;

            Logger.debug(`[${this.role}] Constructed system prompt for agent response`, {
                systemPrompt: systemPrompt
            });
            
            const response = await this.llm.makeModelRequest({
                systemPrompt: systemPrompt,
                userPrompt: previousResponse.response,
                context: [],
                agentType: this.role
            });
            
            // Track the interaction in memory
            this.updateMemory(previousResponse.response, response, previousResponse.role);
            
            Logger.debug(`[${this.role}] Generated response to ${previousResponse.role}`, {
                originalMessage: previousResponse.response,
                generatedResponse: response
            });

            return response;
        } catch (error) {
            Logger.error(`[${this.role}] Error responding to ${previousResponse.role}:`, error);
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
        Logger.debug('Validating context:', context);
        
        if (!context) {
            Logger.debug('Context was null/undefined, using empty array');
            return [];
        }
        
        if (Array.isArray(context)) {
            Logger.debug('Context is already an array');
            return context;
        }
        
        Logger.debug('Converting single message to array');
        return [context];
    }
}