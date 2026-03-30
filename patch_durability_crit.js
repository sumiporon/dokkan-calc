const fs = require('fs');
const path = require('path');

const jsPath = 'c:/Users/kou20/OneDrive - 甲南大学/デスクトップ/ドッカン計算/dokkan_calc_final.js';
let content = fs.readFileSync(jsPath, 'utf8');

const targetStr = `        const resultBody = resultSection.querySelector('.result-body');
        durabilityLines.forEach(line => {
          const dmg = line.value;
          const requiredEnemyAtk = ((dmg / guard_mod) + final_def_crit_mod) / (attr_mod * dr_mod * atk_crit_mod);
          const row = resultBody.insertRow();
          row.innerHTML = \\\`<th>\\${line.name}</th><td>\\${formatNumber(requiredEnemyAtk)}</td>\\\`;
        });`;

const replaceStr = `        const resultBody = resultSection.querySelector('.result-body');
        const isCritUnconfigured = is_critical && (parseFloat(crit_atk_up) || 0) === 0 && (parseFloat(crit_def_down) || 0) === 0;
        
        durabilityLines.forEach(line => {
          const dmg = line.value;
          let atkDisplay = "";
          if (isCritUnconfigured) {
              atkDisplay = "--";
          } else {
              const requiredEnemyAtk = ((dmg / guard_mod) + final_def_crit_mod) / (attr_mod * dr_mod * atk_crit_mod);
              atkDisplay = formatNumber(requiredEnemyAtk);
          }
          const row = resultBody.insertRow();
          row.innerHTML = \\\`<th>\\${line.name}</th><td>\\${atkDisplay}</td>\\\`;
        });`;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, replaceStr);
    fs.writeFileSync(jsPath, content);
    console.log("PATCH SUCCESS");
} else {
    console.log("TARGET STRING NOT FOUND. IT MIGHT BE DIFFERENT IN THE FILE.");
}
