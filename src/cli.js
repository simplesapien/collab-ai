#!/usr/bin/env node
import { Application } from './app.js';
import { Logger } from './utils/logger.js';
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
    }

    async initialize() {
        try {
            // Set logging level from config
            Logger.setLevel(config.system.logLevel);
            
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
            Logger.debug('CLI: Initializing application');
            await this.app.initialize();
            
            // Verify response subscription is working
            const testUnsubscribe = this.app.onResponse(() => {});
            if (typeof testUnsubscribe === 'function') {
                Logger.debug('CLI: Response subscription system verified');
                testUnsubscribe();
            } else {
                Logger.warn('CLI: Response subscription system not working properly');
            }

            console.log(chalk.green('✓ System initialized successfully\n'));

            console.log(chalk.yellow('Available commands:'));
            console.log(chalk.dim('/status  - Show system status'));
            console.log(chalk.dim('/costs   - Show current costs'));
            console.log(chalk.dim('/reset   - Reset cost tracking'));
            console.log(chalk.dim('/quit    - Exit the application'));
            console.log(chalk.dim('Ctrl+C   - Stop current process\n'));
            
            // Set up thinking indicators for each agent
            await this.app.onAgentThinking((agentId, phase) => {
                Logger.debug(`CLI: Agent thinking update:`, { agentId, phase });
                
                // Stop existing spinner for this agent if it exists
                if (this.agentSpinners[agentId]) {
                    this.agentSpinners[agentId].stop();
                }

                const agentColors = {
                    'director-1': chalk.blue,
                    'analyst-1': chalk.green,
                    'critic-1': chalk.yellow,
                    'expert-1': chalk.magenta,
                    'system': chalk.red
                };

                const agentMessages = {
                    'director-1': {
                        thinking: '🤔 Director is analyzing...',
                        planning: '📋 Director is planning...',
                        synthesizing: '🔄 Director is synthesizing...'
                    },
                    'analyst-1': '📊 Analyst is processing...',
                    'critic-1': '🔍 Critic is evaluating...',
                    'expert-1': '👨‍🔬 Expert is formulating...',
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

            // Start the interactive session
            await this.startInteractiveSession();
        } catch (error) {
            Logger.error('Failed to initialize CLI application:', error);
            this.handleError(error);
        }
    }

    async startInteractiveSession() {
        // Add interrupt handler
        let currentProcess = null;
        
        process.on('SIGINT', async () => {
            if (currentProcess) {
                console.log(chalk.yellow('\n\nStopping current process...'));
                // Clean up any spinners
                Object.values(this.agentSpinners || {}).forEach(spinner => spinner.stop());
                currentProcess = null;
                // Add a small delay before showing the next prompt
                setTimeout(() => {
                    console.log(chalk.dim('\nReady for next input...'));
                    this.promptUser();
                }, 500);
            } else {
                console.log(chalk.yellow('\nUse /quit to exit the application'));
                this.promptUser();
            }
        });

        while (true) {
            const { input } = await this.promptUser();

            if (input.toLowerCase() === '/quit') {
                console.log(chalk.yellow('\nGoodbye! 👋\n'));
                process.exit(0);
            }

            // Store the current process promise
            currentProcess = this.handleInput(input);
            try {
                await currentProcess;
            } catch (error) {
                if (error.message !== 'Process interrupted') {
                    this.handleError(error);
                }
            }
            currentProcess = null;
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
        const agentSpinners = {};
        this.agentSpinners = agentSpinners;
        
        try {
            if (input.startsWith('/')) {
                await this.handleCommand(input);
                return;
            }

            // Add debug logging for subscription
            Logger.debug('CLI: Setting up response subscription');
            const unsubscribe = this.app.onResponse(response => {
                Logger.debug('CLI: Received response:', response);
                // Stop the specific agent's spinner if it exists
                if (agentSpinners[response.agentId]) {
                    agentSpinners[response.agentId].stop();
                    delete agentSpinners[response.agentId];
                }
                this.displayAgentResponse(response);
            });

            // Process the message
            const result = await this.app.processUserMessage(
                { content: input },
                this.currentConversationId
            );

            // Update conversation ID if new
            this.currentConversationId = result.conversationId;

            // Add debug logging for cleanup
            Logger.debug('CLI: Cleaning up response subscription');
            unsubscribe();
            // Stop any remaining spinners
            Object.values(agentSpinners).forEach(spinner => spinner.stop());

        } catch (error) {
            // Stop any remaining spinners
            Object.values(agentSpinners).forEach(spinner => spinner.stop());
            this.handleError(error);
        } finally {
            this.agentSpinners = null;
        }
    }

    async handleCommand(command) {
        switch (command.toLowerCase()) {
            case '/status':
                const status = this.app.getSystemStatus();
                console.log('\n' + chalk.cyan('System Status:'));
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
                console.log('\n' + chalk.cyan('Cost Summary:'));
                console.log(chalk.dim('Total Cost:'), `$${Number(costs.totalCost).toFixed(4)}`);
                console.log(chalk.dim('Total Tokens:'), costs.outputTokens + costs.inputTokens);
                console.log();
                break;

            case '/reset':
                await this.app.resetCosts();
                console.log(chalk.green('\n✓ Cost tracking reset\n'));
                break;

            default:
                console.log(chalk.red('\n❌ Unknown command\n'));
        }
    }

    displayAgentResponse(response) {
        Logger.debug('CLI: Displaying agent response:', response);
        const colors = {
            'director-1': chalk.blue,
            'analyst-1': chalk.green,
            'critic-1': chalk.yellow,
            'expert-1': chalk.magenta,
            'system': chalk.red
        };

        const icons = {
            'director-1': '👨‍💼',
            'analyst-1': '📊',
            'critic-1': '🔍',
            'expert-1': '👨‍🔬',
            'system': '⚙️'
        };

        const color = colors[response.agentId] || chalk.white;
        const icon = icons[response.agentId] || '🤖';
        
        // Remove the agent name if it appears at the start of the content
        const agentNames = ['Director:', 'Analyst:', 'Critic:', 'Expert:', 'System:'];
        let content = response.content;
        
        for (const name of agentNames) {
            if (content.startsWith(name)) {
                content = content.substring(name.length).trim();
            }
        }
        
        console.log(`\n${icon} ${color(content)}\n`);
    }

    handleError(error) {
        console.log(chalk.red('\n❌ Error:', error.message, '\n'));
        Logger.error('CLI Error:', error);
    }
}

// Start the CLI
const cli = new CLI();
cli.initialize().catch(error => cli.handleError(error));
