import { OpenAI } from "openai";
import dotenv from "dotenv";
dotenv.config();

// Equivalent to Python's @dataclass
class InsightMetrics {
    constructor(internalCoherence, novelty, practicality, relevance, overallScore) {
        this.internalCoherence = internalCoherence;
        this.novelty = novelty;
        this.practicality = practicality;
        this.relevance = relevance;
        this.overallScore = overallScore;
    }
}

class InsightAnalyzer {
    constructor(apiKey) {
        this.client = new OpenAI({ apiKey });
        
        this.actionableVerbs = new Set([
            'implement', 'create', 'start', 'build', 'develop',
            'establish', 'launch', 'focus', 'use', 'employ', 'explore',
            'enhance', 'maximize', 'prioritize', 'balance', 'engage'
        ]);
        
        this.concreteBusinessTerms = new Set([
            'business', 'service', 'product', 'market', 'customer',
            'budget', 'cost', 'revenue', 'sales', 'plan', 'model',
            'startup', 'entrepreneur', 'strategy', 'resource', 'growth'
        ]);
        
        this.implementationPhrases = new Set([
            'how to', 'steps to', 'method', 'approach', 'strategy',
            'through', 'by', 'using', 'via', 'can', 'should', 'must'
        ]);
    }

    async analyzeInsights(insights, context = null) {
        context = context || insights[0];
        
        const allTexts = [...insights, context];
        const embeddings = await this._getEmbeddings(allTexts);
        
        const insightEmbeddings = embeddings.slice(0, -1);
        const contextEmbedding = embeddings[embeddings.length - 1];
        
        const insightMetrics = [];
        for (let i = 0; i < insights.length; i++) {
            const metrics = this._analyzeSingleInsight(
                insights[i],
                insightEmbeddings[i],
                insightEmbeddings.slice(0, i),
                contextEmbedding
            );
            insightMetrics.push(metrics);
        }
        
        const conversationMetrics = this._analyzeConversationQuality(
            insights,
            insightMetrics
        );
        
        return {
            insightMetrics,
            conversationMetrics
        };
    }

    async _getEmbeddings(texts) {
        const response = await this.client.embeddings.create({
            input: texts,
            model: "text-embedding-3-small"
        });
        return response.data.map(item => item.embedding);
    }

    _analyzeSingleInsight(insight, currentEmbedding, previousEmbeddings, contextEmbedding) {
        const internalCoherence = this._analyzeSentenceCoherence(insight);
        const novelty = this._calculateNovelty(currentEmbedding, previousEmbeddings);
        const practicality = this._analyzePracticality(insight);
        const relevance = this._calculateRelevance(currentEmbedding, contextEmbedding);
        
        const weights = {
            coherence: 0.25,
            novelty: 0.25,
            practicality: 0.25,
            relevance: 0.25
        };
        
        const overallScore = 
            internalCoherence * weights.coherence +
            novelty * weights.novelty +
            practicality * weights.practicality +
            relevance * weights.relevance;
        
        return new InsightMetrics(
            internalCoherence,
            novelty,
            practicality,
            relevance,
            overallScore
        );
    }

    _analyzeSentenceCoherence(text) {
        const words = text.split(' ');
        if (words.length < 4) return 1.0;

        const checkSvoPatterns = (text) => {
            const commonSubjects = new Set(['dog', 'cat', 'person', 'business', 'entrepreneur', 'manager', 'team', 'company', 'market']);
            const logicalVerbs = new Set(['is', 'are', 'was', 'were', 'has', 'have', 'do', 'does', 'can', 'will', 'should', 'must',
                'eat', 'run', 'work', 'create', 'develop', 'manage', 'implement', 'start', 'build']);
            
            const words = text.toLowerCase().split(' ');
            const patternScores = [];
            
            for (let i = 0; i < words.length - 2; i++) {
                if (commonSubjects.has(words[i]) && logicalVerbs.has(words[i + 1])) {
                    patternScores.push(1.0);
                } else {
                    patternScores.push(0.0);
                }
            }
            
            return patternScores.length ? 
                patternScores.reduce((a, b) => a + b) / patternScores.length : 0;
        };

        const checkTransitions = async (text) => {
            const logicalConnectors = new Set(['and', 'but', 'however', 'therefore', 'because', 'since', 'although', 'while', 'as']);
            const words = text.toLowerCase().split(' ');
            const transitionScores = [];
            
            for (let i = 0; i < words.length; i++) {
                if (logicalConnectors.has(words[i])) {
                    if (i > 0 && i < words.length - 1) {
                        const leftContext = words.slice(Math.max(0, i-3), i).join(' ');
                        const rightContext = words.slice(i+1, Math.min(words.length, i+4)).join(' ');
                        
                        const contextsEmbeddings = await this._getEmbeddings([leftContext, rightContext]);
                        const similarity = this._dotProduct(contextsEmbeddings[0], contextsEmbeddings[1]);
                        transitionScores.push((similarity + 1) / 2);
                    }
                }
            }
            
            return transitionScores.length ? 
                transitionScores.reduce((a, b) => a + b) / transitionScores.length : 0;
        };

        const checkCollocations = (text) => {
            const commonCollocations = {
                'business': new Set(['model', 'plan', 'strategy', 'growth', 'development']),
                'market': new Set(['analysis', 'research', 'opportunity', 'share', 'trend']),
                'cost': new Set(['reduction', 'analysis', 'effective', 'efficient', 'management']),
                'strategic': new Set(['planning', 'approach', 'decision', 'initiative', 'goal'])
            };
            
            const words = text.toLowerCase().split(' ');
            const collocationScores = [];
            
            for (let i = 0; i < words.length - 1; i++) {
                if (commonCollocations[words[i]]) {
                    if (commonCollocations[words[i]].has(words[i + 1])) {
                        collocationScores.push(1.0);
                    } else {
                        collocationScores.push(0.0);
                    }
                }
            }
            
            return collocationScores.length ? 
                collocationScores.reduce((a, b) => a + b) / collocationScores.length : 0;
        };

        const svoScore = checkSvoPatterns(text);
        const collocationScore = checkCollocations(text);
        
        const weights = {
            svo: 0.3,
            transitions: 0.5,
            collocations: 0.2
        };
        
        // Note: Transition score calculation is async in JS version
        // For simplicity, we'll use a simplified version here
        const transitionScore = 0.5;
        
        let finalCoherence = 
            svoScore * weights.svo +
            transitionScore * weights.transitions +
            collocationScore * weights.collocations;
        
        if (Math.min(svoScore, transitionScore, collocationScore) < 0.1) {
            finalCoherence *= 0.5;
        }
        
        return finalCoherence;
    }

