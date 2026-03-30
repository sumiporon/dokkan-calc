const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const tempDir = 'C:\\Temp';
const fileName = 'dokkan_calc_final.js';
const srcFile = path.join(srcDir, fileName);
const tempFile = path.join(tempDir, fileName);

// C:\Temp フォルダを作成（なければ）
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

console.log('1. コピー中...');
fs.copyFileSync(srcFile, tempFile);
console.log('   コピー完了');

console.log('2. 読み込み中...');
let content = fs.readFileSync(tempFile, 'utf8');
let changeCount = 0;

// PATCH 1: parseFloat for dynamic attack crit conditions
const oldDynCrit = `                if (is_this_attack_crit) {
                  const critAtkUpVal = d.critAtkUp || 0;
                  const critDefDownVal = d.critDefDown || 0;
                  const isCritUnconfigured = (critAtkUpVal === 0 && critDefDownVal === 0);`;

const newDynCrit = `                if (is_this_attack_crit) {
                  const critAtkUpVal = parseFloat(d.critAtkUp) || 0;
                  const critDefDownVal = parseFloat(d.critDefDown) || 0;
                  const isCritUnconfigured = (critAtkUpVal === 0 && critDefDownVal === 0);`;

if (content.includes(oldDynCrit)) {
    content = content.replace(oldDynCrit, newDynCrit);
    changeCount++;
    console.log('   PATCH 1 OK: parseFloat追加 (dynamic attack)');
} else {
    console.error('   PATCH 1 FAIL: dynamic attack のコードが見つかりません');
}

// PATCH 2: fix manual mode damage calculation and unconfigured flag
const oldManualMode = `        } else {
          enemyAtkGroup.style.display = 'block';
          const enemy_atk_input = (parseFloat(scenarioData.enemy_atk) || 0) * 10000;
          // 手動入力の場合、自キャラの会心補正（atk_crit_mod等）は被ダメに関係ないので適用しない
          const damage_taken = Math.max(0, ((enemy_atk_input * 1.0) * attr_mod * dr_mod - final_def)) * guard_mod;
          resultSection.innerHTML = \`
                    <div class="manual-damage-result">
                        <div class="attack-details">
                            <span class="attack-stat">敵ATK: \${formatNumber(enemy_atk_input)}</span>
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

if (content.includes(oldManualMode)) {
    content = content.replace(oldManualMode, newManualMode);
    changeCount++;
    console.log('   PATCH 2 OK: 手動入力モードの会心計算・未設定対応');
} else {
    console.error('   PATCH 2 FAIL: 手動入力モードのコードが見つかりません');
}

// ============================================================
// 書き込み＆コピーバック
// ============================================================
if (changeCount === 2) {
    console.log(`\n3. Tempファイルに書き込み中... (${changeCount}/2 パッチ適用)`);
    fs.writeFileSync(tempFile, content, 'utf8');
    console.log('   書き込み完了');

    console.log('4. 元ファイルにコピーバック...');
    fs.copyFileSync(tempFile, srcFile);
    console.log('   コピーバック完了！');

    // Tempファイルを掃除
    fs.unlinkSync(tempFile);
    console.log('\n全パッチ適用成功！');
} else {
    console.error(`\n一部のパッチが失敗しました (${changeCount}/2)。ファイルは書き込みません。`);
    process.exit(1);
}
