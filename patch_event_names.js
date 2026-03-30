const fs = require('fs');

function replaceInFile(filePath) {
    if (!fs.existsSync(filePath)) {
        console.log(`File not found: ${filePath}`);
        return;
    }
    let content = fs.readFileSync(filePath, 'utf8');

    // Replace "eventType": "究極のレッドゾーン" -> "eventType": "レッドゾーン"
    content = content.replace(/"eventType"\s*:\s*"究極のレッドゾーン"/g, '"eventType": "レッドゾーン"');

    // Replace "eventType": "至上のバトルスペクタクル" -> "eventType": "バトルスペクタクル"
    content = content.replace(/"eventType"\s*:\s*"至上のバトルスペクタクル"/g, '"eventType": "バトルスペクタクル"');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
}

const filesToPatch = [
    'dokkan_calc_final.js',
    'scraper/all_enemies.json',
    'scraper/all_enemies_progress.json',
    'scraper/enemies.json',
];

filesToPatch.forEach(replaceInFile);

// Also patch parse-cached.js to prevent this from happening on future scrapes
const parserPath = 'scraper/parse-cached.js';
if (fs.existsSync(parserPath)) {
    let parserContent = fs.readFileSync(parserPath, 'utf8');
    parserContent = parserContent.replace(/究極のレッドゾーン\\s\*\(\.\+\)/g, '究極のレッドゾーン\\\\s*(.*)');
    parserContent = parserContent.replace(/至上のバトルスペクタクル\\s\*\(\.\+\)/g, '至上のバトルスペクタクル\\\\s*(.*)');
    fs.writeFileSync(parserPath, parserContent, 'utf8');
    console.log('Updated parse-cached.js');
}

console.log('Done.');
