import { log } from '../../../utils/logger.js';
import { Phase } from './base.js';

export class SummaryPhase extends Phase {
    constructor(coordinator) {
        super(coordinator, 'SummaryPhase');
    }

    async execute(conversation, director) {
        return this.executeWithLogging(
            async () => {
                
                this.coordinator.notifyManager.notifyThinking('director-1', 'synthesizing');
                
                const finalSummary = await this.executeWithRetry({
                    operation: async () => {
                        return director.synthesizeDiscussion(conversation.messages);
                    },
                    qualityCheck: async (summary) => {
                        // Custom quality check for summaries
                        return this.coordinator.qualityGate.checkSummaryQuality(
                            summary,
                            conversation.messages
                        );
                    },
                    agentId: 'director-1',
                    task: 'synthesizing discussion',
                    metadata: { 
                        conversationId: conversation.id,
                        messageCount: conversation.messages.length
                    }
                });

                if (finalSummary) {
                    const summaryResponse = {
                        agentId: 'director-1',
                        role: 'Summary',
                        content: finalSummary,
                        timestamp: Date.now()
                    };
                    
                    this.coordinator.notifyManager.notifyResponse(summaryResponse);
                }

                return finalSummary;
            },
            {
                conversationId: conversation.id,
                messageCount: conversation.messages.length
            }
        );
    }
} 