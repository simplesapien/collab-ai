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
            console.log('orchestrateDiscussion - starting with:', { message, agentCount: availableAgents.length });
            
            // Create a mapping of agent roles to their IDs
            const agentMap = availableAgents.reduce((map, agent) => {
                map[agent.role.toLowerCase()] = agent.id;
                return map;
            }, {});

            console.log('orchestrateDiscussion - created agent map:', agentMap);
            
            // Handle message object or string
            const userPrompt = typeof message === 'object' ? message.content : message;
            console.log('orchestrateDiscussion - processed user prompt:', userPrompt);

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

            console.log('orchestrateDiscussion - making LLM request...');
            const response = await this.llm.makeModelRequest({
                systemPrompt: systemPrompt,
                userPrompt: userPrompt,
                context: [], 
                agentType: this.role
            });
            console.log('orchestrateDiscussion - received LLM response:', response);
            
            // Parse and validate the response
            let plan;
            try {
                plan = typeof response === 'string' ? JSON.parse(response) : response;
                console.log('orchestrateDiscussion - parsed initial plan:', plan);
                
                if (!plan.participants || !Array.isArray(plan.participants)) {
                    throw new Error('Invalid plan structure: missing or invalid participants array');
                }
                
                // Ensure IDs match our system's IDs
                plan.participants = plan.participants.map(participant => {
                    console.log('orchestrateDiscussion - mapping participant:', participant);
                    return {
                        ...participant,
                        id: agentMap[participant.role.toLowerCase()] || participant.id
                    };
                });

                console.log('orchestrateDiscussion - final processed plan:', plan);
            } catch (e) {
                console.log('orchestrateDiscussion - ERROR processing plan:', e.message);
                Logger.error('Failed to process orchestration plan:', { error: e, plan });
                
                // Fallback plan with default participant
                plan = {
                    participants: [{
                        id: availableAgents[0]?.id || 'analyst-1',
                        role: availableAgents[0]?.role || 'Analyst',
                        task: 'Analyze the user message and provide initial insights.'
                    }]
                };
                console.log('orchestrateDiscussion - using fallback plan:', plan);
            }

            return plan;
        } catch (error) {
            console.log('orchestrateDiscussion - CRITICAL ERROR:', error);
            Logger.error('Error in orchestrateDiscussion:', error);
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
            console.log('facilitateCollaboration - starting with:', {
                messagesCount: messages.length,
                previousResponsesCount: previousResponses.length
            });

            // Get the roles from the previous responses
            const participatedRoles = previousResponses.map(r => r.role);
            console.log('facilitateCollaboration - participated roles:', participatedRoles);
            
            const systemPrompt = `As the Director, analyze the following conversation and determine the next most valuable interaction.

            Previous responses in this conversation:
            ${previousResponses.map(r => `${r.role}: ${r.response}`).join('\n')}

            Available roles: Analyst, Critic, Expert
            Roles who have already contributed: ${participatedRoles.join(', ')}

            Determine the next interaction using ONLY the available roles listed above.
            
            Requirements:
            1. nextAgent must be one of: Analyst, Critic, or Expert
            2. respondTo must be one of the roles that already contributed
            3. Task should encourage building upon or challenging previous points

            Respond in strict JSON format:
            {
                "nextAgent": "one of: Analyst, Critic, or Expert",
                "respondTo": ["role that already participated"],
                "task": "specific instruction for the agent"
            }`;
            console.log('facilitateCollaboration - constructed system prompt:', systemPrompt);

            console.log('facilitateCollaboration - making LLM request...');
            const response = await this.llm.makeModelRequest({
                systemPrompt: systemPrompt,
                userPrompt: "",
                context: messages,
                agentType: this.role
            });
            console.log('facilitateCollaboration - received LLM response:', response);
            
            let plan;
            try {
                console.log('Attempting to parse LLM response into JSON');
                let jsonStr = response;
                
                // Handle various markdown code block formats
                if (typeof response === 'string') {
                    // Remove markdown code blocks if present (handles both ```json and ``` formats)
                    const codeBlockMatch = response.match(/```(?:json\n|\n)?(.+?)```/s);
                    if (codeBlockMatch) {
                        jsonStr = codeBlockMatch[1].trim();
                    }
                }
                
                plan = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
                
                console.log('facilitateCollaboration - parsed plan:', plan);
                
                // Validate nextAgent
                const validRoles = ['Analyst', 'Critic', 'Expert'];
                console.log('facilitateCollaboration - validating nextAgent:', plan.nextAgent);
                if (!validRoles.includes(plan.nextAgent)) {
                    console.log('facilitateCollaboration - INVALID nextAgent:', plan.nextAgent);
                    Logger.error('Invalid agent role received from LLM:', plan.nextAgent);
                    return null;
                }

                // Validate respondTo
                console.log('facilitateCollaboration - validating respondTo:', plan.respondTo);
                if (!plan.respondTo.every(role => participatedRoles.includes(role))) {
                    console.log('facilitateCollaboration - INVALID respondTo:', plan.respondTo);
                    Logger.error('Invalid respondTo role received from LLM:', plan.respondTo);
                    return null;
                }
                console.log('facilitateCollaboration - validation successful');

            } catch (e) {
                console.log('facilitateCollaboration - ERROR parsing plan:', plan);
                Logger.error('Failed to parse collaboration plan:', e);
                return null;
            }

            console.log('facilitateCollaboration - returning final plan:', plan);
            return plan;
        } catch (error) {
            console.log('facilitateCollaboration - CRITICAL ERROR:', error);
            Logger.error('Error in facilitateCollaboration:', error);
            return null;
        }
    }

    async synthesizeDiscussion(context) {
        try {
            const startTime = Date.now();
            console.log(`[${startTime}] synthesizeDiscussion started with:`, {
                contextLength: context?.length,
                messages: context
            });

            const validatedContext = this.validateContext(context);
            console.log('Validated context:', validatedContext);

            const systemPrompt = `As the Director, synthesize the key points of this conversation into a clear, actionable summary.
            
            Requirements:
            1. Include the initial question/topic
            2. Summarize the main points from each agent
            3. Highlight areas of agreement
            4. List concrete next steps
            
            Important: Ensure the summary reflects the ENTIRE conversation history.`;
            
            const response = await this.llm.makeModelRequest({
                systemPrompt: systemPrompt,
                userPrompt: "Provide a comprehensive synthesis of the discussion.",
                context: validatedContext,
                agentType: this.role
            });

            console.log(`[${startTime}] Generated summary:`, response);
            return response;
        } catch (error) {
            Logger.error('Error in Director.synthesizeDiscussion:', error);
            throw error;
        }
    }

    constructGuidePrompt(participants) {
        return `You are ${this.name}, the discussion Director. 
        Your role is to guide a productive discussion between the following participants:
        ${participants.map(p => `${p.name} (${p.role})`).join(', ')}
        
        Keep the discussion focused and encourage building on others' ideas.
        Provide clear, concise guidance in 1-2 sentences.
        
        Previous context: ${this.getRelevantHistory()}`;
    }

    constructUserPrompt(context) {
        return context.length === 0 
            ? "Start the discussion by selecting the most relevant agents to address this query."
            : "Guide the next step of the discussion based on previous messages.";
    }

    updateParticipants(participants) {
        if (!Array.isArray(participants)) {
            Logger.error('Invalid participants data:', participants);
            participants = []; // Set empty array as fallback
        }
        
        this.activeParticipants = new Set(
            participants
                .filter(p => p && p.id) // Only include valid participants
                .map(p => p.id)
        );
        this.state.currentTask = 'guiding_discussion';
    }

    getActiveParticipants() {
        return Array.from(this.activeParticipants);
    }
}