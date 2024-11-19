// src/agents/director.js
import { BaseAgent } from '../base/baseAgent.js';
import { log } from '../../utils/winstonLogger.js';

export class Director extends BaseAgent {
    constructor(config, llmService) {
        super({ ...config, role: 'Director' }, llmService);
        this.activeParticipants = new Set();
        log.state.change('Director', 'uninitialized', 'ready', { config });
    }

    async planInitialAgentTasks(message, availableAgents) {
        const eventId = log.event.emit('planInitialAgentTasks', 'Director', {
            messageLength: typeof message === 'object' ? message.content.length : message.length,
            availableAgentCount: availableAgents.length
        });

        try {
            const startTime = Date.now();
            
            log.debug('Starting initial agent task planning', { 
                message, 
                agentCount: availableAgents.length 
            });
            
            // Create a mapping of agent roles to their IDs
            const agentMap = availableAgents.reduce((map, agent) => {
                map[agent.role.toLowerCase()] = agent.id;
                return map;
            }, {});

            log.debug('Created agent map', { agentMap });
            
            // Handle message object or string
            const userPrompt = typeof message === 'object' ? message.content : message;
            log.debug('Processed user prompt', { userPrompt });

            const systemPrompt = `As the Director, analyze the following message and determine:
            1. Which of these available agents should participate: ${availableAgents.map(a => a.role).join(', ')}
            2. What specific aspect each agent should address
            
            Important Guidelines:
            - Assign clear, focused tasks that can be answered in 2-3 sentences
            - Each task should focus on one specific aspect
            - Tasks should be complementary, not overlapping
            - Use EXACTLY these role names: ${availableAgents.map(a => a.role).join(', ')}
            
            Respond in a strict JSON format like this:
            {
                "participants": [
                    {
                        "id": "${availableAgents[0]?.id || 'analyst-1'}",
                        "role": "${availableAgents[0]?.role || 'Analyst'}",
                        "task": "specific focused task description"
                    }
                ]
            }`;

            log.debug('Making LLM request');
            const llmStartTime = Date.now();
            const response = await this.llm.makeModelRequest({
                systemPrompt: systemPrompt,
                userPrompt: userPrompt,
                context: [], 
                agentType: this.role
            });
            log.perf.measure('llm-request', Date.now() - llmStartTime, {
                method: 'planInitialAgentTasks',
                promptLength: userPrompt.length,
                responseLength: response.length
            });

            // Parse and validate the response
            let plan;
            try {
                plan = typeof response === 'string' ? JSON.parse(response) : response;
                log.debug('Parsed initial plan', { plan });
                
                if (!plan.participants || !Array.isArray(plan.participants)) {
                    throw new Error('Invalid plan structure: missing or invalid participants array');
                }
                
                // Ensure IDs match our system's IDs
                plan.participants = plan.participants.map(participant => {
                    log.debug('Mapping participant', { participant });
                    return {
                        ...participant,
                        id: agentMap[participant.role.toLowerCase()] || participant.id
                    };
                });

                log.debug('Final processed plan', { plan });
            } catch (e) {
                log.error('Error processing plan', { error: e.message });
                log.error('Failed to process orchestration plan', { error: e, plan });
                
                // Fallback plan with default participant
                plan = {
                    participants: [{
                        id: availableAgents[0]?.id || 'analyst-1',
                        role: availableAgents[0]?.role || 'Analyst',
                        task: 'Analyze the user message and provide initial insights.'
                    }]
                };
                log.warn('Using fallback plan', { plan });
            }

            log.event.complete(eventId, 'completed', { plan });
            log.perf.measure('planInitialAgentTasks', Date.now() - startTime, {
                participantCount: plan.participants.length
            });

            return plan;
        } catch (error) {
            log.event.complete(eventId, 'failed', { error: error.message });
            log.error('Critical error in planInitialAgentTasks', error);
            throw error;
        }
    }

    async planNextAgentInteraction(messages, previousResponses) {
        const eventId = log.event.emit('planNextAgentInteraction', 'Director', {
            messageCount: messages.length,
            previousResponseCount: previousResponses.length
        });

        try {
            const startTime = Date.now();
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
                        log.warn('Invalid plan - agent would speak twice in a row');
                        return null;
                    }
                }

            } catch (e) {
                log.error('Error parsing plan', { error: e });
                return null;
            }

            log.debug('Returning final plan', { plan });
            log.event.complete(eventId, 'completed', { plan });
            log.perf.measure('planNextAgentInteraction', Date.now() - startTime, {
                success: !!plan
            });

            return plan;
        } catch (error) {
            log.event.complete(eventId, 'failed', { error: error.message });
            log.error('Error in planNextAgentInteraction', error);
            return null;
        }
    }

    async synthesizeDiscussion(context) {
        const eventId = log.event.emit('synthesizeDiscussion', 'Director', {
            contextLength: context?.length
        });

        try {
            const startTime = Date.now();
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
            
            log.event.complete(eventId, 'completed', { 
                summaryLength: response.length 
            });
            log.perf.measure('synthesizeDiscussion', Date.now() - startTime, {
                messageCount: formattedMessages.length
            });

            return response;
        } catch (error) {
            log.event.complete(eventId, 'failed', { error: error.message });
            log.error('Error in synthesizeDiscussion', error);
            throw error;
        }
    }

}