const fs = require('fs');
const content = fs.readFileSync('c:/Users/kou20/OneDrive - 甲南大学/デスクトップ/ドッカン計算/dokkan_calc_final.js', 'utf8');
const lines = content.split('\n');
let results = [];
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('addScenarioCard')) {
        results.push(`Line ${i + 1}: ${lines[i].substring(0, 100).trim()}`);
    }
}
fs.writeFileSync('c:/Temp/out.txt', results.length > 0 ? results.join('\n') : 'not found', 'utf8');
