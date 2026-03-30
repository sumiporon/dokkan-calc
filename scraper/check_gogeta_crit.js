const fs = require('fs');

const path = require('path');
const targetFile = path.join(__dirname, '..', 'dokkan_calc_final.js');
const txt = fs.readFileSync(targetFile, 'utf8');

// The preset is assigned to `const enemy_preset = [ ... ];`
// Let's parse it out using regex or eval to check
const startStr = "const enemy_preset = ";
const startIndex = txt.indexOf(startStr);
if (startIndex !== -1) {
    let endIndex = txt.length;
    // Fast way: we know it ends somewhere before `document.addEventListener('DOMContentLoaded', () => {`
    const endStr = "];\n\n\ndocument.addEventListener";
    const possibleEnd = txt.indexOf("];", startIndex);

    // Using a safer extraction
    // Let's just use string parsing to find all "超ゴジータ" and output their hasSaCrit status
    const lines = txt.split('\n');
    let currentEnemyName = "";
    let stageName = "";
    let eventName = "";
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('"name": "超ゴジータ"')) {
            currentEnemyName = "超ゴジータ";
            // Look down for hasSaCrit
            for (let j = i; j < i + 30; j++) {
                if (lines[j].includes('"hasSaCrit":')) {
                    console.log(`line ${i}: 超ゴジータ -> ${lines[j].trim()}`);
                    break;
                }
            }
        }
    }
}
