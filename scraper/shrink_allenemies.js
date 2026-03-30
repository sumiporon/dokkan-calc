const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const fileName = 'all_enemies.json';
const srcFile = path.join(srcDir, fileName);
const backupFile = path.join(srcDir, 'all_enemies_backup.json');

// バックアップを作成
if (!fs.existsSync(backupFile)) {
    fs.copyFileSync(srcFile, backupFile);
    console.log('バックアップを作成しました: all_enemies_backup.json');
}

console.log('データの読み込み中...');
let data = JSON.parse(fs.readFileSync(srcFile, 'utf8'));
let initialSize = fs.statSync(srcFile).size;

console.log('不要なプロパティの削除中...');
let bossCount = 0;
let deletedFieldsCount = 0;

data.forEach(eventType => {
    eventType.series.forEach(series => {
        series.stages.forEach(stage => {
            stage.bosses.forEach(boss => {
                bossCount++;

                // 削除対象のプロパティリスト
                const fieldsToDelete = [
                    'critAtkUp',
                    'critDefDown',
                    'isCriticalDefault',
                    'critHpThreshold',
                    'critHpRate',
                    'critTurnUp',
                    'critTurnMax',
                    'critFixedRate'
                ];

                // turnAtkUp等が0なら関連フィールドも消す（軽量化のためオプション）
                if (boss.turnAtkUp === 0 && boss.turnAtkMax === 0) {
                    delete boss.turnAtkUpStartTurn;
                    delete boss.turnAtkUp;
                    delete boss.turnAtkMax;
                    deletedFieldsCount += 3;
                }

                if (boss.hitAtkUp === 0 && boss.hitAtkMax === 0) {
                    delete boss.hitAtkUp;
                    delete boss.hitAtkMax;
                    deletedFieldsCount += 2;
                }

                if (boss.hpAtkThreshold === 0 && boss.hpAtkUp === 0) {
                    delete boss.hpAtkThreshold;
                    delete boss.hpAtkUp;
                    deletedFieldsCount += 2;
                }

                if (boss.appearEntries && boss.appearEntries.length === 0) {
                    delete boss.appearEntries;
                    deletedFieldsCount += 1;
                }

                if (boss.aoeDamage === 0) {
                    delete boss.aoeDamage;
                    deletedFieldsCount += 1;
                }

                if (boss.saBuffMod === 0) {
                    delete boss.saBuffMod;
                    deletedFieldsCount += 1;
                }

                fieldsToDelete.forEach(field => {
                    if (boss.hasOwnProperty(field)) {
                        delete boss[field];
                        deletedFieldsCount++;
                    }
                });
            });
        });
    });
});

console.log(`圧縮の準備完了: ${bossCount}体のボスから、合計${deletedFieldsCount}個のプロパティを削除しました。`);

// 上書き保存（インデントなしでさらに容量削減）
console.log('ファイルの保存中...');
fs.writeFileSync(srcFile, JSON.stringify(data), 'utf8');

let newSize = fs.statSync(srcFile).size;
console.log(`完了！`);
console.log(`元のサイズ: ${(initialSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`今のサイズ: ${(newSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`削減量: ${((initialSize - newSize) / 1024 / 1024).toFixed(2)} MB (${Math.round((initialSize - newSize) / initialSize * 100)}%)`);
