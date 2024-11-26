// src/cli.js
import { Application } from './app.js';
import { log } from './utils/logger.js';
import { config } from './config/config.js';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import clear from 'clear';
import figlet from 'figlet';

class CLI {
    constructor() {
        this.app = new Application();
        this.currentConversationId = null;
        this.spinner = ora();
        this.agentSpinners = {};
        this.responseHandler = null;
        
        // Update the color scheme to make system messages stand out
        this.colors = {
            'director-1': chalk.blue,
            'analyst-1': chalk.green,
            'critic-1': chalk.yellow,
            'expert-1': chalk.magenta,
            'quality-gate': chalk.cyan,
            'system': chalk.cyan.bold
        };

        this.icons = {
            'director-1': '👨‍💼',
            'analyst-1': '📊',
            'critic-1': '🔍',
            'expert-1': '👨‍🔬',
            'quality-gate': '🔎',
            'system': '🔄'
        };
    }

    async initialize() {
        try {
            // Clear screen and show welcome message
            clear();
            console.log(
                chalk.cyan(
                    figlet.textSync('Collab AI', { horizontalLayout: 'full' })
                )
            );

            // Add detailed welcome message and instructions
            console.log(chalk.white('\nWelcome to Collab AI - Your Collaborative AI Assistant Team!\n'));
            console.log(chalk.dim('This system provides you with a team of AI agents working together:'));
            console.log(chalk.blue('👨‍💼 Director') + chalk.dim(' - Coordinates the discussion and assigns tasks'));
            console.log(chalk.green('📊 Analyst') + chalk.dim(' - Provides data-driven insights and research'));
            console.log(chalk.yellow('🔍 Critic') + chalk.dim(' - Evaluates ideas and identifies potential issues'));
            console.log(chalk.magenta('👨‍🔬 Expert') + chalk.dim(' - Offers specialized knowledge and solutions\n'));

            console.log(chalk.dim('How to use:'));
            console.log(chalk.dim('1. Simply type your question or topic and press Enter'));
            console.log(chalk.dim('2. Watch as the AI team collaborates to provide comprehensive insights'));
            console.log(chalk.dim('3. Press') + chalk.red(' Ctrl+C ') + chalk.dim('at any time to stop the current process\n'));

            // Add debug logging for app initialization
            log.debug('CLI: Initializing application');
            await this.app.initialize();
            
            // Verify response subscription is working
            const testUnsubscribe = this.app.onResponse(() => {});
            if (typeof testUnsubscribe === 'function') {
                log.debug('CLI: Response subscription system verified');
                testUnsubscribe();
            } else {
                log.debug('CLI: Response subscription system not working properly');
            }

            console.log(`\n${this.icons['system']} ${this.colors['system']('System initialized successfully')}\n`);

            console.log(chalk.yellow('Available commands:'));
            console.log(chalk.dim('/status  - Show system status'));
            console.log(chalk.dim('/costs   - Show current costs'));
            console.log(chalk.dim('/reset   - Reset cost tracking'));
            console.log(chalk.dim('/quit    - Exit the application'));
            console.log(chalk.dim('Ctrl+C   - Stop current process\n'));
            
            // Set up thinking indicators for each agent
            this.app.onAgentThinking((agentId, phase) => {
                log.debug('CLI: Agent thinking update:', { agentId, phase });
                
                // Stop existing spinner for this agent if it exists
                if (this.agentSpinners[agentId]) {
                    this.agentSpinners[agentId].stop();
                }

                const agentColors = {
                    'director-1': chalk.blue,
                    'analyst-1': chalk.green,
                    'critic-1': chalk.yellow,
                    'expert-1': chalk.magenta,
                    'quality-gate': chalk.cyan,
                    'system': chalk.red
                };

                const agentMessages = {
                    'director-1': {
                        thinking: '🤔 Director is analyzing...',
                        planning: '📋 Director is planning...',
                        synthesizing: '🔄 Director is synthesizing...',
                        reviewing: '👀 Director is reviewing responses...'
                    },
                    'analyst-1': '📊 Analyst is processing...',
                    'critic-1': '🔍 Critic is evaluating...',
                    'expert-1': '👨‍🔬 Expert is formulating...',
                    'quality-gate': {
                        reviewing: '🔎 Quality Gate is reviewing responses...',
                        evaluating: '⚖️ Quality Gate is evaluating quality...'
                    },
                    'system': '⚙️ System is processing...'
                };

                let message;
                if (typeof agentMessages[agentId] === 'string') {
                    message = agentMessages[agentId];
                } else if (agentMessages[agentId] && phase) {
                    message = agentMessages[agentId][phase] || `${agentId} is ${phase}...`;
                } else {
                    message = `${agentId} is processing...`;
                }

                const color = agentColors[agentId] || chalk.white;
                this.agentSpinners[agentId] = ora({
                    text: color(message),
                    spinner: 'dots'
                }).start();
            });

            // Set up the single response handler
            this.responseHandler = (response) => {
                log.debug('CLI: Received response:', response);
                
                // Clear spinner BEFORE handling the response
                if (this.agentSpinners[response.agentId]) {
                    this.agentSpinners[response.agentId].stop();
                    delete this.agentSpinners[response.agentId];
                }

                // Handle different response types
                switch (response.type) {
                    case 'error':
                        this.handleError(response.error);
                        break;
                    case 'state-update':
                        this.updateAgentState(response);
                        break;
                    default:
                        this.displayAgentResponse(response);
                }
            };

            // Set up the single subscription
            this.cleanup = this.app.onResponse(this.responseHandler);

            // Start the interactive session
            await this.startInteractiveSession();
        } catch (error) {
            log.error('Failed to initialize CLI application:', error);
            this.handleError(error);
        }
    }

