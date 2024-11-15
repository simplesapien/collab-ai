#!/usr/bin/env node
import { Application } from './app.js';
import { Logger } from './utils/logger.js';
import { config } from './config/config.js';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import clear from 'clear';
import figlet from 'figlet';

Logger.initialize();

class CLI {
    constructor() {
        this.app = new Application();
        this.currentConversationId = null;
        this.spinner = ora();
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

            await this.app.initialize();
            console.log(chalk.green('\n✓ System initialized successfully\n'));
            
            // Start the interactive session
            await this.startInteractiveSession();
        } catch (error) {
            Logger.error('Failed to initialize CLI application:', error);
            this.handleError(error);
        }
    }

    async startInteractiveSession() {
        console.log(chalk.yellow('Available commands:'));
        console.log(chalk.dim('/status  - Show system status'));
        console.log(chalk.dim('/costs   - Show current costs'));
        console.log(chalk.dim('/reset   - Reset cost tracking'));
        console.log(chalk.dim('/quit    - Exit the application\n'));

        while (true) {
            const { input } = await inquirer.prompt([{
                type: 'input',
                name: 'input',
                message: 'You:',
                prefix: '🧑'
            }]);

            if (input.toLowerCase() === '/quit') {
                console.log(chalk.yellow('\nGoodbye! 👋\n'));
                process.exit(0);
            }

            await this.handleInput(input);
        }
    }

    async handleInput(input) {
        try {
            if (input.startsWith('/')) {
                await this.handleCommand(input);
                return;
            }

            this.spinner.start('Processing your message...');

            // Set up response listener
            const unsubscribe = this.app.onResponse(response => {
                this.spinner.stop();
                this.displayAgentResponse(response);
            });

            // Process the message
            const result = await this.app.processUserMessage(
                { content: input },
                this.currentConversationId
            );

            // Update conversation ID if new
            this.currentConversationId = result.currentConversationId;

            // Cleanup
            unsubscribe();
            this.spinner.stop();

        } catch (error) {
            this.spinner.stop();
            this.handleError(error);
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
                console.log(chalk.dim('Total Cost:'), `$${costs.totalCost.toFixed(4)}`);
                console.log(chalk.dim('Total Tokens:'), costs.totalTokens);
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
        
        console.log(`\n${icon} ${color(response.content)}\n`);
    }

    handleError(error) {
        console.log(chalk.red('\n❌ Error:', error.message, '\n'));
        Logger.error('CLI Error:', error);
    }
}

// Start the CLI
const cli = new CLI();
cli.initialize().catch(error => cli.handleError(error));
