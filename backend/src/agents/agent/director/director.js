// src/agents/director.js
import { BaseAgent } from '../../base/baseAgent.js';
import { log } from '../../../utils/logger.js';
import { config } from '../../../config/config.js';

export class Director extends BaseAgent {
    constructor(config, llmService) {
        super(config, llmService);
    }

    async planInitialAgentTasks(message, availableAgents, conversationId) {
        
        try {
            const userPrompt = typeof message === 'object' ? message.content : message;
            
            const parsedData = await this.parseAndAnalyze(userPrompt, conversationId);
            const problem = await this.understandProblem(parsedData);
            const tasks = await this.decomposeTask(problem, conversationId);
            
            // Create a mapping of agent roles to their IDs
            const agentMap = availableAgents.reduce((map, agent) => {
                map[agent.role.toLowerCase()] = agent.id;
                return map;
            }, {});
            
            // Assign tasks to agents based on their roles and capabilities
            const participants = tasks.map((task, index) => {
                const agentRole = availableAgents[index % availableAgents.length].role;
                const agentId = agentMap[agentRole.toLowerCase()] || availableAgents[index % availableAgents.length].id;
                return {
                    id: agentId,
                    role: agentRole,
                    task: task
                };
            });
            
            // Ensure participants array is not empty
            if (participants.length === 0) {
                participants.push({
                    id: availableAgents[0].id,
                    role: availableAgents[0].role,
                    task: 'Please analyze the user message and provide insights.'
                });
            }
            
            const plan = {
                participants: participants,
                analysis: parsedData
            };
                    
            return plan;
        } catch (error) {
         
            throw error;
        }
    }


    async parseAndAnalyze(message, conversationId) {
        const executionId = `director-pa-${Date.now()}`;
        const startTime = Date.now();
        
        try {
            
            // Get relevant insights for the current conversation
            const storedInsights = this.insightManager.getInsights(conversationId);
            
            const systemPrompt = `Extract key points, entities, sentiment, and insights from the following message:
            "${message}"
            
            ${storedInsights?.length ? `
            Consider this conversation context:
            ${storedInsights.map(insight => `- ${insight.content}`).join('\n')}
            ` : ''}

            Respond with a JSON object containing meaningful analysis. Include multiple key points, entities, and insights based on the actual content.
            {
                "keyPoints": [array of relevant key points found in the message],
                "entities": [array of relevant entities mentioned],
                "sentiment": "positive/negative/neutral",
                "potentialInsights": [array of meaningful insights derived from the analysis]
            }

            Focus on quality over quantity. Include only relevant items that add value to the analysis.`;

            const returnData = await this.llm.makeModelRequest({
                systemPrompt: systemPrompt,
                userPrompt: message,
                context: [],
                agentType: this.role
            });

            return returnData;
        } catch (error) {
            log.perf.measure('parseAndAnalyze', Date.now() - startTime, {
                executionId,
                function: 'parseAndAnalyze',
                error: error.message,
                status: 'failed'
            });
            throw error;
        }
    }

    async understandProblem(parsedData) {
        const executionId = `director-up-${Date.now()}`;
        const startTime = Date.now();
        
        try {
            const systemPrompt = `Identify the main problem or goal from the following parsed data:
            Key Points: ${parsedData.keyPoints.join(', ')}
            Entities: ${parsedData.entities.join(', ')}
            Sentiment: ${parsedData.sentiment}
            Respond with a concise problem statement.`;

            const response = await this.llm.makeModelRequest({
                systemPrompt: systemPrompt,
                userPrompt: '',
                context: [],
                agentType: this.role
            });

            const problem = response.trim();
            return problem;
        } catch (error) {
            log.perf.measure('understandProblem', Date.now() - startTime, {
                executionId,
                function: 'understandProblem',
                error: error.message,
                status: 'failed'
            });
            throw error;
        }
    }

