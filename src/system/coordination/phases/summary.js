import { log } from '../../../utils/winstonLogger.js';
import { Phase } from './base.js';

export class SummaryPhase extends Phase {
    constructor(coordinator) {
        super(coordinator, 'SummaryPhase');
    }

    async execute(conversation, director) {
        return this.executeWithLogging(
            async () => {
                log.info('Starting summary phase:', {
                    conversationId: conversation.id,
                    messageCount: conversation.messages.length
                });

                this.coordinator.notifyManager.notifyThinking('director-1', 'synthesizing');
                
                const finalSummary = await director.synthesizeDiscussion(conversation.messages);

                log.info('Generated summary:', {
                    content: finalSummary,
                    conversationId: conversation.id,
                    length: finalSummary.length
                });

                const summaryResponse = {
                    agentId: 'director-1',
                    role: 'Summary',
                    content: finalSummary,
                    timestamp: Date.now()
                };
                
                this.coordinator.notifyManager.notifyResponse(summaryResponse);
                return finalSummary;
            },
            {
                conversationId: conversation.id,
                messageCount: conversation.messages.length
            }
        );
    }
} 