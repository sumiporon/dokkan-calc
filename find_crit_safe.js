const fs = require('fs');
const path = require('path');

const srcFile = 'c:/Users/kou20/OneDrive - 甲南大学/デスクトップ/ドッカン計算/dokkan_calc_final.js';
const tempFile = 'C:\\Temp\\dokkan_calc_final_temp_read.js';

try {
    if (!fs.existsSync('C:\\Temp')) fs.mkdirSync('C:\\Temp', { recursive: true });
    fs.copyFileSync(srcFile, tempFile);

    const content = fs.readFileSync(tempFile, 'utf8');
    const lines = content.split('\n');
    let results = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('data-input="is_critical"')) {
            results.push(`Line ${i + 1}: ` + lines[i].trim().substring(0, 150));
        }
    }
    fs.writeFileSync('C:\\Temp\\found_crit_lines.txt', results.length > 0 ? results.join('\n') : 'nothing', 'utf8');
    console.log('Done');
} catch (e) {
    fs.writeFileSync('C:\\Temp\\found_crit_lines.txt', e.toString(), 'utf8');
    console.log(e);
}
