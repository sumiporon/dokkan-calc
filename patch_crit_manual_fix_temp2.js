const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const tempDir = 'C:\\Temp';
const fileName = 'dokkan_calc_final.js';
const srcFile = path.join(srcDir, fileName);
const tempFile = path.join(tempDir, fileName);

if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
fs.copyFileSync(srcFile, tempFile);

let content = fs.readFileSync(tempFile, 'utf8');

const oldManualMode = `        } else {
          enemyAtkGroup.style.display = 'block';
          const enemy_atk_input = (parseFloat(scenarioData.enemy_atk) || 0) * 10000;

          let atkCritMod_local = 1.0;
          let defForCalc = final_def;

          if (is_critical) {
            const critAtkUpVal = parseFloat(crit_atk_up) || 0;
            const critDefDownVal = parseFloat(crit_def_down) || 0;

            if (critAtkUpVal === 0 && critDefDownVal === 0) {
              resultSection.innerHTML = \`
                    <div class="manual-damage-result" style="padding:0.5rem; border: 1px solid var(--border-color); border-radius: 5px;">
                        <div class="attack-details" style="display:flex; justify-content:space-between; align-items:center;">
                            <span class="attack-stat" style="font-weight:bold;">敵ATK: \${formatNumber(enemy_atk_input)} <span style="background:#dc3545;color:white;padding:0.1rem 0.3rem;border-radius:3px;font-size:0.7rem;">会心</span></span>
                        </div>
                        <div style="font-size:0.8rem;color:#ffc107;margin-top:0.2rem;">\u26a0\ufe0f 条件が設定されていません。</div>
                        <div style="text-align:right; font-size:1.1rem; font-weight:bold; color:var(--secondary-color);">被ダメ: --</div>
                    </div>
                \`;
              return;
            } else {
              atkCritMod_local = 1 + (critAtkUpVal / 100);
              defForCalc = final_def * (1 - (critDefDownVal / 100));
            }
          }

          const damage_taken = Math.max(0, ((enemy_atk_input * atkCritMod_local) * attr_mod * dr_mod - defForCalc)) * guard_mod;
          const critBadge = is_critical ? ' <span style="background:#dc3545;color:white;padding:0.1rem 0.3rem;border-radius:3px;font-size:0.7rem;">会心</span>' : '';

          resultSection.innerHTML = \`
                    <div class="manual-damage-result">
                        <div class="attack-details">
                            <span class="attack-stat">敵ATK: \${formatNumber(enemy_atk_input)}\${critBadge}</span>
                            <span class="arrow">→</span>
                            <span class="damage-value">被ダメ: \${formatNumber(damage_taken)}</span>
                        </div>
                    </div>
                \`;
        }`;


const newManualMode = `        } else {
          enemyAtkGroup.style.display = 'block';
          const enemy_atk_input = (parseFloat(scenarioData.enemy_atk) || 0) * 10000;

          let atkCritMod_local = 1.0;
          let defForCalc = final_def;
          let attrMod_local = attr_mod;
          let guardMod_local = guard_mod;
          
          if (is_critical) {
            const critAtkUpVal = parseFloat(crit_atk_up) || 0;
            const critDefDownVal = parseFloat(crit_def_down) || 0;

            if (critAtkUpVal === 0 && critDefDownVal === 0) {
              resultSection.innerHTML = \`
                    <div class="manual-damage-result" style="padding:0.5rem; border: 1px solid var(--border-color); border-radius: 5px;">
                        <div class="attack-details" style="display:flex; justify-content:space-between; align-items:center;">
                            <span class="attack-stat" style="font-weight:bold;">敵ATK: \${formatNumber(enemy_atk_input)} <span style="background:#dc3545;color:white;padding:0.1rem 0.3rem;border-radius:3px;font-size:0.7rem;">会心</span></span>
                        </div>
                        <div style="font-size:0.8rem;color:#ffc107;margin-top:0.2rem;">\u26a0\ufe0f 条件が設定されていません。</div>
                        <div style="text-align:right; font-size:1.1rem; font-weight:bold; color:var(--secondary-color);">被ダメ: --</div>
                    </div>
                \`;
              return;
            } else {
              atkCritMod_local = 1 + (critAtkUpVal / 100);
              defForCalc = final_def * (1 - (critDefDownVal / 100));
              
              if (is_guard) {
                 attrMod_local = 0.8;
                 guardMod_local = 0.5;
                 if (group1_advantage_status === 'advantage' && attr_def_up > 0) {
                    attrMod_local -= ((parseFloat(attr_def_up) || 0) * 0.01);
                 }
              } else {
                 attrMod_local = 1.0;
                 guardMod_local = 1.0;
                 if (group1_advantage_status === 'advantage' && attr_def_up > 0) {
                    attrMod_local -= ((parseFloat(attr_def_up) || 0) * 0.01);
                 }
              }
            }
          }

          const damage_taken = Math.max(0, ((enemy_atk_input * atkCritMod_local) * attrMod_local * dr_mod - defForCalc)) * guardMod_local;
          const critBadge = is_critical ? ' <span style="background:#dc3545;color:white;padding:0.1rem 0.3rem;border-radius:3px;font-size:0.7rem;">会心</span>' : '';

          resultSection.innerHTML = \`
                    <div class="manual-damage-result">
                        <div class="attack-details">
                            <span class="attack-stat">敵ATK: \${formatNumber(enemy_atk_input)}\${critBadge}</span>
                            <span class="arrow">→</span>
                            <span class="damage-value">被ダメ: \${formatNumber(damage_taken)}</span>
                        </div>
                    </div>
                \`;
        }`;

if (content.includes(oldManualMode)) {
    content = content.replace(oldManualMode, newManualMode);
    fs.writeFileSync(tempFile, content, 'utf8');
    fs.copyFileSync(tempFile, srcFile);
    console.log('PATCH OK');
} else {
    console.log('PATCH FAIL - target block not found.');
    console.log('Index of part 1: ', content.indexOf('        } else {\\n          enemyAtkGroup.style.display'));
}
