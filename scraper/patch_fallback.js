/**
 * patch_fallback.js
 * baseAtk が undefined の旧データでも動くようにフォールバック処理を追加
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'dokkan_calc_final.js');
let content = fs.readFileSync(filePath, 'utf8');
let patchCount = 0;

// 動的計算の冒頭でbaseAtkが無ければ attacks[0] (通常) の値から推定する
const FIND = `          if (loadedEnemyData.baseAtk <= 0) {
            dynContainer.innerHTML = '<p>この敵にはATKデータがありません。</p>';`;

const REPLACE = `          // 旧データにbaseAtkが無い場合のフォールバック
          if (!loadedEnemyData.baseAtk && loadedEnemyData.attacks && loadedEnemyData.attacks.length > 0) {
            const normalAtk = loadedEnemyData.attacks.find(a => a.name === '通常');
            if (normalAtk) {
              loadedEnemyData.baseAtk = normalAtk.value;
              // saMulti推定: 必殺のvalue / 通常のvalue
              const saAtk = loadedEnemyData.attacks.find(a => a.name === '必殺' || a.name.includes('必殺'));
              loadedEnemyData.saMulti = saAtk ? saAtk.value / normalAtk.value : 3;
              loadedEnemyData.saBuffMod = loadedEnemyData.saBuffMod || 0;
              const aoeAtk = loadedEnemyData.attacks.find(a => a.name === '全体攻撃');
              loadedEnemyData.aoeDamage = aoeAtk ? aoeAtk.value : 0;
              loadedEnemyData.hasSaCrit = loadedEnemyData.hasSaCrit || false;
              loadedEnemyData.turnAtkUp = loadedEnemyData.turnAtkUp || 0;
              loadedEnemyData.turnAtkMax = loadedEnemyData.turnAtkMax || 0;
              loadedEnemyData.hitAtkUp = loadedEnemyData.hitAtkUp || 0;
              loadedEnemyData.hitAtkMax = loadedEnemyData.hitAtkMax || 0;
              loadedEnemyData.hpAtkUp = loadedEnemyData.hpAtkUp || 0;
              loadedEnemyData.hpAtkThreshold = loadedEnemyData.hpAtkThreshold || 0;
              loadedEnemyData.appearEntries = loadedEnemyData.appearEntries || [];
            }
          }

          if (!loadedEnemyData.baseAtk || loadedEnemyData.baseAtk <= 0) {
            dynContainer.innerHTML = '<p>この敵にはATKデータがありません。</p>';`;

if (content.includes(FIND)) {
    content = content.replace(FIND, REPLACE);
    patchCount++;
    console.log('Patch OK: baseAtkフォールバック処理を追加');
} else {
    console.error('Patch FAILED: ターゲットが見つかりません');
}

// デバッグログを削除
const DBG1 = `\n      console.log('[DEBUG] selectedMode:', selectedMode, 'loadedEnemyData:', loadedEnemyData ? {name: loadedEnemyData.name, baseAtk: loadedEnemyData.baseAtk, attackCount: loadedEnemyData.attacks?.length} : null);`;
if (content.includes(DBG1)) {
    content = content.replace(DBG1, '');
    console.log('Debug log 1 removed');
}

const DBG2 = `\n          console.log('[DEBUG] Loaded boss:', boss.name, 'baseAtk:', boss.baseAtk, 'attacks:', boss.attacks?.length);`;
if (content.includes(DBG2)) {
    content = content.replace(DBG2, '');
    console.log('Debug log 2 removed');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log(`完了: ${patchCount}個のパッチを適用`);
