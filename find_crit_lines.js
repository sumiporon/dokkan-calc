const fs = require('fs');
const lines = fs.readFileSync('dokkan_calc_final.js', 'utf8').split('\n');
let results = [];
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('data-input="is_critical"')) {
        results.push(`Line ${i}: ` + lines[i].trim().substring(0, 100));
    }
}
fs.writeFileSync('found_crit_lines.txt', results.length > 0 ? results.join('\n') : 'nothing', 'utf8');
