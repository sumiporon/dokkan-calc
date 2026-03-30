/**
 * patch_fix_crit.js - 会心判定のスコープバグ修正パッチ
 * updateScenarioResults内でis_critical等の変数がundefinedのため、攻撃パターンが表示されない
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'dokkan_calc_final.js');
console.log('Reading file...');
let content = fs.readFileSync(filePath, 'utf8');
console.log('File size:', content.length);

let patchCount = 0;

// ===== Patch A: updateScenarioResults にスコープ変数を追加 =====
// 会心の個別計算に必要な変数を scenarioData から取得する行を追加
const PA_FIND = `      const calcResults = calculateNewDurability(scenarioData);
      const { final_def, final_def_crit_mod, attr_mod, guard_mod, dr_mod, atk_crit_mod } = calcResults;`;

const PA_REPLACE = `      const calcResults = calculateNewDurability(scenarioData);
      const { final_def, final_def_crit_mod, attr_mod, guard_mod, dr_mod, atk_crit_mod, group1_advantage_status } = calcResults;
      const is_critical = scenarioData.is_critical || false;
      const crit_atk_up = scenarioData.crit_atk_up || 0;
      const crit_def_down = scenarioData.crit_def_down || 0;
      const attr_def_up = scenarioData.attr_def_up || 0;
      const is_guard = scenarioData.is_guard || false;`;

if (content.includes(PA_FIND)) {
    content = content.replace(PA_FIND, PA_REPLACE);
    patchCount++;
    console.log('Patch A OK: スコープ変数をupdateScenarioResultsに追加');
} else {
    console.error('Patch A FAILED: ターゲットが見つかりません');
}

// ===== Patch B: calculateNewDurability の戻り値に group1_advantage_status を追加 =====
const PB_FIND = `      return {
        final_def: final_def,
        final_def_crit_mod: final_def * def_crit_mod,
        attr_mod: Math.max(0, attr_mod),
        guard_mod,
        dr_mod,
        atk_crit_mod
      };`;

const PB_REPLACE = `      return {
        final_def: final_def,
        final_def_crit_mod: final_def * def_crit_mod,
        attr_mod: Math.max(0, attr_mod),
        guard_mod,
        dr_mod,
        atk_crit_mod,
        group1_advantage_status
      };`;

if (content.includes(PB_FIND)) {
    content = content.replace(PB_FIND, PB_REPLACE);
    patchCount++;
    console.log('Patch B OK: calculateNewDurabilityの戻り値にgroup1_advantage_statusを追加');
} else {
    console.error('Patch B FAILED: ターゲットが見つかりません');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log(`完了: ${patchCount}個のパッチを適用`);