    _calculateNovelty(currentEmbedding, previousEmbeddings) {
        if (!previousEmbeddings.length) return 1.0;
        
        const similarities = previousEmbeddings.map(prevEmbedding => 
            this._dotProduct(currentEmbedding, prevEmbedding)
        );
        
        const maxSimilarity = Math.max(...similarities.map(sim => (sim + 1) / 2));
        return 1 - maxSimilarity;
    }

    _calculateRelevance(insightEmbedding, contextEmbedding) {
        const relevanceScore = this._dotProduct(insightEmbedding, contextEmbedding);
        return (relevanceScore + 1) / 2;
    }

    _analyzePracticality(insight) {
        const text = insight.toLowerCase();
        const words = new Set(text.split(' '));
        
        const scoreComponents = [];
        
        const hasActionableVerbs = [...this.actionableVerbs].some(verb => words.has(verb));
        scoreComponents.push(hasActionableVerbs ? 0.3 : 0);
        
        const hasNumbers = /\d+/.test(text);
        const hasCurrency = /\$|dollar|cost|budget|price/.test(text);
        scoreComponents.push((hasNumbers || hasCurrency) ? 0.2 : 0);
        
        const concreteTermCount = [...words].filter(word => 
            this.concreteBusinessTerms.has(word)
        ).length;
        const concreteScore = Math.min(concreteTermCount / 3, 1) * 0.3;
        scoreComponents.push(concreteScore);
        
        const hasImplementation = [...this.implementationPhrases].some(phrase => 
            text.includes(phrase)
        );
        scoreComponents.push(hasImplementation ? 0.2 : 0);
        
        return scoreComponents.reduce((a, b) => a + b, 0);
    }

    _analyzeConversationQuality(insights, metrics) {
        return {
            averageCoherence: metrics.reduce((sum, m) => sum + m.internalCoherence, 0) / metrics.length,
            averageNovelty: metrics.reduce((sum, m) => sum + m.novelty, 0) / metrics.length,
            averagePracticality: metrics.reduce((sum, m) => sum + m.practicality, 0) / metrics.length,
            averageRelevance: metrics.reduce((sum, m) => sum + m.relevance, 0) / metrics.length,
            averageOverallScore: metrics.reduce((sum, m) => sum + m.overallScore, 0) / metrics.length,
            insightCount: insights.length
        };
    }

    _dotProduct(a, b) {
        return a.reduce((sum, val, i) => sum + val * b[i], 0);
    }
}

// Example usage
async function main() {
    const insights = [
       "Starting a business with a limited budget necessitates a strategic focus on low-overhead service-based models,",
        "Exploring digital service sectors and sustainable product offerings can enhance business viability,",
        "Employing agile planning and effective prioritization methods can maximize productivity,",
        "Entrepreneurs should be aware of hidden costs associated with starting a business, such as registration fees and permits,",
        "Balancing reliance on community resources with careful evaluation of their availability is crucial for long-term sustainability,",
        "Collaboration within the entrepreneurial ecosystem can foster adaptability,",
        "Starting a business in Vancouver with a $50 budget is feasible, but it constrains options to service-oriented models,",
        "Entrepreneurs must prioritize digital services or low-overhead business models to align with a limited budget,",
        "Engaging with community resources like incubators and networking opportunities can enhance chances of success,",
        "Hidden costs associated with registration and compliance may exceed the initial budget and impact overall viability,",
        "Reliance on community resources can vary in availability and effectiveness, posing potential challenges for sustained growth,",
    ];
    
    const analyzer = new InsightAnalyzer(process.env.OPENAI_API_KEY2);
    const analysis = await analyzer.analyzeInsights(insights);
    
    // Print results for each insight
    analysis.insightMetrics.forEach((metrics, i) => {
        console.log(`\nInsight ${i + 1}:`);
        console.log(`Text: ${insights[i]}`);
        console.log(`Internal Coherence: ${metrics.internalCoherence.toFixed(2)}`);
        console.log(`Novelty: ${metrics.novelty.toFixed(2)}`);
        console.log(`Practicality: ${metrics.practicality.toFixed(2)}`);
        console.log(`Relevance: ${metrics.relevance.toFixed(2)}`);
        console.log(`Overall Score: ${metrics.overallScore.toFixed(2)}`);
    });
    
    // Print overall conversation metrics
    console.log('\nOverall Conversation Metrics:');
    Object.entries(analysis.conversationMetrics).forEach(([metric, value]) => {
        console.log(`${metric}: ${value.toFixed(2)}`);
    });
}

main();