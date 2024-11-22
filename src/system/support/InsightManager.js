import { log } from '../../utils/logger.js';

export class InsightManager {
    constructor(qualityGate = null) {
        this.insights = new Map(); // conversationId -> insights[]
        this.qualityGate = qualityGate;
        log.state.change('InsightManager', 'uninitialized', 'ready');
    }

    async addInsight(conversationId, insight, source) {
        const eventId = log.event.emit('addInsight', 'InsightManager', { conversationId });
        
        try {
            // Ensure conversationId exists
            if (!conversationId) {
                log.warn('No conversationId provided for insight');
                return false;
            }

            // Initialize array if it doesn't exist for this conversation
            if (!this.insights.has(conversationId)) {
                this.insights.set(conversationId, []);
            }

            const currentInsights = this.insights.get(conversationId);

            // Quality check if gate is available
            if (this.qualityGate) {
                const qualityCheck = await this.qualityGate.validateInsight(insight);
                if (!qualityCheck.passed) {
                    log.warn('Insight failed quality check', { 
                        conversationId, 
                        source, 
                        reason: qualityCheck.reason 
                    });
                    return false;
                }
            }

            const enhancedInsight = {
                ...insight,
                timestamp: Date.now(),
                source,
                type: insight.type || 'general',
                id: `${conversationId}-insight-${currentInsights.length}`
            };

            currentInsights.push(enhancedInsight);
            
            log.debug('Added insight', { 
                conversationId, 
                insightId: enhancedInsight.id,
                totalInsights: currentInsights.length 
            });
            
            log.event.complete(eventId, 'completed', { insightId: enhancedInsight.id });
            return enhancedInsight;
        } catch (error) {
            log.error('Failed to add insight', error);
            log.event.complete(eventId, 'failed');
            return false;
        }
    }

    getInsights(conversationId, options = {}) {
        const { 
            limit = null, 
            type = null, 
            source = null 
        } = options;

        let insights = this.insights.get(conversationId) || [];
        
        if (type || source) {
            insights = insights.filter(insight => {
                if (type && insight.type !== type) return false;
                if (source && insight.source !== source) return false;
                return true;
            });
        }

        return limit ? insights.slice(-limit) : insights;
    }
    
    // Store insights every reseponse from the responses in the InsightManager
    async storeInsights(conversationId, plan, responses, collaboration, summary) {
        for (const response of responses) {
            await this.addInsight(
                conversationId, 
                {
                    content: response.content,
                    type: 'response'
                },
                'response-phase'
            );
        }

        // Store insights from the collaboration in the InsightManager
        for (const insight of collaboration.collaborativeResponses) {
            await this.addInsight(
                conversationId,
                {
                    content: insight.content,
                    type: 'collaboration'
                },
                'collaboration-phase'
            );
        }

        // Store insights from the summary in the InsightManager
        await this.addInsight(
            conversationId, 
            {
                content: summary,
                type: 'summary'
            },
            'summary-phase'
        );
    }

    getRecentInsights(conversationId, limit = 5) {
        return this.getInsights(conversationId, { limit });
    }
}