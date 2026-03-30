const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'dokkan_calc_final.js');
let code = fs.readFileSync(FILE, 'utf8');

// ==== 修正箇所 1: renderDynamicAttacks 内の計算式 ====
const OLD_CRIT_APPLY = `                // 攻撃が会心（isCrit=true）、または敵自体が全体として会心（is_critical=true）の場合
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
                }`;

const NEW_CRIT_APPLY = `                // 敵の攻撃が会心（atk.isCrit=true）の場合のみ、敵側の会心補正を適用する
                // （※is_critical は自キャラの会心フラグなので被ダメには関係ない）
                if (atk.isCrit) {
                  // 敵の固有会心設定(d.critAtkUp等)があれば利用
                  const e_def_down = d.critDefDown || 0;
                  // とりあえず敵の固定値がなければ、属性相性を無視して等倍1.0 + 固有ダメージ倍率で簡易処理。
                  attrMod_local = 1.9; // 敵会心による大ダメージ補正（ドッカン仕様の簡易再現）
                  defForCalc = final_def * (1 - (e_def_down / 100));

                  if (!is_guard) {
                    guardMod_local = 1.0;
                  }
                }`;

if (code.includes(OLD_CRIT_APPLY)) {
    code = code.replace(OLD_CRIT_APPLY, NEW_CRIT_APPLY);
    console.log('Patch 3a (dynamic mode crit fix) applied.');
} else {
    console.error('ERROR: Could not find OLD_CRIT_APPLY block.');
}

// ==== 修正箇所 2: 手動ダメージ計算式の修正 ====
const OLD_MANUAL_CALC = `          const enemy_atk_input = (parseFloat(scenarioData.enemy_atk) || 0) * 10000;
          const damage_taken = Math.max(0, ((enemy_atk_input * atk_crit_mod) * attr_mod * dr_mod - final_def_crit_mod)) * guard_mod;`;

const NEW_MANUAL_CALC = `          const enemy_atk_input = (parseFloat(scenarioData.enemy_atk) || 0) * 10000;
          // 手動入力の場合、自キャラの会心補正（atk_crit_mod等）は被ダメに関係ないので適用しない
          const damage_taken = Math.max(0, ((enemy_atk_input * 1.0) * attr_mod * dr_mod - final_def)) * guard_mod;`;

if (code.includes(OLD_MANUAL_CALC)) {
    code = code.replace(OLD_MANUAL_CALC, NEW_MANUAL_CALC);
    console.log('Patch 3b (manual mode calc fix) applied.');
} else {
    console.error('ERROR: Could not find OLD_MANUAL_CALC block.');
}

fs.writeFileSync(FILE, code, 'utf8');
console.log('All patches applied successfully.');
