const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'dokkan_calc_final.js');
let code = fs.readFileSync(FILE, 'utf8');

// ==== 修正箇所 1: renderDynamicAttacks 内の計算式 ====
// 先のパッチで一部変更されている可能性があるため、
// `if (atk.isCrit) {` もしくは `if (atk.isCrit || is_critical) {` から 
// `const dmg = Math.max` までの範囲を再置換する。

const startSearchStr = 'if (atk.isCrit) {\r\n                  // 敵の固有会心設定';
let startIdx = code.indexOf(startSearchStr);
if (startIdx === -1) {
    startIdx = code.indexOf('if (atk.isCrit) {\n                  // 敵の固有会心設定');
}

if (startIdx !== -1) {
    const endSearch1 = 'const dmg = Math.max(0, ((atk.value * atkCritMod_local) * attrMod_local * dr_mod - defForCalc)) * guardMod_local;';
    const endIdx1 = code.indexOf(endSearch1, startIdx);

    if (endIdx1 !== -1) {
        const oldBlock1 = code.substring(startIdx, endIdx1 + endSearch1.length);

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
        console.log('Patch applied successfully to fix the corrupted block.');
    } else {
        // 既に修正済みの可能性があるか確認
        if (code.includes('const dmg = Math.max(0, ((atk.value * 1.0) * attrMod_local * dr_mod - defForCalc)) * guardMod_local;')) {
            console.log('Already fixed (dmg formula has 1.0).');
        } else {
            console.error('ERROR: Could not find the end of block to replace.');
        }
    }
} else {
    console.error('ERROR: Could not find the start of the corrupted block.');
}

fs.writeFileSync(FILE, code, 'utf8');
console.log('File written.');
