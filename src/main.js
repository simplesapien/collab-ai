// src/main.js
import { Application } from './app.js';
import { Logger } from './utils/logger.js';
import { config } from './config/config.js';
import { ChatInterface } from './ui/chatInterface.js';
import { CostDisplay } from './ui/costDisplay.js';

class Main {
    constructor() {
        this.app = new Application();
        this.ui = null;
        this.costDisplay = null;
    }

    async initialize() {
        try {
            // Set logging level from config
            Logger.setLevel(config.system.logLevel);
            await this.app.initialize();
            
            // Initialize UI after app is ready
            this.ui = new ChatInterface(this.app);
            this.costDisplay = new CostDisplay(this.app);
            
            Logger.info('Main application initialized successfully');
        } catch (error) {
            Logger.error('Failed to initialize main application:', error);
            this.handleError(error);
        }
    }

    handleError(error) {
        Logger.error('Application error:', error);
        if (this.ui) {
            this.ui.appendErrorMessage('An error occurred. Please refresh the page and try again.');
        }
    }
}

// Initialize the application
const main = new Main();
main.initialize().catch(error => main.handleError(error));

// Export for use in frontend
window.app = main.app;