    async startInteractiveSession() {
        let currentProcess = null;
        
        process.on('SIGINT', async () => {
            if (currentProcess) {
                process.stdout.clearLine();
                process.stdout.cursorTo(0);
                console.log(`\n${this.icons['system']} ${this.colors['system']('Stopping current process...')}`);
                
                Object.values(this.agentSpinners || {}).forEach(spinner => {
                    spinner.stop();
                    spinner.clear();
                });
                this.agentSpinners = {};
                
                await this.app.cancelCurrentProcess();
                currentProcess = null;
            } else {
                console.log(`\n${this.icons['system']} ${this.colors['system']('Goodbye! 👋')}\n`);
                process.exit(0);
            }
        });

        try {
            while (true) {
                try {
                    const { input } = await this.promptUser();

                    if (input?.toLowerCase() === '/quit') {
                        console.log(`\n${this.icons['system']} ${this.colors['system']('Goodbye! 👋')}\n`);
                        process.exit(0);
                    }

                    currentProcess = this.handleInput(input);
                    await currentProcess;
                    currentProcess = null;
                } catch (error) {
                    if (error?.message?.includes('User force closed')) {
                        console.log(`\n${this.icons['system']} ${this.colors['system']('Goodbye! 👋')}\n`);
                        process.exit(0);
                    }
                    
                    if (error.message !== 'Process interrupted') {
                        this.handleError(error);
                    }
                }
            }
        } catch (error) {
            if (!error?.message?.includes('User force closed')) {
                this.handleError(error);
            }
            console.log(`\n${this.icons['system']} ${this.colors['system']('Goodbye! 👋')}\n`);
            process.exit(0);
        }
    }

    promptUser() {
        return inquirer.prompt([{
            type: 'input',
            name: 'input',
            message: 'You:',
            prefix: '🧑'
        }]);
    }

    async handleInput(input) {
        this.agentSpinners = {};
        
        try {
            if (input.startsWith('/')) {
                await this.handleCommand(input);
                return;
            }

            const result = await this.app.processUserMessage(
                { content: input },
                this.currentConversationId
            );

            this.currentConversationId = result.conversationId;

        } catch (error) {
            // Clear all spinners on error
            Object.values(this.agentSpinners).forEach(spinner => spinner.stop());
            this.handleError(error);
        } finally {
            // Clear all spinners and reset
            Object.values(this.agentSpinners).forEach(spinner => spinner.stop());
            this.agentSpinners = {};
        }
    }

