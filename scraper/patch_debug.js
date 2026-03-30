/**
 * patch_debug.js
 * 一時的なデバッグログを追加して問題を特定する
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'dokkan_calc_final.js');
let content = fs.readFileSync(filePath, 'utf8');

let patchCount = 0;

// 1. updateScenarioResults の冒頭にデバッグログ追加
const FIND1 = "const loadedEnemyData = card.dataset.loadedEnemy ? JSON.parse(card.dataset.loadedEnemy) : null;";

const REPLACE1 = `const loadedEnemyData = card.dataset.loadedEnemy ? JSON.parse(card.dataset.loadedEnemy) : null;
      console.log('[DEBUG] selectedMode:', selectedMode, 'loadedEnemyData:', loadedEnemyData ? {name: loadedEnemyData.name, baseAtk: loadedEnemyData.baseAtk, attackCount: loadedEnemyData.attacks?.length} : null);`;

if (content.includes(FIND1)) {
    // 最後のoccurrenceだけ置換（updateScenarioResults内のもの）
    const lastIdx = content.lastIndexOf(FIND1);
    content = content.substring(0, lastIdx) + REPLACE1 + content.substring(lastIdx + FIND1.length);
    patchCount++;
    console.log('Patch 1 OK: デバッグログ追加');
} else {
    console.error('Patch 1 FAILED');
}

// 2. 反映ボタンにもデバッグログ追加
const FIND2 = "card.dataset.loadedEnemy = JSON.stringify(boss);";
const REPLACE2 = `card.dataset.loadedEnemy = JSON.stringify(boss);
          console.log('[DEBUG] Loaded boss:', boss.name, 'baseAtk:', boss.baseAtk, 'attacks:', boss.attacks?.length);`;

if (content.includes(FIND2)) {
    content = content.replace(FIND2, REPLACE2);
    patchCount++;
    console.log('Patch 2 OK: 反映ボタンにデバッグログ追加');
} else {
    console.error('Patch 2 FAILED');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log(`完了: ${patchCount}個のパッチを適用`);
console.log('ブラウザのF12 > Consoleを開いてから、ページをリロードして「反映」を押してください');
