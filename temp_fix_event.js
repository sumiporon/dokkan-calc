// temp_fix_event.js
// C:\Temp にコピーして処理し、終わったら元のフォルダへ戻す
const fs = require('fs');
const path = require('path');

const ONEDRIVE_BASE = __dirname; // c:\Users\kou20\OneDrive - ..\ドッカン計算
const SCRAPER_DIR = path.join(ONEDRIVE_BASE, 'scraper');

const TEMP_DIR = 'C:\\Temp';
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function fixAndCopy(srcPath) {
    const fname = path.basename(srcPath);
    const tmpPath = path.join(TEMP_DIR, fname + '.tmp');
    const tmpOut = path.join(TEMP_DIR, fname + '.out');

    console.log(`コピー中: ${fname} -> C:\\Temp`);
    fs.copyFileSync(srcPath, tmpPath);
    console.log('コピー完了。置換中...');

    let content = fs.readFileSync(tmpPath, 'utf8');
    content = content.replace(/"eventType"\s*:\s*"究極のレッドゾーン"/g, '"eventType": "レッドゾーン"');
    content = content.replace(/"eventType"\s*:\s*"至上のバトルスペクタクル"/g, '"eventType": "バトルスペクタクル"');

    fs.writeFileSync(tmpOut, content, 'utf8');
    console.log('置換完了。元のフォルダへコピー中...');

    fs.copyFileSync(tmpOut, srcPath);
    fs.unlinkSync(tmpPath);
    fs.unlinkSync(tmpOut);
    console.log(`完了: ${fname}`);
}

const files = [
    path.join(SCRAPER_DIR, 'all_enemies.json'),
    path.join(SCRAPER_DIR, 'enemies.json'),
];

for (const f of files) {
    if (fs.existsSync(f)) {
        fixAndCopy(f);
    } else {
        console.log('スキップ:', f);
    }
}

console.log('\n全ファイルの処理が完了しました！');
