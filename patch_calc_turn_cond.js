const fs = require('fs');
const filePath = 'dokkan_calc_final.js';

let code = fs.readFileSync(filePath, 'utf8');

// 1. turnAtkUpStartTurnのデフォルト値設定
const targetLine1 = 'loadedEnemyData.turnAtkUp = loadedEnemyData.turnAtkUp || 0;';
const replaceLine1 = 'loadedEnemyData.turnAtkUpStartTurn = loadedEnemyData.turnAtkUpStartTurn || 1;\n              loadedEnemyData.turnAtkUp = loadedEnemyData.turnAtkUp || 0;';

if (code.includes(targetLine1)) {
    code = code.replace(targetLine1, replaceLine1);
    console.log('Patch 1 (default values) applied.');
} else {
    console.log('Target 1 not found.');
}

// 2. renderDynamicAttacks内でのドロップダウン生成修正
const targetBlock2 = `            // ターン経過
            if (d.turnAtkUp > 0 && d.turnAtkMax > 0) {
              const steps = Math.floor(d.turnAtkMax / d.turnAtkUp);
              selectorsHTML += '<div style="flex:1 1 45%;"><label style="font-size:0.8rem;display:block;">ターン経過</label><select class="form-control cond-turn" style="font-size:0.85rem;">';
              selectorsHTML += '<option value="0">なし</option>';
              for (let i = 1; i <= steps; i++) {
                const pct = d.turnAtkUp * i;
                const sel = (i === 1) ? ' selected' : '';
                selectorsHTML += '<option value="' + pct + '"' + sel + '>' + i + 'ターン (ATK+' + pct + '%)</option>';
              }
              selectorsHTML += '</select></div>';
            }`;

const replaceBlock2 = `            // ターン経過
            if (d.turnAtkUp > 0 && d.turnAtkMax > 0) {
              const startTurn = d.turnAtkUpStartTurn || 1;
              const steps = Math.floor(d.turnAtkMax / d.turnAtkUp);
              selectorsHTML += '<div style="flex:1 1 45%;"><label style="font-size:0.8rem;display:block;">ターン経過</label><select class="form-control cond-turn" style="font-size:0.85rem;">';
              selectorsHTML += '<option value="0">なし</option>';
              for (let i = 1; i <= steps; i++) {
                const currentTurn = startTurn + i - 1;
                const pct = d.turnAtkUp * i;
                const sel = (i === 1) ? ' selected' : '';
                selectorsHTML += '<option value="' + pct + '"' + sel + '>' + currentTurn + 'ターン (ATK+' + pct + '%)</option>';
              }
              selectorsHTML += '</select></div>';
            }`;

if (code.includes(targetBlock2)) {
    code = code.replace(targetBlock2, replaceBlock2);
    console.log('Patch 2 (cond-turn rendering) applied.');
} else {
    console.log('Target 2 not found.');
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('dokkan_calc_final.js updated successfully.');
