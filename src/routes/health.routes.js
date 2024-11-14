import express from 'express';

export const healthRouter = express.Router();

healthRouter.get('/', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});