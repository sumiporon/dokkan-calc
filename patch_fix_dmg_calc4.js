const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'dokkan_calc_final.js');
let code = fs.readFileSync(FILE, 'utf8');

// ==== 修正箇所 1: renderDynamicAttacks 内の計算式 (L177205-177219付近) ====
const STR_1_OLD = `                // 攻撃が会心（isCrit=true）、または敵自体が全体として会心（is_critical=true）の場合
                if (atk.isCrit || is_critical) {
                  const c_atk_up = parseFloat(crit_atk_up) || 0;
                  const c_def_down = parseFloat(crit_def_down) || 0;
                  atkCritMod_local = 1 + (c_atk_up / 100);
                  defForCalc = final_def * (1 - (c_def_down / 100));

                  if (!is_guard) {
                    attrMod_local = 1.0;
                    guardMod_local = 1.0;
                    if (group1_advantage_status === 'advantage' && attr_def_up > 0) {
                      attrMod_local -= ((parseFloat(attr_def_up) || 0) * 0.01);
                    }
                  }
                }

                const dmg = Math.max(0, ((atk.value * atkCritMod_local) * attrMod_local * dr_mod - defForCalc)) * guardMod_local;`;

const STR_1_NEW = `                // 敵の攻撃が会心（atk.isCrit=true）の場合のみ、敵側の会心補正を適用する
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

// LF / CRLF の違いを吸収するため、code全体をいったんLFに統一してから置換する
let codeLF = code.replace(/\\r\\n/g, '\\n');
const search1 = STR_1_OLD.replace(/\\r\\n/g, '\\n');

if (codeLF.includes(search1)) {
    codeLF = codeLF.replace(search1, STR_1_NEW);
    console.log('Patch 1 applied');
} else {
    console.error('ERROR: Block 1 not found. Writing partial search log:');
    const partial = 'const dmg = Math.max(0, ((atk.value * atkCritMod_local) * attrMod_local * dr_mod - defForCalc)) * guardMod_local;';
    console.error('Contains partial line?', codeLF.includes(partial));
}


// ==== 修正箇所 2: 手動ダメージ計算式の修正 (L177247-177248付近) ====
const STR_2_OLD = `          const enemy_atk_input = (parseFloat(scenarioData.enemy_atk) || 0) * 10000;
          const damage_taken = Math.max(0, ((enemy_atk_input * atk_crit_mod) * attr_mod * dr_mod - final_def_crit_mod)) * guard_mod;`;

const STR_2_NEW = `          const enemy_atk_input = (parseFloat(scenarioData.enemy_atk) || 0) * 10000;
          // 手動入力の場合、自キャラの会心補正（atk_crit_mod等）は被ダメに関係ないので適用しない
          const damage_taken = Math.max(0, ((enemy_atk_input * 1.0) * attr_mod * dr_mod - final_def)) * guard_mod;`;

const search2 = STR_2_OLD.replace(/\\r\\n/g, '\\n');
if (codeLF.includes(search2)) {
    codeLF = codeLF.replace(search2, STR_2_NEW);
    console.log('Patch 2 applied');
} else {
    console.error('ERROR: Block 2 not found.');
}

// OSに従った改行(CRLF)に戻して保存する
fs.writeFileSync(FILE, codeLF.replace(/\\n/g, '\\r\\n'), 'utf8');
console.log('Done.');
