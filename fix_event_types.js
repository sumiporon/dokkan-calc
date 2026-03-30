// fix_event_types.js
// このスクリプトはfinal_calc.jsを更新する前のall_enemies.json内の
// イベントタイプを修正します

const fs = require('fs');
const path = require('path');

const BASE_DIR = __dirname;
const SCRAPER_DIR = path.join(BASE_DIR, 'scraper');

function fixEventTypes(filePath) {
    if (!fs.existsSync(filePath)) {
        console.log('Not found:', filePath);
        return 0;
    }
    let content = fs.readFileSync(filePath, 'utf8');
    const before = content.length;

    content = content.replace(/"eventType"\s*:\s*"究極のレッドゾーン"/g, '"eventType": "レッドゾーン"');
    content = content.replace(/"eventType"\s*:\s*"至上のバトルスペクタクル"/g, '"eventType": "バトルスペクタクル"');

    fs.writeFileSync(filePath, content, 'utf8');
    const replaced = content.length !== before;
    console.log(`Fixed: ${path.basename(filePath)}`);
    return 1;
}

const files = [
    path.join(SCRAPER_DIR, 'all_enemies.json'),
    path.join(SCRAPER_DIR, 'all_enemies_progress.json'),
    path.join(SCRAPER_DIR, 'enemies.json'),
];

files.forEach(fixEventTypes);
console.log('完了！');
console.log('------------------------------');
console.log('次のステップ: 敵データを再生成してdokkan_calc_final.jsを更新してください');
