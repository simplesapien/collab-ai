// src/agents/analyst.js
import { BaseAgent } from './baseAgent.js';
import { Logger } from '../utils/logger.js';

export class Analyst extends BaseAgent {
    constructor(config, llmService) {
        super({ ...config, role: 'Analyst' }, llmService);
        this.analyses = new Map();
    }

    async analyzeInformation(message, context = []) {
        try {
            Logger.debug(`${this.role} analyzing message:`, message);
            Logger.debug('Incoming context:', context);
            
            const validatedContext = this.validateContext(context);
            Logger.debug('Validated context:', validatedContext);

            Logger.debug('Raw incoming message:', message);
            const userPrompt = typeof message === 'object' 
                ? (message.content || message.text || JSON.stringify(message))
                : message;
            Logger.debug('Processed user prompt:', userPrompt);

            const systemPrompt = `You are ${this.name}, ${this.role}. ${this.personality}
            
            Analyze this message using your expertise in: ${this.knowledgeBase.join(', ')}
            
            Focus on:
            1. Key implications and potential impacts
            2. Data-driven insights
            3. Actionable recommendations
            
            Keep your response focused and under 2 sentences.
            Do not prefix your response with your role name.`;

            const response = await this.llm.makeModelRequest({
                systemPrompt: systemPrompt,
                userPrompt: userPrompt,
                context: validatedContext,
                agentType: this.role
            });
            
            this.storeAnalysis(userPrompt, response);
            return response;
        } catch (error) {
            Logger.error('Error in Analyst.analyzeInformation:', error);
            throw error;
        }
    }

    async provideSummaryStatistics(context) {
        try {
            console.log(`${this.role} providing summary statistics`);
            console.log('Incoming context:', context);
            
            const validatedContext = this.validateContext(context);
            console.log('Validated context:', validatedContext);

            const systemPrompt = `Provide key statistical insights from the discussion.
            Focus on quantifiable elements and data-driven observations.`;
            
            const response = await this.llm.makeModelRequest({
                systemPrompt: systemPrompt,
                userPrompt: "Summarize the key statistical insights from the discussion.",
                context: validatedContext,
                agentType: this.role
            });

            return response;
        } catch (error) {
            Logger.error('Error in Analyst.provideSummaryStatistics:', error);
            throw error;
        }
    }

    storeAnalysis(prompt, response) {
        const key = Date.now();
        this.analyses.set(key, {
            prompt,
            response,
            timestamp: key
        });

        // Keep only recent analyses
        const keys = Array.from(this.analyses.keys()).sort();
        while (keys.length > 20) {
            this.analyses.delete(keys.shift());
        }
    }

    getRecentAnalyses(limit = 3) {
        return Array.from(this.analyses.values())
            .slice(-limit)
            .map(a => `Analysis: ${a.response}`)
            .join('\n');
    }
}