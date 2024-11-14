// src/agents/director.js
import { BaseAgent } from './baseAgent.js';
import { Logger } from '../utils/logger.js';

export class Director extends BaseAgent {
    constructor(config, llmService) {
        super({ ...config, role: 'Director' }, llmService);
        this.activeParticipants = new Set();
    }

    async orchestrateDiscussion(message, availableAgents) {
        try {
            Logger.debug('[Director] orchestrateDiscussion - starting with:', { 
                message, 
                agentCount: availableAgents.length 
            });
            
            // Create a mapping of agent roles to their IDs
            const agentMap = availableAgents.reduce((map, agent) => {
                map[agent.role.toLowerCase()] = agent.id;
                return map;
            }, {});

            Logger.debug('[Director] orchestrateDiscussion - created agent map:', agentMap);
            
            // Handle message object or string
            const userPrompt = typeof message === 'object' ? message.content : message;
            Logger.debug('[Director] orchestrateDiscussion - processed user prompt:', userPrompt);

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

            Logger.debug('[Director] orchestrateDiscussion - making LLM request...');
            const response = await this.llm.makeModelRequest({
                systemPrompt: systemPrompt,
                userPrompt: userPrompt,
                context: [], 
                agentType: this.role
            });
            Logger.debug('[Director] orchestrateDiscussion - received LLM response:', response);
            
            // Parse and validate the response
            let plan;
            try {
                plan = typeof response === 'string' ? JSON.parse(response) : response;
                Logger.debug('[Director] orchestrateDiscussion - parsed initial plan:', plan);
                
                if (!plan.participants || !Array.isArray(plan.participants)) {
                    throw new Error('Invalid plan structure: missing or invalid participants array');
                }
                
                // Ensure IDs match our system's IDs
                plan.participants = plan.participants.map(participant => {
                    Logger.debug('[Director] orchestrateDiscussion - mapping participant:', participant);
                    return {
                        ...participant,
                        id: agentMap[participant.role.toLowerCase()] || participant.id
                    };
                });

                Logger.debug('[Director] orchestrateDiscussion - final processed plan:', plan);
            } catch (e) {
                Logger.error('[Director] orchestrateDiscussion - Error processing plan:', e.message);
                Logger.error('[Director] Failed to process orchestration plan:', { error: e, plan });
                
                // Fallback plan with default participant
                plan = {
                    participants: [{
                        id: availableAgents[0]?.id || 'analyst-1',
                        role: availableAgents[0]?.role || 'Analyst',
                        task: 'Analyze the user message and provide initial insights.'
                    }]
                };
                Logger.warn('[Director] orchestrateDiscussion - using fallback plan:', plan);
            }

            return plan;
        } catch (error) {
            Logger.error('[Director] orchestrateDiscussion - CRITICAL ERROR:', error);
            throw error;
        }
    }

    async guideDiscussion(context) {
        const systemPrompt = `You are ${this.name}, the discussion Director. 
        Your role is to guide the ongoing discussion between: 
        ${Array.from(this.activeParticipants).join(', ')}
        
        Based on the conversation history, determine:
        1. Which agent should speak next
        2. What specific aspect they should address
        3. When the discussion should conclude
        
        Keep the discussion focused and encourage building on others' ideas.`;
    
        return await this.llm.makeModelRequest(systemPrompt, "Guide the next step of the discussion", context);
    }

