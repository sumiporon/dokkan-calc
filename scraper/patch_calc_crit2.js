const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '..', 'dokkan_calc_final.js');
let content = fs.readFileSync(targetFile, 'utf8');

const targetStr = `              dynamicAttacks.forEach(atk => {
                let atkCritMod_local = atk_crit_mod;
                let attrMod_local = attr_mod;
                let guardMod_local = guard_mod;
                let defForCalc = final_def_crit_mod;

                if (atk.isCrit && !is_critical) {
                  // 必殺時会心: 会心補正をここで適用
                  atkCritMod_local = 1;
                  if (!is_guard) {
                    attrMod_local = 1.0;
                    guardMod_local = 1.0;
                    if (group1_advantage_status === 'advantage' && attr_def_up > 0) {
                      attrMod_local -= ((parseFloat(attr_def_up) || 0) * 0.01);
                    }
                  }
                  defForCalc = final_def;
                }`;

const replaceStr = `              dynamicAttacks.forEach(atk => {
                // 基本の補正値は「非会心」の状態で初期化し、atk.isCrit が真のときのみ会心補正を乗せる
                let atkCritMod_local = 1.0;
                let defForCalc = final_def;
                let attrMod_local = 1.0;
                let guardMod_local = (group1_advantage_status === 'advantage') ? 0.5 : 1.0;
                
                const is_same_class = own_class === enemy_class;
                if (is_same_class) {
                  if (group1_advantage_status === 'advantage') attrMod_local = 0.9;
                  else if (group1_advantage_status === 'disadvantage') attrMod_local = 1.25;
                } else {
                  if (group1_advantage_status === 'advantage') attrMod_local = 1.0;
                  else if (group1_advantage_status === 'disadvantage') attrMod_local = 1.5;
                  else attrMod_local = 1.15;
                }

                if (is_guard) {
                  attrMod_local = 0.8;
                  guardMod_local = 0.5;
                }
                
                if (group1_advantage_status === 'advantage' && attr_def_up > 0) {
                  attrMod_local -= ((parseFloat(attr_def_up) || 0) * 0.01);
                }

                // 攻撃が会心（isCrit=true）、または敵自体が全体として会心（is_critical=true）の場合
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

if (content.includes(targetStr)) {
    content = content.replace(targetStr, replaceStr);
    fs.writeFileSync(targetFile, content, 'utf8');
    console.log('Successfully replaced dokkan_calc_final.js JS logic (fixed crit applied to all attacks).');
} else {
    console.log('Target string not found!');
}
