const fs = require('fs');
const content = fs.readFileSync('c:/Users/kou20/OneDrive - 甲南大学/デスクトップ/ドッカン計算/dokkan_calc_final.js', 'utf8');

const lines = content.split('\n');
let count = 0;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('addScenarioCard')) {
        console.log(`Line ${i + 1}:`);
        console.log(lines[i].substring(0, 100)); // print start of line
        count++;
    }
}
if (count === 0) console.log('not found');
