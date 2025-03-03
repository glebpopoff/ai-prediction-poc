import fs from 'fs/promises';

// Define categories and users
const categories = [
    'Healthcare',
    'Finance',
    'Education',
    'Technology',
    'Entertainment',
    'Manufacturing',
    'Retail',
    'Transportation',
    'Energy',
    'Real Estate'
];

const users = [
    'John Smith',
    'Emma Wilson',
    'Michael Chen',
    'Sarah Davis',
    'David Brown',
    'Lisa Anderson',
    'James Taylor',
    'Maria Garcia',
    'Robert Johnson',
    'Jennifer Lee'
];

// Generate realistic project data with some patterns
function generateProjectData() {
    const data = [];
    
    // Give each user some expertise areas (they'll perform better in these)
    const userExpertise = {};
    users.forEach(user => {
        userExpertise[user] = {
            primaryStrength: categories[Math.floor(Math.random() * categories.length)],
            secondaryStrength: categories[Math.floor(Math.random() * categories.length)]
        };
    });

    // Generate multiple projects per user across different categories
    users.forEach(user => {
        categories.forEach(category => {
            // Base ranking between 1-5
            let baseRanking = 2 + Math.random() * 3;
            
            // Boost ranking for expertise areas
            if (category === userExpertise[user].primaryStrength) {
                baseRanking += 1.5;
            } else if (category === userExpertise[user].secondaryStrength) {
                baseRanking += 0.8;
            }
            
            // Add some random variation
            const finalRanking = Math.min(5, Math.max(1, baseRanking + (Math.random() - 0.5)));
            
            // Add multiple entries per user/category to show consistency/improvement
            const numEntries = 2 + Math.floor(Math.random() * 3); // 2-4 entries per combination
            
            for (let i = 0; i < numEntries; i++) {
                data.push({
                    user,
                    category,
                    ranking: Math.round(finalRanking * 10) / 10, // Round to 1 decimal
                    date: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // Random date within last year
                });
            }
        });
    });
    
    // Sort by date
    return data.sort((a, b) => new Date(a.date) - new Date(b.date));
}

// Generate and save the data
const projectData = generateProjectData();
await fs.writeFile('project-data.json', JSON.stringify(projectData, null, 2));
console.log('Project ranking data generated successfully!');
