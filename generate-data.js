import fs from 'fs/promises';

// Generate realistic sales data with seasonal trends and some randomness
function generateMonthlyData() {
    const months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    
    const baseValue = 10000; // Base sales value
    const seasonalFactor = 0.3; // Seasonal variation (30%)
    const randomFactor = 0.1; // Random variation (10%)
    const yearlyGrowth = 0.05; // 5% yearly growth

    const data = [];
    
    // Generate 2 years of data
    for (let year = 2023; year <= 2024; year++) {
        months.forEach((month, index) => {
            // Seasonal pattern: peak in summer and winter holidays
            const seasonalValue = Math.sin((index + 6) * Math.PI / 6) * seasonalFactor;
            
            // Random variation
            const randomValue = (Math.random() - 0.5) * 2 * randomFactor;
            
            // Calculate growth factor based on how many years from start
            const yearDiff = year - 2023;
            const growthFactor = 1 + (yearlyGrowth * yearDiff);
            
            // Combine all factors
            const value = baseValue * (1 + seasonalValue + randomValue) * growthFactor;
            
            data.push({
                month: `${month} ${year}`,
                value: Math.round(value * 100) / 100
            });
        });
    }
    
    return data;
}

// Generate and save the data
const data = generateMonthlyData();
await fs.writeFile('data.json', JSON.stringify(data, null, 2));
console.log('Sample data generated successfully!');
