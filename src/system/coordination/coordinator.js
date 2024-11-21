import { log } from '../../utils/winstonLogger.js';
import { PlanningPhase } from './phases/planning.js';
import { ResponsePhase } from './phases/response.js';
import { CollaborationPhase } from './phases/collaboration.js';
import { SummaryPhase } from './phases/summary.js';

export class Coordinator {
    constructor(conversationManager, agentManager, qualityGate, notifyManager) {
        this.conversationManager = conversationManager;
        this.agentManager = agentManager;
        this.qualityGate = qualityGate;
        this.notifyManager = notifyManager;
        this.isProcessing = false;
        this.isCancelled = false;

        this.phases = {
            planning: new PlanningPhase(this),
            response: new ResponsePhase(this),
            collaboration: new CollaborationPhase(this),
            summary: new SummaryPhase(this)
        };
    }

    async coordinateDiscussion(conversationId, message) {
        const eventId = log.event.emit('coordinateDiscussion', 'Coordinator');
        this.isProcessing = true;
        this.isCancelled = false;

        try {
            // Initialize
            const conversation = await this.phases.planning._initializeConversation(conversationId, message);
            const director = await this.phases.planning._getDirector();
            const availableAgents = this.phases.planning._getAvailableAgents(director.id);

            // Execute phases
            const plan = await this.phases.planning.execute(director, message, availableAgents);
            const responses = await this.phases.response.execute(conversation, plan);
            await this.phases.collaboration.execute(conversation, director, responses);
            const summary = await this.phases.summary.execute(conversation, director);

            log.event.complete(eventId, 'completed');
            return { plan: plan.participants, responses, summary };

        } catch (error) {
            log.error('Discussion coordination failed', error);
            log.event.complete(eventId, this.isCancelled ? 'cancelled' : 'failed');
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