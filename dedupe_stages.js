const fs = require('fs');

function deduplicateStages(filePath) {
    if (!fs.existsSync(filePath)) return;
    
    let db = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    db.forEach(et => {
        et.series.forEach(se => {
            // Keep track of the last occurrence of each stageName
            const nameToLastStage = {};
            
            se.stages.forEach(st => {
                // Since they are processed in order, the last one processed
                // overwrites the previous ones, effectively keeping the highest difficulty.
                nameToLastStage[st.stageName] = st;
            });
            
            // Reconstruct the stages array preserving the order of appearance of the last stages
            // Wait, to preserve order, we can map through a Set of unique names
            const uniqueNames = [...new Set(se.stages.map(st => st.stageName))];
            se.stages = uniqueNames.map(name => nameToLastStage[name]);
        });
    });

    fs.writeFileSync(filePath, JSON.stringify(db, null, 2), 'utf8');
    console.log('Deduplicated stages for:', filePath);
}

deduplicateStages('scraper/all_enemies.json');
