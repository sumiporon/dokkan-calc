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

const oldDynCrit = `                if (is_this_attack_crit) {
                  // プリセットの d.critAtkUp ではなく、UIから取得・編集可能な scenarioData の値を使用する
                  const critAtkUpVal = parseFloat(scenarioData.crit_atk_up) || 0;
                  const critDefDownVal = parseFloat(scenarioData.crit_def_down) || 0;
                  const isCritUnconfigured = (critAtkUpVal === 0 && critDefDownVal === 0);`;

const newDynCrit = `                if (is_this_attack_crit) {
                  // プリセットの d.critAtkUp ではなく、UIから取得・編集可能な scenarioData の値を使用する
                  const critAtkUpVal = parseFloat(scenarioData.crit_atk_up) || 0;
                  const critDefDownVal = parseFloat(scenarioData.crit_def_down) || 0;
                  const isCritUnconfigured = (critAtkUpVal === 0 && critDefDownVal === 0);`;

if (content.includes(oldDynCrit)) {
    console.log('PATCH 1 ALREADY APPLIED. No need to patch.');
} else {
    console.log('PATCH 1 NOT FOUND. Let me check what is actually there:');
    const idx = content.indexOf('                if (is_this_attack_crit) {');
    console.log(content.substring(idx, idx + 300));
}
