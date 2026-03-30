const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'dokkan_calc_final.js');
let code = fs.readFileSync(FILE, 'utf8');

// ==== 修正箇所 1: renderDynamicAttacks 内の計算式 ====
// L177205付近
// `if (atk.isCrit || is_critical)`
const search1 = 'if (atk.isCrit || is_critical)';
const startIdx1 = code.indexOf(search1);
let success = false;
if (startIdx1 !== -1) {
    // `const dmg = Math.max`
    const endSearch1 = 'const dmg = Math.max';
    const endIdx1 = code.indexOf(endSearch1, startIdx1);
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
            success = true;
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

if (success) {
    fs.writeFileSync(FILE, code, 'utf8');
    console.log('File written.');
} else {
    // デバッグ用: 周辺のテキストを表示
    const dmgIdx = code.indexOf('const dmg = Math.max(0,', 177000);
    if (dmgIdx !== -1) console.log(code.substring(dmgIdx - 300, dmgIdx + 150));
}
