// src/server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import cors from 'cors';
import { Logger } from './utils/logger.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Server {
    constructor() {
        this.app = express();
        this.PORT = process.env.PORT || 3000;
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        // Parse JSON bodies
        this.app.use(express.json());

        this.app.use(express.static(path.join(__dirname)));
        this.app.use(cors());
        
        // Global error handling middleware
        this.app.use((err, req, res, next) => {
            Logger.error('Server error:', err);
            res.status(500).json({ error: 'Internal server error' });
        });
    }

    setupRoutes() {
        // API endpoint for chat completions
        this.app.post('/api/chat', async (req, res) => {
            try {
                const { 
                    systemPrompt, 
                    userPrompt, 
                    context = [], 
                    temperature = 0.7, // Default if not provided
                    model = "gpt-4o-mini" // Default if not provided
                } = req.body;
                
                // Ensure context is an array
                const contextArray = Array.isArray(context) ? context : [];
                
                const completion = await this.openai.chat.completions.create({
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
                res.json({ content: completion.choices[0].message.content, usage: {completion_tokens: completion.usage.completion_tokens, prompt_tokens: completion.usage.prompt_tokens} });

            } catch (error) {
                Logger.error('OpenAI API Error:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({ status: 'healthy', timestamp: new Date().toISOString() });
        });

        // Handle all other routes by serving index.html
        this.app.get('*', (req, res) => {
            res.sendFile(path.join(__dirname, 'index.html'));
        });
    }

    start() {
        this.app.listen(this.PORT, () => {
            Logger.info(`Server running at http://localhost:${this.PORT}`);
        });
    }
}

// Start the server
const server = new Server();
server.start();