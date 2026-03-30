const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, 'all_enemies.json');
const data = JSON.parse(fs.readFileSync(targetFile, 'utf8'));

let count = 0;

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

                // 1. 人工生命体編レッドゾーン セルマックス 30,70
                if (etname.includes('レッドゾーン') && sername.includes('人工生命体編') && ename === 'セルマックス') {
                    boss.critAtkUp = 30;
                    boss.critDefDown = 70;
                    boss.isCriticalDefault = true;
                    // セルマックスは通常攻撃も会心なのでhasSaCritはfalseのまま（全攻撃会心）で良いはずだが、念のため。
                    count++;
                    console.log(`Updated: ${etname} > ${sername} > ${sname} -> ${ename} (30,70)`);
                }

                // 2. レッドゾーン純粋サイヤ人、超サイヤ人2キャベ 100,50
                if (etname.includes('レッドゾーン') && sername.includes('純粋サイヤ人編') && sname.includes('VS キャベ') && ename === '超サイヤ人2キャベ') {
                    boss.critAtkUp = 100;
                    boss.critDefDown = 50;
                    boss.isCriticalDefault = true;
                    count++;
                    console.log(`Updated: ${etname} > ${sername} > ${sname} -> ${ename} (100,50)`);
                }

                // 3. 至上のバトルスペクタクル・次世代のサイヤ人編『vs孫悟飯&孫悟天&トランクス2』 の悟飯 50,70
                if (etname.includes('バトルスペクタクル') && sername.includes('次世代のサイヤ人編') && sname.includes('VS孫悟飯&孫悟天&トランクス2') && ename.startsWith('超サイヤ人孫悟飯(青年期)')) {
                    boss.critAtkUp = 50;
                    boss.critDefDown = 70;
                    boss.isCriticalDefault = true;
                    count++;
                    console.log(`Updated: ${etname} > ${sername} > ${sname} -> ${ename} (50,70)`);
                }
            });
        });
    });
});

if (count > 0) {
    fs.writeFileSync(targetFile, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Successfully updated ${count} enemies in all_enemies.json`);
} else {
    console.log('No matching enemies found. Need to check conditions again.');
}
