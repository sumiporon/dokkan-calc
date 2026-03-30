const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'dokkan_calc_final.js');
let code = fs.readFileSync(FILE, 'utf8');

// ==== 修正箇所 1: renderDynamicAttacks 内の計算式 ====
// `if (atk.isCrit || is_critical) {` から始まり、
// `const dmg = Math.max(0, ((atk.value * atkCritMod_local) * attrMod_local * dr_mod - defForCalc)) * guardMod_local;`
// で終わるブロックを置換する。

const OLD_REGEX_1 = /if\s*\(atk\.isCrit\s*\|\|\s*is_critical\)\s*\{[\s\S]*?const\s+dmg\s*=\s*Math\.max\(0,\s*\(\(atk\.value\s*\*\s*atkCritMod_local\)\s*\*\s*attrMod_local\s*\*\s*dr_mod\s*-\s*defForCalc\)\)\s*\*\s*guardMod_local;/m;

const NEW_BLOCK_1 = `// 敵の攻撃が会心（atk.isCrit=true）の場合のみ、敵側の会心補正を適用する
                // （※is_critical は自キャラの会心フラグなので被ダメには関係ない）
                if (atk.isCrit) {
                  // 敵の固有会心設定(d.critAtkUp等)があれば利用
                  const e_def_down = d.critDefDown || 0;
                  // ドッカンの敵会心は属性相性を無視して大ダメージになる簡易処理
                  attrMod_local = 1.9; // 敵会心による大ダメージ補正
                  defForCalc = final_def * (1 - (e_def_down / 100));

                  if (!is_guard) {
                    guardMod_local = 1.0;
                  }
                }

                // 修正: atkCritMod_local(自キャラの会心補正)は使用しない
                const dmg = Math.max(0, ((atk.value * 1.0) * attrMod_local * dr_mod - defForCalc)) * guardMod_local;`;

if (OLD_REGEX_1.test(code)) {
    code = code.replace(OLD_REGEX_1, NEW_BLOCK_1);
    console.log('Patch 1 applied.');
} else {
    console.error('ERROR: Block 1 not found via regex.');
}

// ==== 修正箇所 2: 手動ダメージ計算式の修正 ====
// `const enemy_atk_input = (parseFloat(scenarioData.enemy_atk) || 0) * 10000;`
// `const damage_taken = Math.max(0, ((enemy_atk_input * atk_crit_mod) * attr_mod * dr_mod - final_def_crit_mod)) * guard_mod;`

const OLD_REGEX_2 = /const\s+enemy_atk_input\s*=\s*\(\s*parseFloat\(scenarioData\.enemy_atk\)\s*\|\|\s*0\s*\)\s*\*\s*10000;[\s\n]*const\s+damage_taken\s*=\s*Math\.max\(0,\s*\(\(enemy_atk_input\s*\*\s*atk_crit_mod\)\s*\*\s*attr_mod\s*\*\s*dr_mod\s*-\s*final_def_crit_mod\)\)\s*\*\s*guard_mod;/m;

const NEW_BLOCK_2 = `const enemy_atk_input = (parseFloat(scenarioData.enemy_atk) || 0) * 10000;
          // 手動入力の場合、自キャラの会心補正（atk_crit_mod等）は被ダメに関係ないので適用しない
          const damage_taken = Math.max(0, ((enemy_atk_input * 1.0) * attr_mod * dr_mod - final_def)) * guard_mod;`;

if (OLD_REGEX_2.test(code)) {
    code = code.replace(OLD_REGEX_2, NEW_BLOCK_2);
    console.log('Patch 2 applied.');
} else {
    console.error('ERROR: Block 2 not found via regex.');
}

fs.writeFileSync(FILE, code, 'utf8');
console.log('Done.');
