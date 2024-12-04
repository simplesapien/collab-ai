import { log } from '../../utils/logger.js';

export class InsightManager {
    constructor(qualityGate = null, llmService = null) {
        this.insights = new Map();
        this.qualityGate = qualityGate;
        this.llmService = llmService;
    }

    async addInsight(conversationId, insight) {
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

            const enhancedInsight = {
                ...insight,
                timestamp: Date.now(),
                type: insight.type || 'general',
                id: `${conversationId}-insight-${currentInsights.length}`
            };

            currentInsights.push(enhancedInsight);

            return enhancedInsight;
        } catch (error) {
            log.error('Failed to add insight', error);
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

            return storedInsights;
        } catch (error) {
            log.error('Failed to store insights', error);
            return [];
        }
    }

    async extractAndStoreInsight(conversationId, message) {
        try {
            if (!message?.content) {
                log.error('No message content provided for insight extraction');
                return [];
            }

            const systemPrompt = `
                You are an expert at extracting key insights from messages.

                An insight should be:
                - A specific, meaningful piece of information
                - Potentially useful for future conversations
                - Clear and self-contained

                Categories of insights:
                - USER_NEED: Specific requirements or problems stated
                - TECHNICAL: Technical details or constraints
                - CONTEXT: Important background or domain information
                - PREFERENCE: User preferences or priorities

                Return a JSON array where each insight has:
                {
                    "content": "Clear statement of the insight",
                    "type": "One of: USER_NEED, TECHNICAL, CONTEXT, PREFERENCE",
                    "confidence": 0-1 score of certainty
                }`;

            const response = await this.llmService.makeModelRequest({
                systemPrompt: systemPrompt,
                userPrompt: `Extract key insights from this message. /n Message: ${message.content}`,
                context: [message.content],
                agentType: this.role,
                forceJsonResponse: true
            });

            const insights = Array.isArray(response) ? response : [response];
            const validInsights = [];
            
            for (const insight of insights) {

                // Check quality of insight
                const qualityCheck = await this.qualityGate.validateInsight(insight);

                // Store insight if it passes quality gate
                if (qualityCheck) {
                const stored = await this.addInsight(
                    conversationId,
                    {
                        content: insight.content,
                        type: insight.type.toLowerCase(),
                        confidence: insight.confidence
                    },
                        'message-insight'
                    );

                    if (stored) {
                        validInsights.push(stored);
                        log.insight.store(conversationId, stored);
                    }
                } 
                else {
                    log.debug('Quality check failed', { qualityCheck }, { insightContent: insight.content });
                }
            }

            return validInsights;

        } catch (error) {
            log.error('Failed to extract insights', error);
            return [];
        }
    }

    getRecentInsights(conversationId, limit = 5) {
        return this.getInsights(conversationId, { limit });
    }
}