    async handleCommand(command) {
        switch (command.toLowerCase()) {
            case '/status':
                const status = this.app.getSystemStatus();
                console.log(`\n${this.icons['system']} ${this.colors['system']('System Status:')}`);
                console.log(chalk.dim('Active Conversations:'), status.activeConversations);
                console.log(chalk.dim('Uptime:'), `${Math.floor(status.uptime / 60)} minutes`);
                console.log(chalk.dim('Active Agents:'));
                status.agents.forEach(agent => {
                    console.log(`  ${chalk.blue(agent.name)} (${agent.status})`);
                });
                console.log();
                break;

            case '/costs':
                const costs = await this.app.getCostSummary();
                console.log(`\n${this.icons['system']} ${this.colors['system']('Cost Summary:')}`);
                console.log(chalk.dim('Total Cost:'), `$${Number(costs.totalCost).toFixed(4)}`);
                console.log(chalk.dim('Total Tokens:'), costs.outputTokens + costs.inputTokens);
                console.log();
                break;

            case '/reset':
                await this.app.resetCosts();
                console.log(`\n${this.icons['system']} ${this.colors['system']('Cost tracking reset')}\n`);
                break;

            default:
                console.log(`\n${this.icons['system']} ${this.colors['system']('Unknown command')}\n`);
        }
    }

    displayAgentResponse(response) {
        // Don't display responses if we're in the process of cancelling
        if (this.app.isCancelling) {
            return;
        }

        log.debug('CLI: Displaying agent response:', response);
        
        // Special handling for system cancellation messages
        if (response.type === 'cancellation' || 
            (response.type === 'system' && response.content.includes('cancelled'))) {
            console.log(`\n${this.icons['system']} ${this.colors['system'](response.content)}\n`);
            return;
        }

        // Special handling for round updates
        if (response.type === 'round-update') {
            console.log(chalk.dim('\n' + response.content + '\n'));
            return;
        }

        const color = this.colors[response.agentId] || chalk.white;
        const icon = this.icons[response.agentId] || '🤖';
        
        // Remove the agent name if it appears at the start of the content
        const agentNames = ['Director:', 'Analyst:', 'Critic:', 'Expert:', 'Quality Gate:', 'System:'];
        let content = response.content;
        
        for (const name of agentNames) {
            if (content.startsWith(name)) {
                content = content.substring(name.length).trim();
            }
        }

        // Add special formatting for quality feedback
        if (response.agentId === 'quality-gate') {
            if (response.passed) {
                console.log(`\n${icon} ${color('✓ Quality Check Passed:')} ${chalk.dim(content)}\n`);
            } else {
                console.log(`\n${icon} ${color('⚠ Quality Check Feedback:')} ${chalk.dim(content)}\n`);
            }
            return;
        }
        
        console.log(`\n${icon} ${color(content)}\n`);
    }

    handleError(error) {
        if (this.app.isCancelling) return;
        if (error?.message?.includes('User force closed')) return;
        
        if (error?.type === 'cancellation' || 
            (typeof error === 'object' && error?.message?.includes('cancelled'))) {
            return;
        }
        
        console.log(`\n❌ ${this.colors['system'](`Error: ${error?.message || 'An unknown error occurred'}`)}\n`);
        log.error('CLI Error:', error);
    }

    // Add new method to handle agent state updates
    updateAgentState(stateUpdate) {
        const { agentId, state } = stateUpdate;
        log.debug('[CLI] Agent state update:', stateUpdate);
        
        // Update display or handle state change as needed
        if (this.agentSpinners[agentId]) {
            this.agentSpinners[agentId].text = `${agentId} is ${state}...`;
        }
    }
}

// Start the CLI
const cli = new CLI();
cli.initialize().catch(error => cli.handleError(error));
