import { Logger } from '../utils/logger.js';

export class CostDisplay {
    constructor(app) {
        this.app = app;
        this.element = null;
        this.initialize();
    }

    async initialize() {
        // Create cost display element
        this.element = document.createElement('div');
        this.element.className = 'cost-display';
        this.element.innerHTML = `
            <h3>API Costs</h3>
            <div class="cost-details">
                <p>Input Tokens: <span id="input-tokens">0</span></p>
                <p>Output Tokens: <span id="output-tokens">0</span></p>
                <p>Total Cost: $<span id="total-cost">0.00</span></p>
            </div>
            <button id="reset-costs">Reset Costs</button>
        `;

        // Add to DOM
        document.body.appendChild(this.element);

        // Subscribe to cost updates
        const llmService = this.app.systemCoordinator.getLLMService();
        llmService.costTracker.onCostUpdate(costs => this.updateDisplay(costs));
        
        // Setup reset button
        document.getElementById('reset-costs').addEventListener('click', async () => {
            await this.app.resetCosts();
            await this.updateDisplay();
        });

        // Initial update
        await this.updateDisplay();
    }

    async updateDisplay(costs) {
        try {
            // Initialize with default values
            const defaultCosts = {
                inputTokens: 0,
                outputTokens: 0,
                totalCost: '0.000000'
            };
            
            // Use provided costs or try to get from app, fallback to defaults
            const displayCosts = costs || (await this.app.getCostSummary()) || defaultCosts;
            
            document.getElementById('input-tokens').textContent = displayCosts.inputTokens.toLocaleString();
            document.getElementById('output-tokens').textContent = displayCosts.outputTokens.toLocaleString();
            document.getElementById('total-cost').textContent = parseFloat(displayCosts.totalCost).toFixed(6);
        } catch (error) {
            Logger.error('[CostDisplay] Error updating display:', error);
        }
    }
} 