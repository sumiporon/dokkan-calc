const fs = require('fs');
const content = fs.readFileSync('dokkan_calc_final.js', 'utf8');

const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('data-input="is_critical"')) {
        console.log(`Line ${i + 1}:`);
        console.log(lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 5)).join('\n'));
        break;
    }
}
