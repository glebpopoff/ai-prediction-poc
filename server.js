import express from 'express';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static('public'));

// Read sample data
async function readSampleData() {
    const data = await fs.readFile(join(__dirname, 'data.json'), 'utf-8');
    return JSON.parse(data);
}

// Read project data
async function readProjectData() {
    const data = await fs.readFile(join(__dirname, 'project-data.json'), 'utf-8');
    return JSON.parse(data);
}

// Check if Ollama is running
async function isOllamaRunning() {
    try {
        console.log('Checking Ollama connection...');
        const response = await fetch('http://localhost:11434/api/tags');
        const data = await response.json();
        console.log('Ollama response:', data);
        return response.ok;
    } catch (error) {
        console.error('Ollama connection error:', error.message);
        return false;
    }
}

// Simple prediction without Ollama
function simplePrediction(data) {
    // Get last 3 months of data
    const lastThreeMonths = data.slice(-3);
    const sum = lastThreeMonths.reduce((acc, curr) => acc + curr.value, 0);
    const average = sum / 3;
    // Add small random variation
    return average * (1 + (Math.random() * 0.1 - 0.05));
}

// Calculate trend from historical data
function calculateTrend(data) {
    if (data.length < 2) return 0;
    
    // Sort by date
    const sortedData = [...data].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Calculate slope using linear regression
    const n = sortedData.length;
    const xValues = Array.from({length: n}, (_, i) => i);
    const yValues = sortedData.map(d => d.ranking);
    
    const xMean = xValues.reduce((a, b) => a + b, 0) / n;
    const yMean = yValues.reduce((a, b) => a + b, 0) / n;
    
    const numerator = xValues.reduce((sum, x, i) => sum + (x - xMean) * (yValues[i] - yMean), 0);
    const denominator = xValues.reduce((sum, x) => sum + Math.pow(x - xMean, 2), 0);
    
    return denominator === 0 ? 0 : numerator / denominator;
}

// Process data for prediction
function processDataForPrediction(data, user, category) {
    // Get user's performance in this category
    const userCategoryData = data.filter(d => d.user === user && d.category === category);
    const userCategoryAvg = userCategoryData.length > 0 
        ? userCategoryData.reduce((acc, curr) => acc + curr.ranking, 0) / userCategoryData.length 
        : 0;

    // Calculate trend
    const trend = calculateTrend(userCategoryData);
    
    // Calculate predicted value based on trend
    let predictedValue = userCategoryAvg;
    if (userCategoryData.length >= 2) {
        // Adjust prediction based on trend
        const trendImpact = trend * 2; // Project trend forward
        predictedValue = Math.min(5, Math.max(1, userCategoryAvg + trendImpact));
    }

    // Get user's overall performance
    const userOverallData = data.filter(d => d.user === user);
    const userOverallAvg = userOverallData.length > 0
        ? userOverallData.reduce((acc, curr) => acc + curr.ranking, 0) / userOverallData.length
        : 0;

    // Get category average across all users
    const categoryData = data.filter(d => d.category === category);
    const categoryAvg = categoryData.length > 0
        ? categoryData.reduce((acc, curr) => acc + curr.ranking, 0) / categoryData.length
        : 0;

    // Sort data by date for trend analysis
    const sortedCategoryData = [...userCategoryData].sort((a, b) => new Date(a.date) - new Date(b.date));

    return {
        userCategoryData: sortedCategoryData,
        userCategoryAvg,
        predictedValue,
        trend,
        userOverallAvg,
        categoryAvg,
        userCategoryDataPoints: userCategoryData.length,
        totalUserDataPoints: userOverallData.length,
        totalCategoryDataPoints: categoryData.length
    };
}

// Simple project success prediction
function simpleProjectPrediction(data, user, category) {
    console.log(`Calculating fallback prediction for user: ${user}, category: ${category}`);
    const stats = processDataForPrediction(data, user, category);
    console.log('Prediction factors:', stats);

    // Weight the different factors
    const prediction = (
        (stats.userCategoryAvg * 0.5) + // 50% weight on user's performance in this category
        (stats.userOverallAvg * 0.3) +  // 30% weight on user's overall performance
        (stats.categoryAvg * 0.2)       // 20% weight on category average
    ) || 3; // Default to 3 if no data

    // Add small random variation
    const finalPrediction = Math.min(5, Math.max(1, prediction * (1 + (Math.random() * 0.1 - 0.05))));
    console.log('Final prediction:', finalPrediction);
    return finalPrediction;
}

