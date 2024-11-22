import { log } from './logger.js';

export class MessageFormatter {
    static formatMessages(params) {
        const eventId = log.event.emit('formatMessages', 'MessageFormatter', {
            hasSystemPrompt: !!params.systemPrompt,
            contextLength: params.context?.length
        });
        const startTime = Date.now();

        try {
            log.debug('Starting message formatting', {
                hasSystemPrompt: !!params.systemPrompt,
                hasUserPrompt: !!params.userPrompt,
                contextLength: params.context?.length,
                agentType: params.agentType
            });

            const { 
                systemPrompt, 
                userPrompt, 
                context = [], 
                agentType = null,
                modelConfig 
            } = params;

            if (!systemPrompt) {
                log.error('[MessageFormatter] System prompt is missing');
                throw new Error('System prompt is required');
            }

            const sanitizedUserPrompt = userPrompt || '';
            
            try {
                const model = this._getModelForAgent(agentType, modelConfig);
                log.debug('[MessageFormatter] Selected model:', model);
                
                const sanitizedContext = context.map(msg => {
                    try {
                        return {
                            ...msg,
                            content: msg.content || '',
                            agentId: msg.agentId || 'assistant'
                        };
                    } catch (error) {
                        log.error('[MessageFormatter] Error sanitizing context message:', {
                            error,
                            message: msg
                        });
                        return {
                            content: '',
                            agentId: 'assistant'
                        };
                    }
                });

                log.debug('[MessageFormatter] Sanitized context length:', sanitizedContext.length);

                const messages = [
                    { role: "system", content: systemPrompt },
                    ...sanitizedContext.map(msg => {
                        try {
                            return {
                                role: msg.agentId === "user" ? "user" : "assistant",
                                content: msg.content
                            };
                        } catch (error) {
                            log.error('[MessageFormatter] Error mapping context to messages:', {
                                error,
                                message: msg
                            });
                            return {
                                role: "assistant",
                                content: ""
                            };
                        }
                    }),
                    { role: "user", content: sanitizedUserPrompt }
                ].filter(msg => msg.content && msg.content.trim() !== '');

                log.debug('[MessageFormatter] Final formatted message count:', messages.length);

                log.perf.measure('message-formatting', Date.now() - startTime, {
                    messageCount: messages.length,
                    contextSize: sanitizedContext.length
                });

                log.event.complete(eventId, 'completed', {
                    messageCount: messages.length
                });
                return {
                    messages,
                    sanitizedContext,
                    model,
                    systemPrompt,
                    userPrompt: sanitizedUserPrompt
                };

            } catch (error) {
                log.error('[MessageFormatter] Error in message formatting:', {error, params});
                throw new Error(`Failed to format messages: ${error.message}`);
            }

        } catch (error) {
            log.error('[MessageFormatter] Critical error in formatMessages:', {error, params});
            throw error;
        }
    }

    static _getModelForAgent(agentType, modelConfig) {
        try {
            log.debug('Getting model for agent', {
                agentType,
                hasModelConfig: !!modelConfig,
                availableModels: modelConfig?.modelsByAgent
            });

            const { modelsByAgent, defaultModel } = modelConfig;
            
            if (!agentType) {
                log.debug('[MessageFormatter] No agent type, using default model:', defaultModel);
                return defaultModel;
            }
            
            const agentKey = agentType.toLowerCase();
            const selectedModel = modelsByAgent?.[agentKey] || defaultModel;
            
            log.debug('[MessageFormatter] Selected model for agent:', {
                agentType,
                agentKey,
                selectedModel
            });

            return selectedModel;

        } catch (error) {
            log.error('[MessageFormatter] Error getting model for agent:', {
                error,
                agentType,
                modelConfig
            });
            throw new Error(`Failed to get model for agent: ${error.message}`);
        }
    }

    static parseResponse(content) {
        try {
            log.debug('[MessageFormatter] Parsing response:', {
                contentType: typeof content,
                contentLength: content?.length
            });

            if (typeof content !== 'string') {
                log.debug('[MessageFormatter] Content is not a string, returning as-is');
                return content;
            }

            const trimmedContent = content.trim();
            if (trimmedContent.startsWith('{') || trimmedContent.startsWith('[')) {
                try {
                    const parsedContent = JSON.parse(trimmedContent);
                    log.debug('[MessageFormatter] Successfully parsed JSON content');
                    return parsedContent;
                } catch (error) {
                    log.warn('[MessageFormatter] Failed to parse content as JSON:', {
                        error,
                        content: trimmedContent.substring(0, 100) + '...' // Log first 100 chars
                    });
                    return content;
                }
            }
            
            log.debug('[MessageFormatter] Content is not JSON, returning as-is');
            return content;

        } catch (error) {
            log.error('[MessageFormatter] Critical error parsing response:', {
                error,
                contentType: typeof content
            });
            return content; // Return original content on error
        }
    }
} 