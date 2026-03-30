// stream_fix_event.js - ストリーム処理でイベントタイプを置換（メモリ消費を抑える）
const fs = require('fs');
const readline = require('readline');
const path = require('path');

async function fixFile(inputPath) {
    const tmpPath = inputPath + '.tmp';
    const writeStream = fs.createWriteStream(tmpPath, { encoding: 'utf8' });
    const rl = readline.createInterface({
        input: fs.createReadStream(inputPath, { encoding: 'utf8' }),
        crlfDelay: Infinity
    });

    let lineCount = 0;
    let fixCount = 0;

    for await (const line of rl) {
        let newLine = line;
        if (line.includes('"究極のレッドゾーン"')) {
            newLine = line.replace(/"eventType"\s*:\s*"究極のレッドゾーン"/g, '"eventType": "レッドゾーン"');
            if (newLine !== line) fixCount++;
        }
        if (line.includes('"至上のバトルスペクタクル"')) {
            newLine = newLine.replace(/"eventType"\s*:\s*"至上のバトルスペクタクル"/g, '"eventType": "バトルスペクタクル"');
            if (newLine !== line) fixCount++;
        }
        writeStream.write(newLine + '\n');
        lineCount++;
    }

    await new Promise((resolve, reject) => {
        writeStream.end(resolve);
        writeStream.on('error', reject);
    });

    // 元ファイルを上書き
    fs.renameSync(tmpPath, inputPath);
    console.log(`${path.basename(inputPath)}: ${lineCount} 行処理、${fixCount} 行修正`);
}

(async () => {
    const BASE = __dirname;
    const SCRAPER = path.join(BASE, 'scraper');

    const files = [
        path.join(SCRAPER, 'all_enemies.json'),
        path.join(SCRAPER, 'enemies.json'),
    ];

    for (const f of files) {
        if (!fs.existsSync(f)) { console.log('スキップ:', f); continue; }
        console.log('処理中:', f);
        await fixFile(f);
    }
    console.log('完了！');
})();
