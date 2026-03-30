const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '..', 'dokkan_calc_final.js');
let content = fs.readFileSync(targetFile, 'utf8');

const targetStr = `            const STORAGE_KEY = 'dokkan_calc_data_v19';
            let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
            state.savedEnemies = [];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            location.reload();`;

const replaceStr = `            const STORAGE_KEY = 'dokkan_calc_data_v19';
            let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
            state.savedEnemies = JSON.parse(JSON.stringify(DEFAULT_ENEMIES_PRESET));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            location.reload();`;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, replaceStr);
    fs.writeFileSync(targetFile, content, 'utf8');
    console.log('Successfully replaced dokkan_calc_final.js JS logic (fixed empty enemies).');
} else {
    console.log('Target string not found!');
}
