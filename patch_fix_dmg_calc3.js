const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'dokkan_calc_final.js');
let code = fs.readFileSync(FILE, 'utf8');

// ==== 修正箇所 1: renderDynamicAttacks 内の計算式 ====
// `if (atk.isCrit || is_critical) {` -> `if (atk.isCrit) {`
// `atkCritMod_local = 1 + (c_atk_up / 100);` -> `attrMod_local = 1.9;`
// `defForCalc = final_def * (1 - (c_def_down / 100));` -> `const e_def_down = d.critDefDown || 0; defForCalc = final_def * (1 - (e_def_down / 100));`

const OLD_BLOCK_1_START = 'if (atk.isCrit || is_critical) {';
const OLD_BLOCK_1_END = 'const dmg = Math.max(0, ((atk.value * atkCritMod_local) * attrMod_local * dr_mod - defForCalc)) * guardMod_local;';

const startIdx = code.indexOf(OLD_BLOCK_1_START);
if (startIdx !== -1) {
    const endIdx = code.indexOf(OLD_BLOCK_1_END, startIdx) + OLD_BLOCK_1_END.length;
    const oldBlock = code.substring(startIdx, endIdx);

    const NEW_BLOCK = `// 敵の攻撃が会心（atk.isCrit=true）の場合のみ、敵側の会心補正を適用する
                // （※is_critical は自キャラの会心フラグなので被ダメには関係ない）
                if (atk.isCrit) {
                  // 敵の固有会心設定(d.critAtkUp等)があれば利用
                  const e_def_down = d.critDefDown || 0;
                  // ドッカンの敵会心は属性相性を無視して大ダメージになる簡易処理
                  attrMod_local = 1.9; // 実質的な敵会心倍率
                  defForCalc = final_def * (1 - (e_def_down / 100));

                  if (!is_guard) {
                    guardMod_local = 1.0;
                  }
                }

                // 修正: atkCritMod_local(自キャラの会心補正)は使用しない
                const dmg = Math.max(0, ((atk.value * 1.0) * attrMod_local * dr_mod - defForCalc)) * guardMod_local;`;

    code = code.replace(oldBlock, NEW_BLOCK);
    console.log('Patch 3a applied.');
} else {
    console.error('ERROR: Could not find block 1');
}

// ==== 修正箇所 2: 手動ダメージ計算式の修正 ====
// `const damage_taken = Math.max(0, ((enemy_atk_input * atk_crit_mod) * attr_mod * dr_mod - final_def_crit_mod)) * guard_mod;`
const OLD_MANUAL_CALC = 'const damage_taken = Math.max(0, ((enemy_atk_input * atk_crit_mod) * attr_mod * dr_mod - final_def_crit_mod)) * guard_mod;';
const NEW_MANUAL_CALC = '// 手動入力の場合、自キャラの会心補正（atk_crit_modやfinal_def_crit_mod）は被ダメに関係ないので適用しない\\n          const damage_taken = Math.max(0, ((enemy_atk_input * 1.0) * attr_mod * dr_mod - final_def)) * guard_mod;';

if (code.includes(OLD_MANUAL_CALC)) {
    code = code.replace(OLD_MANUAL_CALC, NEW_MANUAL_CALC.replace(/\\\\n/g, '\\n'));
    console.log('Patch 3b applied.');
} else {
    console.error('ERROR: Could not find block 2');
}

fs.writeFileSync(FILE, code, 'utf8');
console.log('Patches saved.');
