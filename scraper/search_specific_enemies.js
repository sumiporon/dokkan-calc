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

        // セルマックス
        if (ename.includes('セルマックス')) {
            console.log(`[セルマックス] ${enameType} > ${sage.seriesName || '-'} > ${sname} -> ${ename}`);
        }

        // キャベ
        if (ename.includes('キャベ') || sname.includes('キャベ')) {
            console.log(`[キャベ] ${enameType} > ${sage.seriesName || '-'} > ${sname} -> ${ename}`);
        }

        // 悟飯 (青年期など)
        if (sname.includes('孫悟飯') && sname.includes('トランクス')) {
            console.log(`[悟飯ステージ] ${enameType} > ${sage.seriesName || '-'} > ${sname} -> ${ename}`);
        }
    });
});
console.log("=== 検索終了 ===");
