const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'dokkan_calc_final.js');
let code = fs.readFileSync(FILE, 'utf8');

// ==== 修正箇所 1: renderDynamicAttacks 内の計算式 ====
// L177205付近
const startIdx1 = code.indexOf('if (atk.isCrit || is_critical) {');
if (startIdx1 !== -1) {
    const endIdx1 = code.indexOf('const dmg = Math.max(0,', startIdx1);
    if (endIdx1 !== -1) {
        const nextLineEnd = code.indexOf(';', endIdx1);
        if (nextLineEnd !== -1) {
            const oldBlock1 = code.substring(startIdx1, nextLineEnd + 1);

            const NEW_BLOCK_1 = `if (atk.isCrit) {
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

            code = code.replace(oldBlock1, NEW_BLOCK_1);
            console.log('Patch 1 applied successfully.');
        } else {
            console.error('ERROR: Block 1 nextLineEnd not found.');
        }
    } else {
        console.error('ERROR: Block 1 endIdx1 not found.');
    }
} else {
    console.error('ERROR: Block 1 startIdx1 not found.');
}

// ==== 修正箇所 2: 手動ダメージ計算式の修正 ====
// L177247付近
const startIdx2 = code.indexOf('const enemy_atk_input = (parseFloat(scenarioData.enemy_atk) || 0) * 10000;', 170000);
if (startIdx2 !== -1) {
    const endIdx2 = code.indexOf('const damage_taken = Math.max(0,', startIdx2);
    if (endIdx2 !== -1) {
        const nextLineEnd2 = code.indexOf(';', endIdx2);
        if (nextLineEnd2 !== -1) {
            const oldBlock2 = code.substring(startIdx2, nextLineEnd2 + 1);
            const NEW_BLOCK_2 = `const enemy_atk_input = (parseFloat(scenarioData.enemy_atk) || 0) * 10000;
          // 手動入力の場合、自キャラの会心補正（atk_crit_mod等）は被ダメに関係ないので適用しない
          const damage_taken = Math.max(0, ((enemy_atk_input * 1.0) * attr_mod * dr_mod - final_def)) * guard_mod;`;
            code = code.replace(oldBlock2, NEW_BLOCK_2);
            console.log('Patch 2 applied successfully.');
        } else {
            console.error('ERROR: Block 2 nextLineEnd2 not found.');
        }
    } else {
        console.error('ERROR: Block 2 endIdx2 not found.');
    }
} else {
    console.error('ERROR: Block 2 startIdx2 not found.');
}

fs.writeFileSync(FILE, code, 'utf8');
console.log('File written.');
