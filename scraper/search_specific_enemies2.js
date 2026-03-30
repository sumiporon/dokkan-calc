const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, 'all_enemies.json');
const data = JSON.parse(fs.readFileSync(targetFile, 'utf8'));

console.log("=== 検索開始 ===");

data.forEach(sage => {
    if (!sage.enemies) return;
    sage.enemies.forEach(enemy => {
        const ename = enemy.name || '';
        const sname = sage.stageName || '';
        const enameType = sage.eventType || '';

        // "セル"
        if (ename.includes('セル')) {
            console.log(`[セル系] ${enameType} > ${sage.seriesName || '-'} > ${sname} -> ${ename}`);
        }

        // "サイヤ"
        if (sname.includes('サイヤ') && (enameType.includes('レッドゾーン') || enameType.includes('スペクタクル'))) {
            console.log(`[サイヤ系] ${enameType} > ${sage.seriesName || '-'} > ${sname} -> ${ename}`);
        }
    });
});
console.log("=== 検索終了 ===");
