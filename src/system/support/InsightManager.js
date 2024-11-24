import { log } from '../../utils/logger.js';

export class InsightManager {
    constructor(qualityGate = null) {
        this.insights = new Map(); // conversationId -> insights[]
        this.qualityGate = qualityGate;
        
        // Basic patterns for quick insight detection
        this.insightPatterns = {
            comparison: /(?:compared to|versus|similar to|different from)/i,
            conclusion: /(?:therefore|thus|as a result|consequently)/i,
            discovery: /(?:discovered|realized|found that|identified)/i,
            relationship: /(?:relates to|connects with|links to|impacts)/i,
            recommendation: /(?:recommend|suggest|advise|propose)/i
        };
    }

    async addInsight(conversationId, insight, source) {
        try {
            // Ensure conversationId exists
            if (!conversationId) {
                log.debug('No conversationId provided for insight');
                return false;
            }

            // Initialize array if it doesn't exist for this conversation
            if (!this.insights.has(conversationId)) {
                this.insights.set(conversationId, []);
            }

            const currentInsights = this.insights.get(conversationId);

            // Run quick insight detection before storing
            const quickInsights = await this.detectQuickInsights(insight.content);
            if (quickInsights.length > 0) {
                log.debug('Quick insights detected during storage', {
                    count: quickInsights.length,
                    source,
                    contentPreview: insight.content.substring(0, 100)
                });
            }
            else {
                log.debug('No quick insights detected during storage', {
                    source,
                    contentPreview: insight.content.substring(0, 100)
                });
                return false;
            }

            // Quality check if gate is available
            if (this.qualityGate) {
                const qualityCheck = await this.qualityGate.validateInsight(insight);
                if (!qualityCheck.passed) {
                    log.debug('Insight failed quality check', { 
                        conversationId, 
                        source, 
                        reason: qualityCheck.reason 
                    });
                    return false;  // Return here to prevent storing failed insights
                }
            }

            // Only create and store insight if it passed quality check (or no check needed)
            const enhancedInsight = {
                ...insight,
                timestamp: Date.now(),
                source,
                type: insight.type || 'general',
                id: `${conversationId}-insight-${currentInsights.length}`,
                quickInsights: quickInsights
            };

            currentInsights.push(enhancedInsight);
            
            log.debug('Added insight', { 
                conversationId, 
                insightId: enhancedInsight.id,
                totalInsights: currentInsights.length,
                quickInsightsCount: quickInsights.length,
                quickInsights: quickInsights
            });
            
            return enhancedInsight;
        } catch (error) {
            log.error('Failed to add insight', error);
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
    async storeInsights(conversationId, responses, collaboration, summary) {
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

    async detectQuickInsights(message) {
        try {
            const detectedInsights = [];
            const content = typeof message === 'object' ? message.content : message;

            // Check against each pattern
            for (const [type, pattern] of Object.entries(this.insightPatterns)) {
                if (pattern.test(content)) {
                    const insight = {
                        type: `quick_${type}`,
                        content: content,
                        confidence: 0.7, // Default confidence for pattern matches
                        source: 'quick_detection',
                        timestamp: Date.now()
                    };
                    detectedInsights.push(insight);
                }
            }

            log.debug('Quick insights detected', { 
                messagePreview: content.substring(0, 100),
                insightCount: detectedInsights.length 
            });

            return detectedInsights;
        } catch (error) {
            log.error('Quick insight detection failed', error);
            return [];
        }
    }
}