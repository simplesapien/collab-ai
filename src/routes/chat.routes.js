import express from 'express';
import { Logger } from '../utils/logger.js';

export const chatRouter = express.Router();

chatRouter.post('/', async (req, res) => {
    try {
        const { 
            systemPrompt, 
            userPrompt, 
            context = [], 
            temperature = 0.7,
            model = "gpt-4-mini"
        } = req.body;
        
        const contextArray = Array.isArray(context) ? context : [];
        
        const completion = await req.openai.chat.completions.create({
            model,
            messages: [
                { role: "system", content: systemPrompt || '' },
                ...contextArray.map(msg => ({
                    role: msg.agentId === "user" ? "user" : "assistant",
                    content: msg.content
                })),
                { role: "user", content: userPrompt || '' }
            ],
            temperature
        });

        Logger.debug('OpenAI API response:', completion.choices[0].message);
        res.json({ 
            content: completion.choices[0].message.content, 
            usage: {
                completion_tokens: completion.usage.completion_tokens, 
                prompt_tokens: completion.usage.prompt_tokens
            } 
        });

    } catch (error) {
        Logger.error('OpenAI API Error:', error);
        res.status(500).json({ error: error.message });
    }
});