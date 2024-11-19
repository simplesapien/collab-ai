import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class LogAnalyzer {
    constructor(logPath = path.join(__dirname, '../../logs')) {
        this.logPath = logPath;
    }

    async analyzeAllLogs() {
        const [stateLog, eventsLog, performanceLog, qualityLog] = await Promise.all([
            this.readLogFile('state.log'),
            this.readLogFile('events.log'),
            this.readLogFile('performance.log'),
            this.readLogFile('quality.log')
        ]);

        return {
            performance: await this.analyzePerformance(performanceLog),
            events: await this.analyzeEvents(eventsLog),
            states: await this.analyzeStateChanges(stateLog),
            quality: await this.analyzeQualityMetrics(qualityLog)
        };
    }

    async readLogFile(filename) {
        try {
            const content = await fs.readFile(path.join(this.logPath, filename), 'utf8');
            return content.split('\n')
                .map(line => this.parseLogLine(line))
                .filter(entry => entry !== null);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log(chalk.yellow(`Note: ${filename} not found or empty`));
                return [];
            }
            throw error;
        }
    }

    parseLogLine(line) {
        try {
            if (!line.trim()) return null;

            // Handle JSON objects
            if (line.trim().startsWith('{')) {
                return JSON.parse(line);
            }

            // Parse timestamped log entries
            const match = line.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \[(EVENT|STATE|PERF)\] (?:\((.*?)\))?(.*)/);
            if (match) {
                const [_, timestamp, type, source, content] = match;
                return {
                    timestamp,
                    type,
                    source: source || 'unknown',
                    content: content.trim()
                };
            }

            return null;
        } catch (e) {
            return null;
        }
    }

    async analyzePerformance(logs = []) {
        const perfMetrics = [];
        
        for (const log of logs) {
            // Look for PERF entries with operation details
            if (log && log.type === 'PERF') {
                let duration = 0;
                let operation = null;
                let location = log.source || 'unknown';
                
                // Get duration from bracketed time
                const durationMatch = log.content.match(/\[(\d+)ms\]/);
                if (durationMatch) {
                    duration = parseInt(durationMatch[1]);
                }
                
                // Extract operation and other details from JSON content
                const jsonMatch = log.content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        const jsonContent = JSON.parse(jsonMatch[0]);
                        
                        // Get operation name
                        if (jsonContent.operation) {
                            operation = jsonContent.operation;
                        } else if (log.content.includes('Event Chain Performance')) {
                            operation = 'event-chain';
                        } else if (log.content.includes('Performance Measurement')) {
                            // Extract operation from the file path
                            const fileMatch = log.source?.match(/([^/]+)\.js/);
                            operation = fileMatch ? `${fileMatch[1]}-operation` : 'unknown-operation';
                        }
                        
                        // If no duration from brackets, try to get it from JSON
                        if (!duration && jsonContent.duration) {
                            duration = parseInt(jsonContent.duration);
                        }
                        
                        // Get additional metadata
                        if (jsonContent.messageCount) {
                            operation = 'message-processing';
                        } else if (jsonContent.inputTokens) {
                            operation = 'token-processing';
                        }
                    } catch (e) {
                        console.error('Error parsing JSON:', e);
                    }
                }
                
                // Skip event chain performance summaries
                if (log.content.includes('Event Chain Performance') && 
                    logs[logs.indexOf(log) + 1]?.handlerCount !== undefined) {
                    continue;
                }
                
                if (duration > 0) {
                    perfMetrics.push({
                        operation: operation || 'unknown-operation',
                        location,
                        duration,
                        timestamp: log.timestamp
                    });
                }
            }
        }

        // Sort by duration descending
        const sortedMetrics = [...perfMetrics].sort((a, b) => b.duration - a.duration);

        // Calculate statistics by operation
        const operationStats = {};
        perfMetrics.forEach(metric => {
            const key = metric.operation;
            if (!operationStats[key]) {
                operationStats[key] = {
                    operation: key,
                    location: metric.location,
                    totalDuration: 0,
                    count: 0
                };
            }
            operationStats[key].totalDuration += metric.duration;
            operationStats[key].count++;
        });

        const averageByOperation = Object.values(operationStats)
            .map(stat => ({
                operation: stat.operation,
                location: stat.location,
                averageDuration: Math.round(stat.totalDuration / stat.count),
                count: stat.count,
                totalTime: stat.totalDuration
            }))
            .sort((a, b) => b.averageDuration - a.averageDuration);

        return {
            slowestOperations: sortedMetrics.slice(0, 10),
            averageByOperation,
            totalOperations: perfMetrics.length,
            totalDuration: perfMetrics.reduce((sum, m) => sum + m.duration, 0)
        };
    }

    async analyzeStateChanges(logs = []) {
        const stateChanges = [];
        
        for (let i = 0; i < logs.length; i++) {
            const log = logs[i];
            // Look specifically for [STATE] entries
            if (log && log.content && log.content.includes('State Change in')) {
                const nextLine = logs[i + 1];
                if (nextLine) {
                    try {
                        const stateData = typeof nextLine === 'string' ? 
                            JSON.parse(nextLine) : nextLine;
                        
                        stateChanges.push({
                            component: stateData.component || 'unknown',
                            fromState: stateData.from || 'unknown',
                            toState: stateData.to || 'unknown',
                            timestamp: log.timestamp,
                            metadata: stateData.metadata || {}
                        });
                    } catch (e) {
                        // Skip malformed state entries
                        continue;
                    }
                }
            }
        }

        return {
            recentStateChanges: stateChanges.slice(-10),
            stateTransitions: this.calculateStateTransitions(stateChanges),
            componentChanges: this.groupByComponent(stateChanges),
            totalStateChanges: stateChanges.length
        };
    }

    async analyzeEvents(logs = []) {
        const events = [];
        
        for (let i = 0; i < logs.length; i++) {
            const log = logs[i];
            if (log.type === 'EVENT') {
                const match = log.content.match(/Event Emitted: (\w+)/);
                if (match) {
                    const nextLine = logs[i + 1];
                    events.push({
                        eventName: match[1],
                        source: log.source,
                        timestamp: log.timestamp,
                        payload: nextLine && nextLine.payload ? nextLine.payload : {},
                        metadata: nextLine && nextLine.metadata ? nextLine.metadata : {}
                    });
                }
            }
        }

        return {
            recentEvents: events.slice(-10),
            eventsBySource: this.groupByField(events, 'source'),
            eventTypes: this.calculateFrequency(events, 'eventName'),
            totalEvents: events.length
        };
    }

    calculateStateTransitions(states) {
        return states.reduce((acc, state) => {
            const key = `${state.fromState} → ${state.toState}`;
            if (!acc[key]) acc[key] = 0;
            acc[key]++;
            return acc;
        }, {});
    }

    groupByComponent(items) {
        return items.reduce((acc, item) => {
            const key = item.component;
            if (!acc[key]) acc[key] = [];
            acc[key].push(item);
            return acc;
        }, {});
    }

    calculateAverages(metrics) {
        const sums = {};
        const counts = {};
        
        metrics.forEach(metric => {
            if (!sums[metric.operation]) {
                sums[metric.operation] = 0;
                counts[metric.operation] = 0;
            }
            sums[metric.operation] += metric.duration;
            counts[metric.operation]++;
        });

        return Object.keys(sums).map(operation => ({
            operation,
            averageDuration: Math.round(sums[operation] / counts[operation]),
            count: counts[operation]
        }));
    }

    groupByField(items, field) {
        return items.reduce((acc, item) => {
            const key = item[field];
            if (!acc[key]) acc[key] = 0;
            acc[key]++;
            return acc;
        }, {});
    }

    calculateFrequency(items, field) {
        return items.reduce((acc, item) => {
            const key = item[field];
            if (!acc[key]) acc[key] = 0;
            acc[key]++;
            return acc;
        }, {});
    }

    async analyzeQualityMetrics(logs = []) {
        const qualityChecks = [];
        
        for (let i = 0; i < logs.length; i++) {
            const log = logs[i];
            // Look for quality check events
            if (log && log.content && log.content.includes('Event Emitted: performQualityCheck')) {
                const nextLine = logs[i + 1];
                if (nextLine && nextLine.payload) {
                    qualityChecks.push({
                        component: log.source,
                        timestamp: log.timestamp,
                        check: 'qualityCheck',
                        result: nextLine.payload.result || 'unknown',
                        metadata: {
                            ...nextLine.payload,
                            ...nextLine.metadata
                        }
                    });
                }
            }
            
            // Also look for quality gate events
            if (log && log.source && log.source.includes('QualityGate')) {
                const nextLine = logs[i + 1];
                if (nextLine && nextLine.steps) {
                    const completion = nextLine.steps.find(step => step.action === 'complete');
                    if (completion) {
                        qualityChecks.push({
                            component: log.source,
                            timestamp: log.timestamp,
                            check: log.content.includes('init') ? 'initialization' : 'runtime',
                            result: completion.status || 'unknown',
                            metadata: completion.metadata || {}
                        });
                    }
                }
            }
        }

        // Group checks by result status
        const resultsByStatus = qualityChecks.reduce((acc, check) => {
            const status = check.result;
            if (!acc[status]) acc[status] = 0;
            acc[status]++;
            return acc;
        }, {});

        // Group checks by component
        const checksByComponent = qualityChecks.reduce((acc, check) => {
            const component = check.component;
            if (!acc[component]) acc[component] = [];
            acc[component].push(check);
            return acc;
        }, {});

        return {
            recentChecks: qualityChecks.slice(-10),
            checksByComponent,
            resultsByStatus,
            totalChecks: qualityChecks.length,
            checkFrequency: this.calculateFrequency(qualityChecks, 'check')
        };
    }

    // Helper method to parse event chains
    parseEventChain(eventData) {
        if (!eventData || !eventData.steps) return null;
        
        return {
            name: eventData.name,
            duration: this.calculateChainDuration(eventData.steps),
            status: this.getChainStatus(eventData.steps),
            metadata: this.mergeChainMetadata(eventData.steps)
        };
    }

    calculateChainDuration(steps) {
        if (!steps || steps.length < 2) return 0;
        const start = steps[0].timestamp;
        const end = steps[steps.length - 1].timestamp;
        return end - start;
    }

    getChainStatus(steps) {
        const completion = steps.find(step => step.action === 'complete');
        return completion ? completion.status : 'unknown';
    }

    mergeChainMetadata(steps) {
        return steps.reduce((acc, step) => {
            if (step.metadata) {
                return { ...acc, ...step.metadata };
            }
            return acc;
        }, {});
    }
}