// Process Ollama stream response
async function processOllamaResponse(response) {
    try {
        console.log('Processing Ollama response stream...');
        const reader = response.body;
        let fullResponse = '';
        let prediction = null;
        
        for await (const chunk of reader) {
            const text = new TextDecoder().decode(chunk);
            const lines = text.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
                try {
                    const data = JSON.parse(line);
                    if (data.response) {
                        fullResponse += data.response;
                        // If we don't have a prediction yet, try to find one
                        if (prediction === null) {
                            const match = fullResponse.match(/\d+(\.\d+)?/);
                            if (match) {
                                prediction = parseFloat(match[0]);
                                if (prediction >= 1 && prediction <= 5) {
                                    console.log('Found prediction:', prediction);
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error('Error parsing JSON line:', e);
                }
            }
        }
        
        console.log('Full Ollama response:', fullResponse);
        if (prediction === null) {
            // Try one last time to find a prediction
            const match = fullResponse.match(/\d+(\.\d+)?/);
            if (match) {
                prediction = parseFloat(match[0]);
            }
        }
        
        if (prediction === null) {
            throw new Error('No numeric prediction found in response');
        }
        
        return {
            prediction,
            fullResponse: fullResponse.trim()
        };
    } catch (error) {
        console.error('Error processing Ollama response:', error);
        throw error;
    }
}

// Endpoint to check Ollama status
app.get('/api/status', async (req, res) => {
    const running = await isOllamaRunning();
    res.json({ running });
});

// Endpoint to get historical data
app.get('/api/data', async (req, res) => {
    try {
        const data = await readSampleData();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read data' });
    }
});

// Endpoint to get project data
app.get('/api/project-data', async (req, res) => {
    try {
        const data = await readProjectData();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read project data' });
    }
});

// Endpoint to get AI prediction
app.post('/api/predict', async (req, res) => {
    try {
        const { data } = req.body;
        if (!data) {
            throw new Error('No data provided');
        }
        
        const ollamaRunning = await isOllamaRunning();
        
        if (ollamaRunning) {
            // Call Ollama API
            const response = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'llama2',
                    prompt: `Given this monthly sales data: ${JSON.stringify(data)}, predict the next month's value. Return only the numeric prediction.`
                })
            });

            const result = await response.json();
            res.json({ 
                prediction: parseFloat(result.response),
                method: 'ollama'
            });
        } else {
            // Fallback to simple prediction
            const prediction = simplePrediction(data);
            res.json({ 
                prediction,
                method: 'fallback'
            });
        }
    } catch (error) {
        // Fallback to simple prediction on error
        if (!req.body.data) {
            res.status(400).json({ error: 'Invalid or missing data' });
            return;
        }
        const prediction = simplePrediction(req.body.data);
        res.json({ 
            prediction,
            method: 'fallback'
        });
    }
});

// Endpoint to predict project success
app.post('/api/predict-success', async (req, res) => {
    try {
        const { user, category, data, forceAI } = req.body;
        if (!user || !category || !data) {
            throw new Error('Missing required parameters');
        }
        
        console.log(`Received prediction request for user: ${user}, category: ${category}, forceAI: ${forceAI}`);
        const stats = processDataForPrediction(data, user, category);
        console.log('Performance stats:', stats);
        
        const ollamaRunning = await isOllamaRunning();
        console.log('Ollama status:', ollamaRunning ? 'running' : 'not running');
        
        if (ollamaRunning && (forceAI || stats.userCategoryDataPoints < 2)) {
            // Use AI for new categories or when forced
            console.log('Using AI prediction...');
            const prompt = `Analyze the user's potential success in their project category. Here are the key statistics:

User: ${user}
Category: ${category}
Current performance in this category: ${stats.userCategoryAvg.toFixed(2)} (based on ${stats.userCategoryDataPoints} projects)
Overall performance across all categories: ${stats.userOverallAvg.toFixed(2)} (based on ${stats.totalUserDataPoints} projects)
Category average across all users: ${stats.categoryAvg.toFixed(2)} (based on ${stats.totalCategoryDataPoints} projects)
Performance trend: ${stats.trend > 0 ? 'improving' : stats.trend < 0 ? 'declining' : 'stable'} (${Math.abs(stats.trend).toFixed(2)} points per project)

Recent projects in this category:
${stats.userCategoryData.slice(-3).map(d => `- Rating: ${d.ranking} (${d.date})`).join('\n')}

First provide a rating from 1-5, then explain your reasoning in 2-3 sentences, considering both historical performance and trend.`;

            const response = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'mistral',
                    prompt,
                    options: {
                        temperature: 0.3,
                        top_p: 0.9
                    }
                })
            });

            if (!response.ok) {
                console.error('Ollama API error:', response.status, response.statusText);
                throw new Error(`Ollama API error: ${response.status}`);
            }

            const { prediction, fullResponse } = await processOllamaResponse(response);
            const normalizedPrediction = Math.min(5, Math.max(1, prediction));
            
            res.json({ 
                prediction: normalizedPrediction,
                historicalAverage: stats.userCategoryAvg,
                method: 'ollama',
                explanation: fullResponse,
                stats: {
                    categoryAverage: stats.userCategoryAvg,
                    predictedValue: stats.predictedValue,
                    trend: stats.trend,
                    overallAverage: stats.userOverallAvg,
                    dataPoints: stats.userCategoryDataPoints,
                    recentPerformance: stats.userCategoryData.slice(-3).map(d => ({
                        rating: d.ranking,
                        date: d.date
                    }))
                }
            });
        } else if (!forceAI) {
            console.log('Using trend-based prediction...');
            const trendDescription = stats.trend > 0 ? 'improving' : stats.trend < 0 ? 'declining' : 'stable';
            const trendValue = Math.abs(stats.trend).toFixed(2);
            
            const explanation = `Trend-based prediction:\n` +
                `- Historical average: ${stats.userCategoryAvg.toFixed(2)}\n` +
                `- Performance trend: ${trendDescription} (${trendValue} points per project)\n` +
                `- Recent projects:\n${stats.userCategoryData.slice(-3).map(d => `  • ${d.date}: ${d.ranking}`).join('\n')}\n\n` +
                `The prediction considers both the historical average and the ${trendDescription} trend in performance.`;
            
            res.json({ 
                prediction: stats.predictedValue,
                historicalAverage: stats.userCategoryAvg,
                method: 'trend-based',
                explanation,
                stats: {
                    categoryAverage: stats.userCategoryAvg,
                    predictedValue: stats.predictedValue,
                    trend: stats.trend,
                    overallAverage: stats.userOverallAvg,
                    dataPoints: stats.userCategoryDataPoints,
                    recentPerformance: stats.userCategoryData.slice(-3).map(d => ({
                        rating: d.ranking,
                        date: d.date
                    }))
                }
            });
        } else {
            throw new Error('Ollama is not running');
        }
    } catch (error) {
        console.error('Prediction error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
