// src/agents/director.js
import { BaseAgent } from '../../base/baseAgent.js';
import { log } from '../../../utils/logger.js';
import { config } from '../../../config/config.js';

export class Director extends BaseAgent {
    constructor(config, llmService) {
        super(config, llmService);
    }

    async planInitialAgentTasks(message, availableAgents, storedInsights) {
        const executionId = `director-pit-${Date.now()}`;
        const startTime = Date.now();
        
        try {
            const userPrompt = typeof message === 'object' ? message.content : message;
            
            // Parse and analyze
            const parsedData = await this.parseAndAnalyze(userPrompt, storedInsights);
            const problem = await this.understandProblem(parsedData);
            const tasks = await this.decomposeTask(problem);
            
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
            
            log.debug('Final processed plan', { plan });
            log.perf.measure('planInitialAgentTasks', Date.now() - startTime, {
                executionId,
                function: 'planInitialAgentTasks',
                inputLength: userPrompt.length,
                agentCount: availableAgents.length,
                insightCount: storedInsights?.length || 0,
                participantCount: plan.participants.length,
                inputPreview: userPrompt.substring(0, 100),
                outputPreview: JSON.stringify(plan).substring(0, 100)
            });
            return plan;
        } catch (error) {
            log.perf.measure('planInitialAgentTasks', Date.now() - startTime, {
                executionId,
                function: 'planInitialAgentTasks',
                error: error.message,
                status: 'failed'
            });
            throw error;
        }
    }


