const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '..', 'dokkan_calc_final.js');
let content = fs.readFileSync(targetFile, 'utf8');

const targetStr1 = `          // 会心自動設定: isCriticalDefault or hasSaCrit がtrueなら会心ONに
          const critCheckbox = card.querySelector('[data-input="is_critical"]');
          if (critCheckbox && boss.isCriticalDefault) {
            critCheckbox.checked = true;
            const critContainer = card.querySelector('.crit-inputs-container');
            if (critContainer) critContainer.style.display = 'grid';
          }`;

const replaceStr1 = `          // 会心自動設定: hasSaCrit のみで全体会心をONにしないように修正
          const critCheckbox = card.querySelector('[data-input="is_critical"]');
          const hasGlobalCrit = (boss.critHpRate > 0) || (boss.critTurnUp > 0) || (boss.critFixedRate > 0) || (boss.isCriticalDefault && !boss.hasSaCrit);
          if (critCheckbox && hasGlobalCrit) {
            critCheckbox.checked = true;
            const critContainer = card.querySelector('.crit-inputs-container');
            if (critContainer) critContainer.style.display = 'grid';
          } else if (critCheckbox) {
            critCheckbox.checked = false;
            const critContainer = card.querySelector('.crit-inputs-container');
            if (critContainer) critContainer.style.display = 'none';
          }`;

const targetStr2 = `          const critCheckbox = card.querySelector('[data-input="is_critical"]');
          if (critCheckbox && boss.isCriticalDefault) {
            critCheckbox.checked = true;
            const critContainer = card.querySelector('.crit-inputs-container');
            if (critContainer) critContainer.style.display = 'grid';
          }`;

const replaceStr2 = `          const critCheckbox = card.querySelector('[data-input="is_critical"]');
          const hasGlobalCrit = (boss.critHpRate > 0) || (boss.critTurnUp > 0) || (boss.critFixedRate > 0) || (boss.isCriticalDefault && !boss.hasSaCrit);
          if (critCheckbox && hasGlobalCrit) {
            critCheckbox.checked = true;
            const critContainer = card.querySelector('.crit-inputs-container');
            if (critContainer) critContainer.style.display = 'grid';
          } else if (critCheckbox) {
            critCheckbox.checked = false;
            const critContainer = card.querySelector('.crit-inputs-container');
            if (critContainer) critContainer.style.display = 'none';
          }`;

const targetStr3 = `                const dmg = Math.max(0, ((atk.value * atkCritMod_local) * attrMod_local * dr_mod - defForCalc)) * guardMod_local;
                const critBadge = atk.isCrit ? ' <span style="background:#dc3545;color:white;padding:0.1rem 0.3rem;border-radius:3px;font-size:0.7rem;">会心</span>' : '';`;

const replaceStr3 = `                const dmg = Math.max(0, ((atk.value * atkCritMod_local) * attrMod_local * dr_mod - defForCalc)) * guardMod_local;
                const is_this_attack_crit = atk.isCrit || is_critical;
                const critBadge = (is_this_attack_crit && !atk.name.includes('会心')) ? ' <span style="background:#dc3545;color:white;padding:0.1rem 0.3rem;border-radius:3px;font-size:0.7rem;">会心</span>' : '';`;

let success = true;

if (content.includes(targetStr1)) content = content.replace(targetStr1, replaceStr1);
else { console.log('Target 1 not found'); success = false; }

if (content.includes(targetStr2)) content = content.replace(targetStr2, replaceStr2);
else { console.log('Target 2 not found'); success = false; }

if (content.includes(targetStr3)) content = content.replace(targetStr3, replaceStr3);
else { console.log('Target 3 not found'); success = false; }

if (success || content.includes('hasGlobalCrit')) {
    fs.writeFileSync(targetFile, content, 'utf8');
    console.log('Successfully applied all UI crit patches.');
}
