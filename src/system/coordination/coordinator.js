import { PlanningPhase } from './phases/planning.js';
import { ResponsePhase } from './phases/response.js';
import { CollaborationPhase } from './phases/collaboration.js';
import { SummaryPhase } from './phases/summary.js';
import { log } from '../../utils/logger.js';

export class Coordinator {
    constructor(conversationManager, agentManager, qualityGate, notifyManager, insightManager) {
        this.conversationManager = conversationManager;
        this.agentManager = agentManager;
        this.qualityGate = qualityGate;
        this.notifyManager = notifyManager;
        this.insightManager = insightManager;
        this.isProcessing = false;
        this.isCancelled = false;

        // Pass insightManager to AgentManager to be passed to the Director
        this.agentManager.insightManager = insightManager;

        this.phases = {
            planning: new PlanningPhase(this),
            response: new ResponsePhase(this),
            collaboration: new CollaborationPhase(this),
            summary: new SummaryPhase(this)
        };
    }

    async coordinateDiscussion(conversationId, message) {
        this.isProcessing = true;
        this.isCancelled = false;

        try {
            // Initialize
            const conversation = await this.phases.planning._initializeConversation(conversationId, message);
            const director = await this.phases.planning._getDirector();
            const availableAgents = this.phases.planning._getAvailableAgents(director.id);

            // Retrieve insights from the InsightManager
            const storedInsights = this.insightManager.getInsights(conversationId);
            log.debug('Stored insights', { storedInsights });

            // Execute phases
            const plan = await this.phases.planning.execute(director, message, availableAgents, storedInsights.length ? storedInsights : null);
            const responses = await this.phases.response.execute(conversation, plan);
            const collaboration = await this.phases.collaboration.execute(conversation, director, responses);
            const summary = await this.phases.summary.execute(conversation, director);

            // Store insights from all phases into the InsightManager
            try {
                await this.insightManager.storeInsights(conversationId, responses, collaboration, summary);
            } catch (error) {
                log.error('Error storing insights', error);
            }

            return { plan: plan.participants, responses, summary };
        } catch (error) {
            log.error('Error in coordinateDiscussion', { error });
            return this.isCancelled ? { responses: [], summary: null, cancelled: true } : null;
        } finally {
            this.isProcessing = false;
            this.isCancelled = false;
        }
    }

    async cancelCurrentProcess() {
        if (this.isProcessing) {
            this.isCancelled = true;
            this.notifyManager.notifyResponse({
                agentId: 'system',
                role: 'System',
                content: 'Process cancelled. Ready for new input.',
                type: 'cancellation',
                timestamp: Date.now()
            });
            this.isProcessing = false;
        }
    }
}