const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'dokkan_calc_final.js');
let code = fs.readFileSync(FILE, 'utf8');

// ==== 修正箇所 1: renderDynamicAttacks 内の計算式 ====
// `if (atk.isCrit || is_critical) {`
const search1 = 'if (atk.isCrit || is_critical) {';
const startIdx1 = code.indexOf(search1);
if (startIdx1 !== -1) {
    // `const dmg = Math.max...` の行までを探す
    const endSearch1 = 'const dmg = Math.max(0, ((atk.value * atkCritMod_local) * attrMod_local * dr_mod - defForCalc)) * guardMod_local;';
    const endIdx1 = code.indexOf(endSearch1, startIdx1);
    if (endIdx1 !== -1) {
        const oldBlock1 = code.substring(startIdx1, endIdx1 + endSearch1.length);

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

        code = code.replace(oldBlock1, NEW_BLOCK_1);
        console.log('Patch 1 applied successfully.');
    } else {
        console.error('ERROR: Block 1 end limit not found.');
    }
} else {
    console.error('ERROR: Block 1 start not found.');
}

// ==== 修正箇所 2: 手動ダメージ計算式の修正 ====
const search2 = 'const enemy_atk_input = (parseFloat(scenarioData.enemy_atk) || 0) * 10000;';
const startIdx2 = code.indexOf(search2, 177000); // 17万行目以降の部分
if (startIdx2 !== -1) {
    const endSearch2 = 'const damage_taken = Math.max(0, ((enemy_atk_input * atk_crit_mod) * attr_mod * dr_mod - final_def_crit_mod)) * guard_mod;';
    const endIdx2 = code.indexOf(endSearch2, startIdx2);
    if (endIdx2 !== -1) {
        const oldBlock2 = code.substring(startIdx2, endIdx2 + endSearch2.length);
        const NEW_BLOCK_2 = `const enemy_atk_input = (parseFloat(scenarioData.enemy_atk) || 0) * 10000;
          // 手動入力の場合、自キャラの会心補正（atk_crit_mod等）は被ダメに関係ないので適用しない
          const damage_taken = Math.max(0, ((enemy_atk_input * 1.0) * attr_mod * dr_mod - final_def)) * guard_mod;`;
        code = code.replace(oldBlock2, NEW_BLOCK_2);
        console.log('Patch 2 applied successfully.');
    } else {
        console.error('ERROR: Block 2 end limit not found.');
    }
} else {
    console.error('ERROR: Block 2 start not found.');
}

fs.writeFileSync(FILE, code, 'utf8');
console.log('File written.');
