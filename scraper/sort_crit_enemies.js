const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, 'crit_enemies_full.txt');
const lines = fs.readFileSync(inputFile, 'utf8').split('\n');

const entries = [];
let currentEntry = {};

for (const line of lines) {
    if (line.startsWith('Stage: ')) {
        const match = line.match(/Stage: (.*) \(stage_(\d+)_(\d+)\.html\)/);
        if (match) {
            currentEntry.stageName = match[1];
            currentEntry.eventId = parseInt(match[2], 10);
            currentEntry.stageId = parseInt(match[3], 10);
        }
    } else if (line.startsWith('Enemy: ')) {
        currentEntry.enemyName = line.replace('Enemy: ', '').trim();
    } else if (line.startsWith('Condition: ')) {
        currentEntry.condition = line.replace('Condition: ', '').trim();
    } else if (line === '---') {
        if (currentEntry.stageName) {
            entries.push({ ...currentEntry });
        }
        currentEntry = {};
    }
}

// Sort descending: larger eventId first, then larger stageId first
entries.sort((a, b) => {
    if (b.eventId !== a.eventId) {
        return b.eventId - a.eventId;
    }
    return b.stageId - a.stageId;
});

const output = [];
for (const e of entries) {
    output.push(`- **${e.enemyName}** (${e.stageName})`);
    output.push(`  条件: ${e.condition}`);
}

fs.writeFileSync(path.join(__dirname, 'crit_enemies_sorted.txt'), output.join('\n'));
console.log('Done!');