    async facilitateCollaboration(messages, previousResponses) {
        try {
            Logger.debug('[Director] facilitateCollaboration - starting with:', {
                messagesCount: messages.length,
                previousResponsesCount: previousResponses.length
            });

            // Format previous responses for the prompt
            const formattedResponses = previousResponses.map(r => ({
                role: r.role || r.agentId.split('-')[0], // Fallback to agent ID if role is missing
                response: r.response || r.content.split(': ')[1] // Handle both formats
            }));

            const systemPrompt = `As the Director, analyze the following conversation and determine the next most valuable interaction.

            Last response in this conversation:
            --${formattedResponses[formattedResponses.length - 1]?.response}--

            Available roles: Analyst, Critic, Expert

            Determine the next interaction using ONLY the available roles listed above.
            
            Requirements:
            1. nextAgent must be one of: Analyst, Critic, or Expert
            2. respondTo must be one of the roles that already contributed
            3. nextAgent CANNOT be the same as any role in respondTo
            4. nextAgent CANNOT be the same as the last agent who spoke
            5. Task should build upon the last response in the conversation

            Respond in strict JSON format:
            {
                "nextAgent": "one of: Analyst, Critic, or Expert",
                "respondTo": ["${formattedResponses[formattedResponses.length - 1]?.role}"],
                "task": "specific instruction for the agent"
            }`;

            Logger.debug('[Director] facilitateCollaboration - constructed system prompt:', systemPrompt);

            Logger.debug('[Director] facilitateCollaboration - making LLM request...');
            const response = await this.llm.makeModelRequest({
                systemPrompt: systemPrompt,
                userPrompt: "",
                context: messages,
                agentType: this.role
            });
            Logger.debug('[Director] facilitateCollaboration - received LLM response:', response);
            
            let plan;
            try {
                Logger.debug('[Director] Attempting to parse LLM response into JSON');
                let jsonStr = response;
                
                // Handle various markdown code block formats
                if (typeof response === 'string') {
                    const codeBlockMatch = response.match(/```(?:json\n|\n)?(.+?)```/s);
                    if (codeBlockMatch) {
                        jsonStr = codeBlockMatch[1].trim();
                    }
                }
                
                plan = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
                
                Logger.debug('[Director] facilitateCollaboration - parsed plan:', plan);
                
                // Validate nextAgent
                const validRoles = ['Analyst', 'Critic', 'Expert'];
                Logger.debug('[Director] facilitateCollaboration - validating nextAgent:', plan.nextAgent);
                if (!validRoles.includes(plan.nextAgent)) {
                    Logger.error('[Director] Invalid agent role received from LLM:', plan.nextAgent);
                    return null;
                }

                // Validate respondTo
                Logger.debug('[Director] facilitateCollaboration - validating respondTo:', plan.respondTo);
                if (!plan.respondTo.every(role => formattedResponses.map(r => r.role).includes(role))) {
                    Logger.error('[Director] Invalid respondTo role received from LLM:', plan.respondTo);
                    return null;
                }
                Logger.debug('[Director] facilitateCollaboration - validation successful');

                // Add additional validation before returning the plan
                if (plan.nextAgent && plan.respondTo) {
                    const lastResponse = formattedResponses[formattedResponses.length - 1];
                    if (plan.nextAgent === lastResponse?.role || 
                        plan.respondTo.includes(plan.nextAgent)) {
                        Logger.warn('[Director] Invalid plan - agent would respond to self');
                        return null;
                    }
                }

            } catch (e) {
                Logger.error('[Director] facilitateCollaboration - Error parsing plan:', e);
                return null;
            }

            Logger.debug('[Director] facilitateCollaboration - returning final plan:', plan);
            return plan;
        } catch (error) {
            Logger.error('[Director] facilitateCollaboration - CRITICAL ERROR:', error);
            return null;
        }
    }

    async synthesizeDiscussion(context) {
        try {
            Logger.debug(`[Director] synthesizeDiscussion started with:`, {
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

            Logger.debug('[Director] Synthesizing discussion with formatted messages:', formattedMessages);
            
            const systemPrompt = `As the Director, provide a concise synthesis of this conversation.

            Conversation messages:
            ${formattedMessages.map(m => `- ${m.agentId}: ${m.content}`).join('\n')}

            Create a brief summary that includes:
            1. The core discussion topic
            2. Key insights and notable points raised
            3. Important patterns or themes that emerged
            4. Essential conclusions reached

            Keep the summary clear and focused. Prioritize meaningful insights over comprehensive coverage.`;
            
            const response = await this.llm.makeModelRequest({
                systemPrompt: systemPrompt,
                userPrompt: "Provide a comprehensive synthesis of the discussion.",
                context: [],
                agentType: this.role
            });

            Logger.debug(`[Director] Generated summary:`, response);
            return response;
        } catch (error) {
            Logger.error('[Director] Error in synthesizeDiscussion:', error);
            throw error;
        }
    }

}