    async decomposeTask(problem, conversationId) {
        try {
            const startTime = Date.now();

            // Get insights directly from the manager
            const storedInsights = this.insightManager.getInsights(conversationId);

            const systemPrompt = `Break down the following problem into smaller research and discussion-oriented goals.
            
            Problem: "${problem}"
            
            ${storedInsights?.length ? `
            Previous Discussion Context:
            ${storedInsights.map(insight => `- ${insight.content}`).join('\n')}
            
            Ensure tasks:
            1. Build upon existing insights
            2. Avoid redundant exploration
            3. Address any gaps in current understanding
            ` : ''}
            
            Focus ONLY on tasks that involve analysis, evaluation, or theoretical discussion - NO action items or external tasks.
            
            Examples of good tasks:
            - "Analyze the implications of X on Y"
            - "Evaluate the pros and cons of the proposed approach"
            - "Research and discuss potential solutions for X"
            - "Review and critique the assumptions behind X"
            
            Limit yourself to ${config.director.maxTasksAssigned} tasks.
            
            Respond in a strict JSON format like this:
            {
                "tasks": ["task1", "task2", "task3"]
            }`;

            const response = await this.llm.makeModelRequest({
                systemPrompt: systemPrompt,
                userPrompt: problem,
                context: [],
                agentType: this.role
            });

            let tasks;
            try {
                const decomposed = response;
                tasks = decomposed.tasks;
            } catch (e) {
                log.error('Error parsing LLM response', { error: e.message });
                throw new Error('Failed to parse LLM response as JSON.');
            }

            log.perf.measure('decomposeTask', Date.now() - startTime, { problem });
            return tasks;
        } catch (error) {
            log.error('Error in decomposeTask', error);
            throw error;
        }
    }

   
    async planNextAgentInteraction(messages, previousResponses) {
        const executionId = `director-pnai-${Date.now()}`;
        const startTime = Date.now();
        
        try {
            // Format previous responses for the prompt
            const formattedResponses = previousResponses.map(r => ({
                role: r.role || r.agentId.split('-')[0].charAt(0).toUpperCase() + r.agentId.split('-')[0].slice(1), // Properly capitalize role
                response: r.response || r.content
            }));

            // Get all roles except the last speaker
            const availableRoles = ['Analyst', 'Critic', 'Expert'].filter(role => 
                role !== formattedResponses[formattedResponses.length - 1]?.role
            );

            const systemPrompt = `You are a JSON-only response API. You must ONLY return a valid JSON object with no additional text.

            Current conversation state:
            - Last speaker: ${formattedResponses[formattedResponses.length - 1]?.role}
            - Available next speakers: ${availableRoles.join(', ')}
            - Last message: "${formattedResponses[formattedResponses.length - 1]?.response}"

            Response requirements:
            1. Must be valid JSON
            2. Must contain exactly these fields: nextAgent, respondTo, task
            3. No additional text or explanation allowed

            Example valid response:
            {
                "nextAgent": "${availableRoles[0]}",
                "respondTo": ["${formattedResponses[formattedResponses.length - 1]?.role}"],
                "task": "example task description"
            }`;

            const userPrompt = `Return a JSON object selecting the next agent from [${availableRoles.join(', ')}] and their task.`;

            const response = await this.llm.makeModelRequest({
                systemPrompt: systemPrompt,
                userPrompt: userPrompt,
                context: messages,
                agentType: this.role,
                forceJsonResponse: true  // Add this flag if your LLM service supports it
            });

            let plan;
            try {
                let jsonStr = response;
                
                // Handle various markdown code block formats
                if (typeof response === 'string') {
                    const codeBlockMatch = response.match(/```(?:json\n|\n)?(.+?)```/s);
                    if (codeBlockMatch) {
                        jsonStr = codeBlockMatch[1].trim();
                    }
                }
                
                plan = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
                                
                // Validate nextAgent
                const validRoles = ['Analyst', 'Critic', 'Expert'];
                if (!validRoles.includes(plan['nextAgent'])) {
                    log.error('Invalid agent role received from LLM', { nextAgent: plan['nextAgent'] });
                    return null;
                }

                // Validate respondTo
                if (!plan['respondTo'].every(role => formattedResponses.map(r => r.role).includes(role))) {
                    log.error('Invalid respondTo role received from LLM', { respondTo: plan['respondTo'] });
                    return null;
                }

                // Add additional validation before returning the plan
                if (plan['nextAgent'] && plan['respondTo']) {
                    const lastResponse = formattedResponses[formattedResponses.length - 1];
                    
                    // Compare the actual roles, ensuring case-insensitive comparison
                    if (plan['nextAgent'].toLowerCase() === lastResponse?.role?.toLowerCase()) {
                        log.error('(Warning) Invalid plan - agent would speak twice in a row');
                        return null;
                    }
                }

            } catch (e) {
                log.error('Error parsing plan', { error: e });
                return null;
            }
            
            return plan;
        } catch (error) {
            log.perf.measure('planNextAgentInteraction', Date.now() - startTime, {
                executionId,
                function: 'planNextAgentInteraction',
                error: error.message,
                status: 'failed'
            });
            return null;
        }
    }

