const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, 'all_enemies.json');
let data = JSON.parse(fs.readFileSync(targetFile, 'utf8'));

let count = 0;

data.forEach(stage => {
    if (!stage.enemies) return;
    stage.enemies.forEach(enemy => {
        // 1. 人工生命体編レッドゾーン セルマックス 30,70
        if (stage.stageName.includes('セルマックス') && enemy.name.includes('セルマックス')) {
            enemy.critAtkUp = 30;
            enemy.critDefDown = 70;
            enemy.isCriticalDefault = true;
            count++;
            console.log(`Updated: ${stage.stageName} -> ${enemy.name} (30,70)`);
        }

        // 2. レッドゾーン純粋サイヤ人、超サイヤ人2キャベ 100,50
        // ステージ名が「VS第6宇宙」などで、敵がキャベであると推測
        if (stage.eventType.includes('レッドゾーン') && stage.stageName.includes('第6宇宙') && enemy.name.includes('キャベ')) {
            enemy.critAtkUp = 100;
            enemy.critDefDown = 50;
            enemy.isCriticalDefault = true;
            count++;
            console.log(`Updated: ${stage.stageName} -> ${enemy.name} (100,50)`);
        }

        // 3. 至上のバトルスペクタクル・次世代のサイヤ人編『vs孫悟飯&孫悟天&トランクス2』 の悟飯 50,70
        if (stage.stageName.includes('孫悟飯') && stage.stageName.includes('トランクス') && enemy.name === '超サイヤ人孫悟飯(青年期)') {
            enemy.critAtkUp = 50;
            enemy.critDefDown = 70;
            enemy.isCriticalDefault = true;
            count++;
            console.log(`Updated: ${stage.stageName} -> ${enemy.name} (50,70)`);
        }
    });
});

if (count > 0) {
    fs.writeFileSync(targetFile, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Updated ${count} enemies in all_enemies.json`);
} else {
    console.log('No matching enemies found. Need to adjust search criteria.');
}
