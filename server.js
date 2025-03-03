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

// Simple project success prediction
function simpleProjectPrediction(data, user, category) {
    console.log(`Calculating fallback prediction for user: ${user}, category: ${category}`);
    // Get user's performance in this category
    const userCategoryData = data.filter(d => d.user === user && d.category === category);
    const userCategoryAvg = userCategoryData.length > 0 
        ? userCategoryData.reduce((acc, curr) => acc + curr.ranking, 0) / userCategoryData.length 
        : 0;

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

    console.log('Prediction factors:', {
        userCategoryAvg,
        userOverallAvg,
        categoryAvg,
        userCategoryDataPoints: userCategoryData.length,
        totalUserDataPoints: userOverallData.length,
        totalCategoryDataPoints: categoryData.length
    });

    // Weight the different factors
    const prediction = (
        (userCategoryAvg * 0.5) + // 50% weight on user's performance in this category
        (userOverallAvg * 0.3) +  // 30% weight on user's overall performance
        (categoryAvg * 0.2)       // 20% weight on category average
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
        
        for await (const chunk of reader) {
            const text = new TextDecoder().decode(chunk);
            const lines = text.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
                try {
                    const data = JSON.parse(line);
                    if (data.response) {
                        fullResponse += data.response;
                    }
                } catch (e) {
                    console.error('Error parsing JSON line:', e);
                }
            }
        }
        
        console.log('Full Ollama response:', fullResponse);
        // Extract the first number from the response
        const match = fullResponse.match(/\d+(\.\d+)?/);
        if (match) {
            const prediction = parseFloat(match[0]);
            console.log('Extracted prediction:', prediction);
            return prediction;
        }
        throw new Error('No numeric prediction found in response');
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
        const { user, category, data } = req.body;
        if (!user || !category || !data) {
            throw new Error('Missing required parameters');
        }
        
        console.log(`Received prediction request for user: ${user}, category: ${category}`);
        const ollamaRunning = await isOllamaRunning();
        console.log('Ollama status:', ollamaRunning ? 'running' : 'not running');
        
        if (ollamaRunning) {
            console.log('Attempting to call Ollama API...');
            // Call Ollama API
            const response = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'llama2',
                    prompt: `Based on this project performance data, predict a success score between 1 and 5 for user "${user}" in the "${category}" category. Only respond with a single number, no other text. Here's the data: ${JSON.stringify(data)}`
                })
            });

            if (!response.ok) {
                console.error('Ollama API error:', response.status, response.statusText);
                throw new Error(`Ollama API error: ${response.status}`);
            }

            const prediction = await processOllamaResponse(response);
            const normalizedPrediction = Math.min(5, Math.max(1, prediction));
            console.log('Final AI prediction:', normalizedPrediction);
            
            res.json({ 
                prediction: normalizedPrediction,
                method: 'ollama'
            });
        } else {
            console.log('Using fallback prediction method...');
            // Fallback to simple prediction
            const prediction = simpleProjectPrediction(data, user, category);
            res.json({ 
                prediction,
                method: 'fallback'
            });
        }
    } catch (error) {
        console.error('Prediction error:', error);
        // Fallback to simple prediction on error
        if (!req.body.data || !req.body.user || !req.body.category) {
            console.error('Invalid request parameters:', req.body);
            res.status(400).json({ error: 'Invalid or missing parameters' });
            return;
        }
        console.log('Using fallback prediction after error...');
        const prediction = simpleProjectPrediction(req.body.data, req.body.user, req.body.category);
        res.json({ 
            prediction,
            method: 'fallback'
        });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