    async synthesizeDiscussion(context) {
        const executionId = `director-sd-${Date.now()}`;
        const startTime = Date.now();
        
        try {
            // Ensure context is valid and has the expected structure
            const validatedContext = Array.isArray(context) ? context : [];
            
            // Filter out system messages and director assignments
            const relevantMessages = validatedContext.filter(message => {
                const isUserOrAgentMessage = message.agentId && message.content;
                const isNotDirectorAssignment = !message.content.startsWith('Director assigns');
                return isUserOrAgentMessage && isNotDirectorAssignment;
            });

            // Format messages for the LLM prompt
            const formattedMessages = relevantMessages.map(message => {
                // Extract the actual content if it follows the "Role: content" format
                const content = message.content.includes(':') 
                    ? message.content.split(':').slice(1).join(':').trim()
                    : message.content;

                return {
                    agentId: message.agentId,
                    content: content
                };
            });
            
            const systemPrompt = `Analyze this conversation and provide novel insights and strategic implications.
            Focus on:
            1. Hidden patterns or connections between different viewpoints
            2. Potential opportunities or risks not explicitly mentioned
            3. Critical insights that emerge from combining different perspectives
            4. Strategic implications or recommendations based on the collective discussion

            Conversation messages:
            ${formattedMessages.map(m => `- ${m.agentId}: ${m.content}`).join('\n')}

            Structure your response in this format:
            - Key Insight: [One sentence highlighting a non-obvious conclusion]
            - Strategic Implications: [2-3 sentences on what this means for decision-making]
            - Critical Considerations: [1-2 sentences on important factors or risks to consider]

            Be insightful and analytical. Avoid simply restating what was said.`;
            
            const response = await this.llm.makeModelRequest({
                systemPrompt: systemPrompt,
                userPrompt: "Synthesize the key insights and strategic implications from this discussion.",
                context: [],
                agentType: this.role
            });

            return response;
        } catch (error) {
            log.perf.measure('synthesizeDiscussion', Date.now() - startTime, {
                executionId,
                function: 'synthesizeDiscussion',
                error: error.message,
                status: 'failed'
            });
            throw error;
        }
    }

    // Keeping this just in case I want to switch to bulk insight extraction to save on costs. The current extraction is setup as 
    // a method in the insight manager. 

    // async extractInsights(conversationId, messages) {
    //     const executionId = `director-ei-${Date.now()}`;
    //     const startTime = Date.now();
        
    //     try {
    //         if (!this.insightManager) {
    //             log.debug('No insight manager available, skipping insight extraction');
    //             return;
    //         }

    //         log.debug('Extracting insights from conversation', {
    //             conversationId,
    //             messageCount: messages.length
    //         });

    //         const systemPrompt = `Analyze this conversation and summary to extract key insights that might be valuable for future conversations.
    //             For each insight, identify which specific message(s) contributed to forming it.
                
    //             Focus on:
    //             1. Recurring patterns or themes
    //             2. Important conclusions or decisions
    //             3. Novel ideas or approaches discussed
    //             4. Technical details or specifications mentioned
    //             5. Problem-solving strategies used

    //             Return a JSON array of insights, where each insight has:
    //             - content: The actual insight
    //             - type: One of [pattern, conclusion, idea, technical_detail, strategy]
    //             - confidence: A number between 0 and 1 indicating confidence in this insight
    //             - sourceMessageIndices: Array of indices pointing to the relevant messages that contributed to this insight

    //             Example:
    //             [
    //                 {
    //                     "content": "The system requires high availability and fault tolerance",
    //                     "type": "conclusion",
    //                     "confidence": 0.9,
    //                     "sourceMessageIndices": [0, 3]  // This insight was derived from messages at index 0 and 3
    //                 }
    //             ]`;

    //         const response = await this.llm.makeModelRequest({
    //             systemPrompt: systemPrompt,
    //             userPrompt: "Extract key insights from this conversation.",
    //             context: messages,
    //             agentType: this.role,
    //             forceJsonResponse: true
    //         });

    //         const insights = Array.isArray(response) ? response : [response];
            
    //         // Store each insight
    //         for (const insight of insights) {
    //             await this.insightManager.addInsight(
    //                 conversationId,
    //                 {
    //                     content: insight.content,
    //                     type: insight.type,
    //                     confidence: insight.confidence
    //                 },
    //                 'director-summary'
    //             );

    //             // Get the source messages that contributed to this insight
    //             const sourceMessages = (insight.sourceMessageIndices || [])
    //                 .map(index => messages[index])
    //                 .filter(msg => msg); // Filter out any undefined messages

    //             // Log the insight with its contributing messages
    //             log.insight.store(
    //                 conversationId,
    //                 {
    //                     content: insight.content,
    //                     type: insight.type,
    //                     confidence: insight.confidence
    //                 },
    //                 sourceMessages.length > 0 ? sourceMessages : 'Derived from overall conversation analysis'
    //             );
    //         }

    //         log.debug('Stored insights from conversation', {
    //             conversationId,
    //             insightCount: insights.length,
    //             insights
    //         });

    //         log.perf.measure('extractAndStoreInsights', Date.now() - startTime, {
    //             executionId,
    //             function: 'extractAndStoreInsights',
    //             messageCount: messages.length,
    //             insightCount: insights.length,
    //             success: true
    //         });

    //     } catch (error) {
    //         log.error('Failed to extract insights', error);
    //         log.perf.measure('extractAndStoreInsights', Date.now() - startTime, {
    //             executionId,
    //             function: 'extractAndStoreInsights',
    //             error: error.message,
    //             status: 'failed'
    //         });
    //     }
    // }

}
