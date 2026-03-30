const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '..', 'dokkan_calc_final.js');
let content = fs.readFileSync(targetFile, 'utf8');

const targetStr1 = `          if (critCheckbox && hasGlobalCrit) {
            critCheckbox.checked = true;
            const critContainer = card.querySelector('.crit-inputs-container');
            if (critContainer) critContainer.style.display = 'grid';
          } else if (critCheckbox) {
            critCheckbox.checked = false;
            const critContainer = card.querySelector('.crit-inputs-container');
            if (critContainer) critContainer.style.display = 'none';
          }

          handleModeChange();`;

const replaceStr1 = `          if (critCheckbox && hasGlobalCrit) {
            critCheckbox.checked = true;
            const critContainer = card.querySelector('.crit-inputs-container');
            if (critContainer) critContainer.style.display = 'grid';
          } else if (critCheckbox) {
            critCheckbox.checked = false;
            const critContainer = card.querySelector('.crit-inputs-container');
            if (critContainer) critContainer.style.display = 'none';
          }

          const critAtkInput = card.querySelector('[data-input="crit_atk_up"]');
          const critDefInput = card.querySelector('[data-input="crit_def_down"]');
          if (critAtkInput) critAtkInput.value = boss.critAtkUp || '';
          if (critDefInput) critDefInput.value = boss.critDefDown || '';

          handleModeChange();`;

const targetStr2 = `          if (critCheckbox && hasGlobalCrit) {
            critCheckbox.checked = true;
            const critContainer = card.querySelector('.crit-inputs-container');
            if (critContainer) critContainer.style.display = 'grid';
          } else if (critCheckbox) {
            critCheckbox.checked = false;
            const critContainer = card.querySelector('.crit-inputs-container');
            if (critContainer) critContainer.style.display = 'none';
          }
          handleModeChange();`;

const replaceStr2 = `          if (critCheckbox && hasGlobalCrit) {
            critCheckbox.checked = true;
            const critContainer = card.querySelector('.crit-inputs-container');
            if (critContainer) critContainer.style.display = 'grid';
          } else if (critCheckbox) {
            critCheckbox.checked = false;
            const critContainer = card.querySelector('.crit-inputs-container');
            if (critContainer) critContainer.style.display = 'none';
          }
          const critAtkInput = card.querySelector('[data-input="crit_atk_up"]');
          const critDefInput = card.querySelector('[data-input="crit_def_down"]');
          if (critAtkInput) critAtkInput.value = boss.critAtkUp || '';
          if (critDefInput) critDefInput.value = boss.critDefDown || '';
          handleModeChange();`;

let success = true;

if (content.includes(targetStr1)) content = content.replace(targetStr1, replaceStr1);
else { console.log('Target 1 not found'); success = false; }

if (content.includes(targetStr2)) content = content.replace(targetStr2, replaceStr2);
else { console.log('Target 2 not found'); success = false; }

if (success) {
    fs.writeFileSync(targetFile, content, 'utf8');
    console.log('Successfully patched UI population of crit values.');
}
