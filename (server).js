import express from 'express';
import { Application } from './src/app.js';
import { Logger } from './src/utils/logger.js';
import { config } from './src/config/config.js';

const app = express();
const port = process.env.PORT || 3000;
const application = new Application();

// Middleware to parse JSON bodies
app.use(express.json());

// Initialize the application before starting the server
async function initializeServer() {
    try {
        await application.initialize();
        Logger.setLevel(config.system.logLevel);
        Logger.info('Server initialized successfully');
    } catch (error) {
        Logger.error('Failed to initialize server:', error);
        process.exit(1);
    }
}

// Endpoint to process messages
app.post('/api/message', async (req, res) => {
    try {
        const { message, conversationId } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Set up SSE for real-time agent responses
        if (req.headers.accept === 'text/event-stream') {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const unsubscribe = application.onResponse(response => {
                res.write(`data: ${JSON.stringify(response)}\n\n`);
            });

            // Clean up subscription when client disconnects
            req.on('close', () => {
                unsubscribe();
            });
        }

        const result = await application.processUserMessage(
            { content: message },
            conversationId
        );

        // For non-SSE requests, send the complete result
        if (req.headers.accept !== 'text/event-stream') {
            res.json(result);
        }

    } catch (error) {
        Logger.error('Error processing message:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
});

// Endpoint to get system status
app.get('/api/status', (req, res) => {
    try {
        const status = application.getSystemStatus();
        res.json(status);
    } catch (error) {
        Logger.error('Error getting status:', error);
        res.status(500).json({ error: 'Failed to get system status' });
    }
});

// Endpoint to get cost summary
app.get('/api/costs', async (req, res) => {
    try {
        const costs = await application.getCostSummary();
        res.json(costs);
    } catch (error) {
        Logger.error('Error getting costs:', error);
        res.status(500).json({ error: 'Failed to get cost summary' });
    }
});

// Endpoint to reset costs
app.post('/api/costs/reset', async (req, res) => {
    try {
        await application.resetCosts();
        res.json({ message: 'Cost tracking reset successfully' });
    } catch (error) {
        Logger.error('Error resetting costs:', error);
        res.status(500).json({ error: 'Failed to reset costs' });
    }
});

// Start the server
initializeServer().then(() => {
    app.listen(port, () => {
        Logger.info(`Server running at http://localhost:${port}`);
    });
});

export default app;