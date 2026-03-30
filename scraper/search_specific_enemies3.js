const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, 'all_enemies.json');
const data = JSON.parse(fs.readFileSync(targetFile, 'utf8'));

console.log("=== 検索開始 ===");

data.forEach(et => {
    if (!et.series) return;
    et.series.forEach(ser => {
        if (!ser.stages) return;
        ser.stages.forEach(stg => {
            if (!stg.bosses) return;
            stg.bosses.forEach(boss => {
                const ename = boss.name || '';
                const sname = stg.stageName || '';
                const sername = ser.seriesName || '';
                const etname = et.eventType || '';

                if (ename.includes('セルマックス')) {
                    console.log(`[セルマックス] ${etname} > ${sername} > ${sname} -> ${ename}`);
                }
                if (ename.includes('キャベ') || sname.includes('キャベ')) {
                    console.log(`[キャベ] ${etname} > ${sername} > ${sname} -> ${ename}`);
                }
                if (sname.includes('孫悟飯') && sname.includes('トランクス')) {
                    console.log(`[悟飯ステージ] ${etname} > ${sername} > ${sname} -> ${ename}`);
                }
            });
        });
    });
});

console.log("=== 検索終了 ===");
