/**
 * patch_dynamic_calc.js
 * 被ダメ計算の表示を動的計算方式に変更するパッチ
 * 
 * 変更内容:
 * - 全パターン展開をやめ、ターン数・被弾回数・HP条件・登場ターンをドロップダウンで選択
 * - 選択した条件の合計ATK倍率を計算し、基本攻撃パターンに適用して表示
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'dokkan_calc_final.js');
console.log('Reading file...');
let content = fs.readFileSync(filePath, 'utf8');
console.log('File size:', content.length);

let patchCount = 0;

// ===== Patch: 被ダメ表示を動的計算方式に変更 =====
// updateScenarioResults内の 'damage' mode のloadedEnemy分岐を全面書き換え

const OLD_DAMAGE_DISPLAY = `      } else { // 'damage' mode
        if (loadedEnemyData && loadedEnemyData.attacks) {
          enemyAtkGroup.style.display = 'none';
          resultSection.innerHTML = '<div class="multi-attack-result-container"></div>';
          const container = resultSection.querySelector('.multi-attack-result-container');
          if (loadedEnemyData.attacks.length === 0) {
            container.innerHTML = '<p>この敵には攻撃パターンが登録されていません。</p>';
          } else {
            const groupedAttacks = {};
            loadedEnemyData.attacks.forEach(attack => {
              if (attack.value <= 0) return;

              let groupName = '基本の攻撃';
              let displayName = attack.name;

              const match = attack.name.match(/^\\(([^)]+)\\)\\s*(.*)/);
              if (match) {
                groupName = match[1];
                displayName = match[2] || '攻撃';
              }

              if (!groupedAttacks[groupName]) {
                groupedAttacks[groupName] = [];
              }

              // 敵の元々の会心設定（ATK上昇/DEF低下）に加えて、必殺個別フラグ(isCrit)も判定
              let isAttackCrit = is_critical || attack.isCrit;
              let currentAtkCritMod = atk_crit_mod;
              let currentAttrMod = attr_mod;
              let currentGuardMod = guard_mod;

              if (isAttackCrit) {
                // 攻撃個別で会心の場合の再計算
                const c_atk_up = parseFloat(crit_atk_up) || 0;
                const c_def_down = parseFloat(crit_def_down) || 0;
                currentAtkCritMod = 1 + (c_atk_up / 100);
                const def_crit_mod = 1 - (c_def_down / 100);
                const current_final_def_crit = final_def * def_crit_mod;

                if (!is_guard) {
                  currentAttrMod = 1.0;
                  currentGuardMod = 1.0;
                  if (group1_advantage_status === 'advantage' && attr_def_up > 0) {
                    currentAttrMod -= ((parseFloat(attr_def_up) || 0) * 0.01);
                  }
                }

                const damage_taken = Math.max(0, ((attack.value * currentAtkCritMod) * currentAttrMod * dr_mod - current_final_def_crit)) * currentGuardMod;
                groupedAttacks[groupName].push({
                  ...attack,
                  displayName,
                  damage_taken
                });
              } else {
                const damage_taken = Math.max(0, ((attack.value * currentAtkCritMod) * currentAttrMod * dr_mod - final_def_crit_mod)) * currentGuardMod;
                groupedAttacks[groupName].push({
                  ...attack,
                  displayName,
                  damage_taken
                });
              }
            });`;

const NEW_DAMAGE_DISPLAY = `      } else { // 'damage' mode
        if (loadedEnemyData && loadedEnemyData.attacks) {
          enemyAtkGroup.style.display = 'none';
          resultSection.innerHTML = '<div class="dynamic-damage-container"></div>';
          const dynContainer = resultSection.querySelector('.dynamic-damage-container');

          if (loadedEnemyData.baseAtk <= 0) {
            dynContainer.innerHTML = '<p>この敵にはATKデータがありません。</p>';
          } else {
            const d = loadedEnemyData;
            // --- 条件セレクターを生成 ---
            let selectorsHTML = '<div class="condition-selectors" style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.75rem;">';

            // ターン経過
            if (d.turnAtkUp > 0 && d.turnAtkMax > 0) {
              const steps = Math.floor(d.turnAtkMax / d.turnAtkUp);
              selectorsHTML += '<div style="flex:1 1 45%;"><label style="font-size:0.8rem;display:block;">ターン経過</label><select class="form-control cond-turn" style="font-size:0.85rem;">';
              selectorsHTML += '<option value="0">なし</option>';
              for (let i = 1; i <= steps; i++) {
                const pct = d.turnAtkUp * i;
                selectorsHTML += '<option value="' + pct + '">' + i + 'ターン (ATK+' + pct + '%)</option>';
              }
              selectorsHTML += '</select></div>';
            }

            // 被弾回数
            if (d.hitAtkUp > 0 && d.hitAtkMax > 0) {
              const steps = Math.floor(d.hitAtkMax / d.hitAtkUp);
              selectorsHTML += '<div style="flex:1 1 45%;"><label style="font-size:0.8rem;display:block;">被弾回数</label><select class="form-control cond-hit" style="font-size:0.85rem;">';
              selectorsHTML += '<option value="0">なし</option>';
              for (let i = 1; i <= steps; i++) {
                const pct = d.hitAtkUp * i;
                selectorsHTML += '<option value="' + pct + '">' + i + '回 (ATK+' + pct + '%)</option>';
              }
              selectorsHTML += '</select></div>';
            }

            // HP条件
            if (d.hpAtkUp > 0) {
              selectorsHTML += '<div style="flex:1 1 45%;"><label style="font-size:0.8rem;display:block;">HP条件</label><select class="form-control cond-hp" style="font-size:0.85rem;">';
              selectorsHTML += '<option value="0">HP' + d.hpAtkThreshold + '%以上</option>';
              selectorsHTML += '<option value="' + d.hpAtkUp + '">HP' + d.hpAtkThreshold + '%以下 (ATK+' + d.hpAtkUp + '%)</option>';
              selectorsHTML += '</select></div>';
            }

            // 登場ターン
            if (d.appearEntries && d.appearEntries.length > 0) {
              selectorsHTML += '<div style="flex:1 1 45%;"><label style="font-size:0.8rem;display:block;">登場ターン</label><select class="form-control cond-appear" style="font-size:0.85rem;">';
              selectorsHTML += '<option value="0">初期</option>';
              d.appearEntries.forEach(e => {
                selectorsHTML += '<option value="' + e.cumulativeAtkUp + '">' + e.turn + 'ターン目 (ATK+' + e.cumulativeAtkUp + '%)</option>';
              });
              selectorsHTML += '</select></div>';
            }

            selectorsHTML += '</div>';
            dynContainer.innerHTML = selectorsHTML + '<div class="dynamic-attacks-list"></div>';

            // --- 動的計算関数 ---
            const renderDynamicAttacks = () => {
              const turnPct = parseFloat(dynContainer.querySelector('.cond-turn')?.value || 0);
              const hitPct = parseFloat(dynContainer.querySelector('.cond-hit')?.value || 0);
              const hpPct = parseFloat(dynContainer.querySelector('.cond-hp')?.value || 0);
              const appearPct = parseFloat(dynContainer.querySelector('.cond-appear')?.value || 0);

              const totalAtkUpPct = turnPct + hitPct + hpPct + appearPct;
              const atkMulti = 1 + (totalAtkUpPct / 100);

              const boostedAtk = Math.floor(d.baseAtk * atkMulti);
              const trueSaMulti = d.saMulti + d.saBuffMod;
              const postSaNormalMulti = 1.0 + d.saBuffMod;

              const dynamicAttacks = [];
              dynamicAttacks.push({ name: '通常', value: boostedAtk, isCrit: false });
              if (d.saBuffMod > 0) dynamicAttacks.push({ name: '通常(必殺後)', value: Math.floor(boostedAtk * postSaNormalMulti), isCrit: false });
              
              if (d.hasSaCrit) {
                // 確率会心などの要望に対応し、会心有りと無しの両方を表示
                dynamicAttacks.push({ name: '必殺', value: Math.floor(boostedAtk * trueSaMulti), isCrit: false });
                dynamicAttacks.push({ name: '必殺[会心]', value: Math.floor(boostedAtk * trueSaMulti), isCrit: true });
              } else {
                dynamicAttacks.push({ name: '必殺', value: Math.floor(boostedAtk * trueSaMulti), isCrit: false });
              }
              
              if (d.aoeDamage > 0) dynamicAttacks.push({ name: '全体攻撃', value: Math.floor(d.aoeDamage * atkMulti), isCrit: false });

              const listDiv = dynContainer.querySelector('.dynamic-attacks-list');
              let condLabel = totalAtkUpPct > 0 ? '<div style="font-size:0.8rem;color:var(--secondary-color);margin-bottom:0.3rem;">合計ATK +' + totalAtkUpPct + '% (x' + atkMulti.toFixed(2) + ')</div>' : '';
              let html = condLabel;

              dynamicAttacks.forEach(atk => {
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
                }

                const dmg = Math.max(0, ((atk.value * atkCritMod_local) * attrMod_local * dr_mod - defForCalc)) * guardMod_local;
                const critBadge = atk.isCrit ? ' <span style="background:#dc3545;color:white;padding:0.1rem 0.3rem;border-radius:3px;font-size:0.7rem;">会心</span>' : '';
                html += '<div class="multi-attack-result-item" style="padding:0.3rem 0;border-bottom:1px solid var(--border-color);">' +
                  '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                  '<span class="attack-name" style="font-weight:bold;">' + atk.name + critBadge + '</span>' +
                  '<span style="font-size:0.85rem;color:var(--secondary-color);">ATK: ' + formatNumber(atk.value) + '</span>' +
                  '</div>' +
                  '<div style="text-align:right;font-size:1.1rem;font-weight:bold;color:var(--danger-color);">被ダメ: ' + formatNumber(dmg) + '</div>' +
                  '</div>';
              });

              listDiv.innerHTML = html;
            };

            // イベントリスナー
            dynContainer.querySelectorAll('.condition-selectors select').forEach(sel => {
              sel.addEventListener('change', renderDynamicAttacks);
            });

            renderDynamicAttacks();
          }`;

if (content.includes(OLD_DAMAGE_DISPLAY)) {
  content = content.replace(OLD_DAMAGE_DISPLAY, NEW_DAMAGE_DISPLAY);
  patchCount++;
  console.log('Patch 1 OK: 被ダメ表示を動的計算方式に変更');
} else {
  console.error('Patch 1 FAILED: ターゲットが見つかりません');

  // デバッグ: 部分検索
  const idx = content.indexOf("} else { // 'damage' mode");
  if (idx !== -1) {
    console.log('Found damage mode at index', idx);
    console.log('Context around:', JSON.stringify(content.substring(idx, idx + 200)));
  }
}

// ===== Patch 2: アコーディオン表示の残骸を除去 =====
// groupedAttacksのレンダリング部分も合わせて置換する必要がある
// OLD_DAMAGE_DISPLAYで開始部分は置換済み。閉じカッコの「container.appendChild(groupDiv);」以降を探す

// 古いアコーディオン表示の末尾を削除
const OLD_ACCORDION_END = `            Object.keys(groupedAttacks).forEach(group => {
              const groupDiv = document.createElement('div');
              groupDiv.className = 'attack-condition-group';
              
              const headerDiv = document.createElement('div');
              headerDiv.className = 'condition-title';
              headerDiv.style.cursor = 'pointer';
              headerDiv.style.display = 'flex';
              headerDiv.style.alignItems = 'center';
              headerDiv.style.gap = '0.5rem';
              
              const toggleArrow = document.createElement('span');
              toggleArrow.className = 'toggle-arrow' + (group === '基本の攻撃' ? '' : ' collapsed');
              toggleArrow.textContent = '▼';
              
              const titleText = document.createElement('span');
              titleText.textContent = group === '基本の攻撃' ? group : \`【条件】\${group}\`;
              
              headerDiv.appendChild(toggleArrow);
              headerDiv.appendChild(titleText);
              groupDiv.appendChild(headerDiv);

              const contentDiv = document.createElement('div');
              contentDiv.className = 'condition-content';
              contentDiv.style.display = group === '基本の攻撃' ? 'block' : 'none';

              headerDiv.addEventListener('click', () => {
                const isCollapsed = contentDiv.style.display === 'none';
                contentDiv.style.display = isCollapsed ? 'block' : 'none';
                toggleArrow.classList.toggle('collapsed', !isCollapsed);
              });

              groupedAttacks[group].forEach(atk => {
                const item = document.createElement('div');
                item.className = 'multi-attack-result-item';
                const critBadge = atk.isCrit ? '<span class="crit-badge" style="background:#dc3545;color:white;padding:0.1rem 0.3rem;border-radius:3px;font-size:0.7rem;margin-left:0.3rem;">会心</span>' : '';
                item.innerHTML = \`
                                <div class="attack-name">\${atk.displayName}\${critBadge}</div>
                                <div class="attack-details">
                                    <span class="attack-stat">敵ATK: \${formatNumber(atk.value)}</span>
                                    <span class="arrow">→</span>
                                    <span class="damage-value">被ダメ: \${formatNumber(atk.damage_taken)}</span>
                                </div>
                                \`;
                contentDiv.appendChild(item);
              });
              groupDiv.appendChild(contentDiv);
              container.appendChild(groupDiv);
            });
          }`;

if (content.includes(OLD_ACCORDION_END)) {
  content = content.replace(OLD_ACCORDION_END, '          }');
  patchCount++;
  console.log('Patch 2 OK: 古いアコーディオン表示を除去');
} else {
  console.error('Patch 2 SKIPPED: アコーディオン部分が見つかりません（既に除去済みの可能性）');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log(`完了: ${patchCount}個のパッチを適用`);