    async parseAndAnalyze(message, storedInsights) {
        const executionId = `director-pa-${Date.now()}`;
        const startTime = Date.now();
        
        try {
            log.debug('Parsing and analyzing user message', { message });

            const systemPrompt = `Extract key points, entities, and sentiment from the following message:
            "${message}". As well as the following previous messages in this array if there are any: [${ storedInsights ? storedInsights.map(insight => insight.content).join('\n') : '' }].

            Respond in a strict JSON format like this. Use as many key points and entities as you need:
            {
                "keyPoints": ["point1", "point2"],
                "entities": ["entity1", "entity2"],
                "sentiment": "positive/negative/neutral"
            }`;

            const parsedData = await this.llm.makeModelRequest({
                systemPrompt: systemPrompt,
                userPrompt: message,
                context: [],
                agentType: this.role
            });

            log.debug('Parsed data in Director.js', { parsedData });
            log.perf.measure('parseAndAnalyze', Date.now() - startTime, {
                executionId,
                function: 'parseAndAnalyze',
                messageLength: message.length,
                insightCount: storedInsights?.length || 0,
                inputPreview: message.substring(0, 100),
                outputPreview: JSON.stringify(parsedData).substring(0, 100)
            });
            return parsedData;
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
            log.debug('Understanding the problem from parsed data', { parsedData });

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
            log.debug('Identified problem in Director.js', { problem });
            log.perf.measure('understandProblem', Date.now() - startTime, {
                executionId,
                function: 'understandProblem',
                inputSize: JSON.stringify(parsedData).length,
                keyPointCount: parsedData.keyPoints.length,
                entityCount: parsedData.entities.length,
                outputLength: problem.length,
                inputPreview: JSON.stringify(parsedData).substring(0, 100),
                outputPreview: problem.substring(0, 100)
            });
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

    async decomposeTask(problem) {
        try {
            const startTime = Date.now();
            log.debug('Decomposing problem into tasks', { problem });

            const systemPrompt = `Break down the following problem into smaller, specific tasks. Make sure they are research oriented. Limit yourself to ${config.director.maxTasksAssigned} tasks:
            "${problem}"
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
                log.debug('Decomposed tasks in Director.js', { tasks });
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
            log.debug('Planning next agent interaction', {
                messagesCount: messages.length,
                previousResponsesCount: previousResponses.length
            });

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

            log.debug('Making LLM request');
            const llmStartTime = Date.now();
            const response = await this.llm.makeModelRequest({
                systemPrompt: systemPrompt,
                userPrompt: userPrompt,
                context: messages,
                agentType: this.role,
                forceJsonResponse: true  // Add this flag if your LLM service supports it
            });
            log.perf.measure('llm-request', Date.now() - llmStartTime, {
                method: 'planNextAgentInteraction',
                contextLength: messages.length
            });

            let plan;
            try {
                log.debug('Attempting to parse LLM response into JSON');
                let jsonStr = response;
                
                // Handle various markdown code block formats
                if (typeof response === 'string') {
                    const codeBlockMatch = response.match(/```(?:json\n|\n)?(.+?)```/s);
                    if (codeBlockMatch) {
                        jsonStr = codeBlockMatch[1].trim();
                    }
                }
                
                plan = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
                
                log.debug('Parsed plan', { plan });
                
                // Validate nextAgent
                const validRoles = ['Analyst', 'Critic', 'Expert'];
                log.debug('Validating nextAgent', { nextAgent: plan['nextAgent'] });
                if (!validRoles.includes(plan['nextAgent'])) {
                    log.error('Invalid agent role received from LLM', { nextAgent: plan['nextAgent'] });
                    return null;
                }

                // Validate respondTo
                log.debug('Validating respondTo', { respondTo: plan['respondTo'] });
                if (!plan['respondTo'].every(role => formattedResponses.map(r => r.role).includes(role))) {
                    log.error('Invalid respondTo role received from LLM', { respondTo: plan['respondTo'] });
                    return null;
                }
                log.debug('Validation successful');

                // Add additional validation before returning the plan
                if (plan['nextAgent'] && plan['respondTo']) {
                    const lastResponse = formattedResponses[formattedResponses.length - 1];
                    
                    // Debug the comparison
                    log.debug('Comparing roles', {
                        nextAgent: plan['nextAgent'],
                        lastResponseRole: lastResponse?.role,
                        lastResponseAgentId: lastResponse?.agentId
                    });
                    
                    // Compare the actual roles, ensuring case-insensitive comparison
                    if (plan['nextAgent'].toLowerCase() === lastResponse?.role?.toLowerCase()) {
                        log.debug('(Warning) Invalid plan - agent would speak twice in a row');
                        return null;
                    }
                }

            } catch (e) {
                log.error('Error parsing plan', { error: e });
                return null;
            }

            log.debug('Returning final plan', { plan });
            log.perf.measure('planNextAgentInteraction', Date.now() - startTime, {
                executionId,
                function: 'planNextAgentInteraction',
                messageCount: messages.length,
                responseCount: previousResponses.length,
                success: !!plan,
                lastSpeaker: formattedResponses[formattedResponses.length - 1]?.role,
                nextAgent: plan?.nextAgent,
                inputPreview: JSON.stringify(messages[messages.length - 1]).substring(0, 100),
                outputPreview: JSON.stringify(plan).substring(0, 100)
            });

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
            log.debug('Starting discussion synthesis', {
                contextLength: context?.length,
                messages: context
            });

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

            log.debug('Synthesizing discussion with formatted messages', { formattedMessages });
            
            const systemPrompt = `As the Director, provide a concise synthesis of this conversation.

            Conversation messages:
            ${formattedMessages.map(m => `- ${m.agentId}: ${m.content}`).join('\n')}

            Create a brief summary that includes:
            1. The core discussion topic
            2. Key insights and notable points raised
            3. Important patterns or themes that emerged
            4. Essential conclusions reached

            Keep the summary clear and focused. Prioritize meaningful insights over comprehensive coverage.`;
            
            const llmStartTime = Date.now();

            const response = await this.llm.makeModelRequest({
                systemPrompt: systemPrompt,
                userPrompt: "Provide a comprehensive synthesis of the discussion.",
                context: [],
                agentType: this.role
            });

            log.perf.measure('llm-request', Date.now() - llmStartTime, {
                method: 'synthesizeDiscussion',
                messageCount: formattedMessages.length
            });

            log.debug('Generated summary', { response });
            
            log.perf.measure('synthesizeDiscussion', Date.now() - startTime, {
                executionId,
                function: 'synthesizeDiscussion',
                contextLength: context?.length || 0,
                relevantMessageCount: relevantMessages.length,
                outputLength: response.length,
                inputPreview: JSON.stringify(formattedMessages[0]).substring(0, 100),
                outputPreview: response.substring(0, 100)
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

}
