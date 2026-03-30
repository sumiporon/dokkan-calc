const fs = require('fs');
const data = JSON.parse(fs.readFileSync('all_enemies.json', 'utf8'));

const testNames = ['ザマス', 'フリーザ', 'セル'];

testNames.forEach(targetName => {
    let count = 0;
    for (const stage of data) {
        if (!stage.enemies) continue;
        for (const enemy of stage.enemies) {
            if (enemy.name.includes(targetName) && count < 2) {
                console.log(`[${stage.stageName}] ${enemy.name} -> hasSaCrit: ${enemy.hasSaCrit}`);
                count++;
            }
        }
    }
});
