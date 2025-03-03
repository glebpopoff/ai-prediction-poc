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

// Check if Ollama is running
async function isOllamaRunning() {
    try {
        const response = await fetch('http://localhost:11434/api/tags');
        return response.ok;
    } catch (error) {
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

// Endpoint to get AI prediction
app.post('/api/predict', async (req, res) => {
    try {
        const { data } = req.body;
        
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
        const prediction = simplePrediction(data);
        res.json({ 
            prediction,
            method: 'fallback'
        });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
