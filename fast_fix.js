// fast_fix.js
// ファイル上書きによるOneDriveロックを回避するため、
// 別名で書き出してからリネームで差し替える方式

const fs = require('fs');
const path = require('path');

function replaceWithNewFile(filePath) {
    if (!fs.existsSync(filePath)) {
        console.log('スキップ(存在なし):', filePath);
        return;
    }

    console.log(`処理開始: ${filePath}`);
    const content = fs.readFileSync(filePath, 'utf8');

    // 内容を置換
    let newContent = content.replace(/"eventType"\s*:\s*"究極のレッドゾーン"/g, '"eventType": "レッドゾーン"');
    newContent = newContent.replace(/"eventType"\s*:\s*"至上のバトルスペクタクル"/g, '"eventType": "バトルスペクタクル"');

    if (newContent === content) {
        console.log(`変更なし: ${filePath}`);
        return;
    }

    // 別名で保存
    const tempFile = filePath + '.new';
    fs.writeFileSync(tempFile, newContent, 'utf8');

    // バックアップ元の名前
    const backupFile = filePath + '.bak' + Date.now();

    // リネーム（アトミックな差し替え）
    fs.renameSync(filePath, backupFile);
    fs.renameSync(tempFile, filePath);

    console.log(`置換成功: ${filePath} (バックアップ: ${path.basename(backupFile)})`);
}

const BASE_DIR = __dirname;
const files = [
    path.join(BASE_DIR, 'dokkan_calc_final.js'),
    path.join(BASE_DIR, 'scraper', 'all_enemies.json'),
    path.join(BASE_DIR, 'scraper', 'enemies.json')
];

try {
    for (const f of files) {
        replaceWithNewFile(f);
    }
    console.log('完了しました！');
} catch (err) {
    console.error('エラー発生:', err);
}
