import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function generateDiagram(mermaidCode, outputPath, width = 800, height = 600) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    // HTML template with Mermaid
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
            <script>
                mermaid.initialize({
                    startOnLoad: true,
                    theme: 'default',
                    flowchart: {
                        useMaxWidth: false,
                        htmlLabels: true,
                        curve: 'basis'
                    }
                });
            </script>
        </head>
        <body>
            <div class="mermaid">
                ${mermaidCode}
            </div>
        </body>
        </html>
    `;

    await page.setContent(html);
    await page.setViewport({ width, height });
    
    // Wait for Mermaid to render
    await page.waitForSelector('.mermaid svg');
    
    // Get the SVG element
    const element = await page.$('.mermaid');
    await element.screenshot({
        path: outputPath,
        omitBackground: true
    });

    await browser.close();
}

async function main() {
    // Read Mermaid files
    const salesDiagram = await fs.readFile(join(__dirname, 'public', 'sales-prediction.mmd'), 'utf-8');
    const projectDiagram = await fs.readFile(join(__dirname, 'public', 'project-prediction.mmd'), 'utf-8');

    // Generate PNGs
    await generateDiagram(salesDiagram, join(__dirname, 'public', 'image1.png'));
    await generateDiagram(projectDiagram, join(__dirname, 'public', 'image2.png'));
}

main().catch(console.error);