// Report Generation
async function generateDetailedReport() {
    const analyzer = new LogAnalyzer();
    console.log(chalk.blue('\n🔍 Starting Log Analysis...\n'));

    try {
        const analysis = await analyzer.analyzeAllLogs();
        
        // Performance Analysis
        console.log(chalk.yellow('=== Performance Analysis ==='));
        if (analysis.performance.slowestOperations.length > 0) {
            console.log('\nTop 10 Slowest Operations:');
            console.table(analysis.performance.slowestOperations.map(op => ({
                operation: op.functionName,
                location: op.operation,
                duration: op.duration,
                timestamp: op.timestamp
            })));
            
            console.log('\nOperation Statistics:');
            console.table(analysis.performance.averageByOperation.map(op => ({
                operation: op.functionName,
                location: op.operation,
                averageDuration: op.averageDuration,
                count: op.count,
                totalTime: op.totalTime
            })));
            console.log(`\nTotal Operations: ${analysis.performance.totalOperations}`);
            console.log(`Total Duration: ${analysis.performance.totalDuration}ms`);
        } else {
            console.log(chalk.dim('\nNo performance data available'));
        }

        // Event Analysis
        console.log(chalk.green('\n=== Event Analysis ==='));
        if (analysis.events.totalEvents > 0) {
            console.log('\nMost Recent Events:');
            console.table(analysis.events.recentEvents);
            
            console.log('\nEvents by Source:');
            console.table(Object.entries(analysis.events.eventsBySource)
                .map(([source, count]) => ({ source, count })));
            
            console.log(`\nTotal Events: ${analysis.events.totalEvents}`);
        } else {
            console.log(chalk.dim('\nNo events recorded'));
        }

        // State Changes
        console.log(chalk.cyan('\n=== State Changes ==='));
        if (analysis.states.recentStateChanges.length > 0) {
            console.log('\nRecent State Changes:');
            console.table(analysis.states.recentStateChanges);
            
            console.log('\nState Transitions:');
            console.table(Object.entries(analysis.states.stateTransitions)
                .map(([transition, count]) => ({ transition, count })));
        } else {
            console.log(chalk.dim('\nNo state changes recorded'));
        }

        // Quality Metrics
        console.log(chalk.magenta('\n=== Quality Metrics ==='));
        if (analysis.quality.recentChecks.length > 0) {
            console.log('\nRecent Quality Checks:');
            console.table(analysis.quality.recentChecks);
            
            console.log('\nQuality Results:');
            console.table(Object.entries(analysis.quality.resultsByStatus)
                .map(([result, count]) => ({ result, count })));
        } else {
            console.log(chalk.dim('\nNo quality checks recorded'));
        }

    } catch (error) {
        console.error(chalk.red('\n❌ Error during analysis:'), error);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    generateDetailedReport().catch(console.error);
}

export { LogAnalyzer };