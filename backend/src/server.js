import express from 'express';
import { Application } from './app.js';
import { config } from './config/config.js';

const app = express();
const port = process.env.PORT || 3000;
const application = new Application();

// Basic middleware
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
    const allowedOrigins = [
        'https://collab-ai-frontend.vercel.app',
        'http://localhost:3001', // for local testing
        'null' // also for local testing
    ];
    
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

// Initialize
async function initializeServer() {
    try {
        await application.initialize();
        console.log('Server initialized successfully');
    } catch (error) {
        console.error('Failed to initialize server:', error);
        process.exit(1);
    }
}

// Simple message endpoint
app.post('/api/message', async (req, res) => {
    try {
        const { message, conversationId } = req.body;
        console.log('Server received message:', { message, conversationId });

        // Set up SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        console.log('Headers set, setting up response handler...');

        // Send initial connection confirmation
        res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

        let responseCount = 0;

        // Set up handlers like the CLI does
        application.onAgentThinking((agentId, phase) => {
            console.log('Agent thinking:', { agentId, phase });
            res.write(`data: ${JSON.stringify({
                type: 'state-update',
                agentId: agentId,
                state: phase
            })}\n\n`);
        });
        
        const cleanup = application.onResponse(response => {
            console.log(`Server sending response #${++responseCount}:`, response);
            res.write(`data: ${JSON.stringify(response)}\n\n`);
        });

        req.on('close', () => {
            console.log('Client connection closed - but continuing to process');
        });

        const formattedMessage = {
            content: message,
            timestamp: Date.now(),
            role: 'user'
        };

        console.log('About to process message:', { formattedMessage, conversationId });
        const result = await application.processUserMessage(formattedMessage, conversationId);
        console.log('Message processing complete, conversation:', result.conversationId);

        // Send the conversationId back to the client
        res.write(`data: ${JSON.stringify({ 
            type: 'conversation',
            conversationId: result.conversationId 
        })}\n\n`);

        cleanup();
        res.end();

    } catch (error) {
        console.error('Server error:', error);
        const errorData = `data: ${JSON.stringify({ error: error.message })}\n\n`;
        console.log('Sending error:', errorData);
        res.write(errorData);
        res.end();
    }
});

// Add this endpoint alongside the existing message endpoint
app.post('/api/cancel', async (req, res) => {
    try {
        const { conversationId } = req.body;
        console.log('Cancelling process for conversation:', conversationId);
        
        await application.cancelCurrentProcess();
        
        res.json({ 
            status: 'success',
            message: 'Process cancelled'
        });
    } catch (error) {
        console.error('Error cancelling process:', error);
        res.status(500).json({ 
            error: 'Failed to cancel process',
            message: error.message 
        });
    }
});

// Add these endpoints alongside the existing ones
app.get('/api/status', async (req, res) => {
    try {
        const status = application.getSystemStatus();
        res.json(status);
    } catch (error) {
        console.error('Error getting status:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/costs', async (req, res) => {
    try {
        const costs = await application.getCostSummary();
        res.json(costs);
    } catch (error) {
        console.error('Error getting costs:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/costs/reset', async (req, res) => {
    try {
        await application.resetCosts();
        res.json({ message: 'Costs reset successfully' });
    } catch (error) {
        console.error('Error resetting costs:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start server
initializeServer().then(() => {
    app.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });
});

export default app;