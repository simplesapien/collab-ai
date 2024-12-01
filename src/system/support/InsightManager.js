import { log } from '../../utils/logger.js';

export class InsightManager {
    constructor(qualityGate = null) {
        this.insights = new Map(); // conversationId -> insights[]
        this.qualityGate = qualityGate;
        log.debug('InsightManager initialized', { 
            hasQualityGate: !!qualityGate 
        });
    }

    async addInsight(conversationId, insight, source) {
        const startTime = Date.now();
        try {
            if (!conversationId) {
                log.error('No conversationId provided for insight');
                return false;
            }

            if (!insight?.content) {
                log.error('Invalid insight format', { insight });
                return false;
            }

            if (!this.insights.has(conversationId)) {
                this.insights.set(conversationId, []);
            }

            const currentInsights = this.insights.get(conversationId);

            // Quality check if gate is available
            if (this.qualityGate) {
                const qualityCheck = await this.qualityGate.validateInsight(insight);
                if (!qualityCheck.passed) {
                    log.debug('Insight failed quality check', { 
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
                source: source || 'unknown',
                type: insight.type || 'general',
                id: `${conversationId}-insight-${currentInsights.length}`
            };

            currentInsights.push(enhancedInsight);
            
            log.debug('Added insight', { 
                conversationId, 
                insightId: enhancedInsight.id,
                totalInsights: currentInsights.length,
                type: enhancedInsight.type,
                source
            });

            log.perf.measure('add-insight', Date.now() - startTime, {
                conversationId,
                source,
                type: enhancedInsight.type
            });
            
            return enhancedInsight;
        } catch (error) {
            log.error('Failed to add insight', error);
            log.perf.measure('add-insight', Date.now() - startTime, {
                error: error.message,
                status: 'failed'
            });
            return false;
        }
    }

    getInsights(conversationId, options = {}) {
        try {
            if (!conversationId) {
                log.error('No conversationId provided for getInsights');
                return [];
            }

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
        } catch (error) {
            log.error('Failed to get insights', error);
            return [];
        }
    }
    
    async storeInsights(conversationId, responses, collaboration, summary) {
        const startTime = Date.now();
        try {
            if (!conversationId) {
                throw new Error('No conversationId provided for storeInsights');
            }

            const storedInsights = [];

            // Store response insights
            if (Array.isArray(responses)) {
                for (const response of responses) {
                    const insight = await this.addInsight(
                        conversationId, 
                        {
                            content: response.content,
                            type: 'response'
                        },
                        'response-phase'
                    );
                    if (insight) storedInsights.push(insight);
                }
            }

            // Store collaboration insights
            if (collaboration?.collaborativeResponses) {
                for (const insight of collaboration.collaborativeResponses) {
                    const stored = await this.addInsight(
                        conversationId,
                        {
                            content: insight.content,
                            type: 'collaboration'
                        },
                        'collaboration-phase'
                    );
                    if (stored) storedInsights.push(stored);
                }
            }

            // Store summary insight
            if (summary) {
                const summaryInsight = await this.addInsight(
                    conversationId, 
                    {
                        content: summary,
                        type: 'summary'
                    },
                    'summary-phase'
                );
                if (summaryInsight) storedInsights.push(summaryInsight);
            }

            log.perf.measure('store-insights', Date.now() - startTime, {
                conversationId,
                storedCount: storedInsights.length
            });

            return storedInsights;
        } catch (error) {
            log.error('Failed to store insights', error);
            log.perf.measure('store-insights', Date.now() - startTime, {
                error: error.message,
                status: 'failed'
            });
            return [];
        }
    }

    getRecentInsights(conversationId, limit = 5) {
        return this.getInsights(conversationId, { limit });
    }
}