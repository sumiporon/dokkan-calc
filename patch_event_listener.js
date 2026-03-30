const fs = require('fs');
const path = require('path');

const jsFile = path.join(__dirname, 'dokkan_calc_final.js');
let content = fs.readFileSync(jsFile, 'utf8');

const targetStr = `      cardsContainer.addEventListener('input', (e) => {
        if (document.body.classList.contains('sortable-mode')) return;
        if (e.target.matches('.scenario-input')) {
          const card = e.target.closest('.card');
          if (card) {
            if (e.target.dataset.input === 'enemy_atk') {
              // If user types in manual ATK, clear the loaded preset
              if (card.dataset.loadedEnemy) {
                delete card.dataset.loadedEnemy;
              }
            }
            if (e.target.dataset.input === 'is_critical') {
              const critContainer = card.querySelector('.crit-inputs-container');
              critContainer.style.display = e.target.checked ? 'grid' : 'none';
            }
            if (e.target.matches('.scenario-title-input')) {
              card.querySelector('.scenario-title-text').textContent = e.target.value;
            }
            updateScenarioResults(card);
            saveState();
          }
        }
      });`;

const newStr = targetStr + `\n
      cardsContainer.addEventListener('change', (e) => {
        if (document.body.classList.contains('sortable-mode')) return;
        if (e.target.matches('.scenario-input[type="checkbox"], select.scenario-input')) {
          const card = e.target.closest('.card');
          if (card) {
            if (e.target.dataset.input === 'is_critical') {
              const critContainer = card.querySelector('.crit-inputs-container');
              if(critContainer) critContainer.style.display = e.target.checked ? 'grid' : 'none';
            }
            updateScenarioResults(card);
            saveState();
          }
        }
      });`;

if (content.includes("cardsContainer.addEventListener('change'")) {
    console.log("ALREADY PATCHED");
} else if (content.includes(targetStr)) {
    content = content.replace(targetStr, newStr);
    fs.writeFileSync(jsFile, content, 'utf8');
    console.log("PATCH APPLIED SUCCESSFULLY");
} else {
    console.log("PATCH FAILED: target string not found");
}
