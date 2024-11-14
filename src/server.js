// src/server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import cors from 'cors';
import { Logger } from './utils/logger.js';
import { chatRouter } from './routes/chat.routes.js';
import { healthRouter } from './routes/health.routes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class Server {
    constructor() {
        this.app = express();
        this.PORT = process.env.PORT || 3000;
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.static(path.join(__dirname)));
        this.app.use(cors());
        
        // Add OpenAI instance to requests
        this.app.use((req, res, next) => {
            req.openai = this.openai;
            next();
        });

        // Global error handling middleware
        this.app.use((err, req, res, next) => {
            Logger.error('Server error:', err);
            res.status(500).json({ error: 'Internal server error' });
        });
    }

    setupRoutes() {
        // API Routes
        this.app.use('/api/chat', chatRouter);
        this.app.use('/health', healthRouter);

        // Catch-all route for serving the frontend
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