const updateScenarioResults = (card) => {
      const scenarioData = {};
      card.querySelectorAll('.scenario-input').forEach(input => {
        const key = input.dataset.input;
        scenarioData[key] = (input.type === 'checkbox') ? input.checked : (input.type === 'number' ? parseFloat(input.value) : input.value);
      });

      const calcResults = calculateNewDurability(scenarioData);
      const { final_def, final_def_crit_mod, attr_mod, guard_mod, dr_mod, atk_crit_mod, group1_advantage_status } = calcResults;
      const is_critical = scenarioData.is_critical || false;
      const crit_atk_up = scenarioData.crit_atk_up || 0;
      const crit_def_down = scenarioData.crit_def_down || 0;
      const attr_def_up = scenarioData.attr_def_up || 0;
      const is_guard = scenarioData.is_guard || false;
      card.querySelector('.final-def-display').textContent = `最終DEF: ${Math.round(final_def).toLocaleString()}`;

      const selectedMode = document.querySelector('input[name="calc_mode"]:checked').value;
      const resultSection = card.querySelector('.result-section');
      const enemyAtkGroup = card.querySelector(`[id$="-enemy-atk-group"]`);
      const loadedEnemyData = card.dataset.loadedEnemy ? JSON.parse(card.dataset.loadedEnemy) : null;

      if (selectedMode === 'durability') {
        enemyAtkGroup.style.display = 'none';
        resultSection.innerHTML = `
                <table class="result-table">
                    <thead><tr><th>目標被ダメージ</th><th>耐久ライン (敵ATK)</th></tr></thead>
                    <tbody class="result-body"></tbody>
                </table>
            `;
        const resultBody = resultSection.querySelector('.result-body');
        durabilityLines.forEach(line => {
          const dmg = line.value;
          const requiredEnemyAtk = ((dmg / guard_mod) + final_def_crit_mod) / (attr_mod * dr_mod * atk_crit_mod);
          const row = resultBody.insertRow();
          row.innerHTML = `<th>${line.name}</th><td>${formatNumber(requiredEnemyAtk)}</td>`;
        });

      } else { // 'damage' mode
        if (loadedEnemyData && loadedEnemyData.attacks) {
          enemyAtkGroup.style.display = 'none';
          // === 状態保持付きで再生成（クロージャ等のバグを完全に回避する） ===
          // 既存のセレクタがあればその値を保持
          const existingContainer = resultSection.querySelector('.dynamic-damage-container');
          const savedConds = {
            turn: existingContainer?.querySelector('.cond-turn')?.value,
            hit: existingContainer?.querySelector('.cond-hit')?.value,
            hp: existingContainer?.querySelector('.cond-hp')?.value,
            appear: existingContainer?.querySelector('.cond-appear')?.value
          };

          // 毎回HTMLを再生成する（最新の変数を束縛した renderDynamicAttacks を安全に動作させるため）
          resultSection.innerHTML = '<div class="dynamic-damage-container"></div>';
          const dynContainer = resultSection.querySelector('.dynamic-damage-container');
          const currentEnemyName = loadedEnemyData.name || '';
          dynContainer.dataset.enemyName = currentEnemyName;

          // 旧データにbaseAtkが無い場合のフォールバック
          if (!loadedEnemyData.baseAtk && loadedEnemyData.attacks && loadedEnemyData.attacks.length > 0) {
            const normalAtk = loadedEnemyData.attacks.find(a => a.name === '通常');
            if (normalAtk) {
              loadedEnemyData.baseAtk = normalAtk.value;
              const saAtk = loadedEnemyData.attacks.find(a => a.name === '必殺' || a.name.includes('必殺'));
              loadedEnemyData.saMulti = saAtk ? saAtk.value / normalAtk.value : 3;
              loadedEnemyData.saBuffMod = loadedEnemyData.saBuffMod || 0;
              const aoeAtk = loadedEnemyData.attacks.find(a => a.name === '全体攻撃');
              loadedEnemyData.aoeDamage = aoeAtk ? aoeAtk.value : 0;
              loadedEnemyData.hasSaCrit = loadedEnemyData.hasSaCrit || false;
              loadedEnemyData.turnAtkUpStartTurn = loadedEnemyData.turnAtkUpStartTurn || 1;
              loadedEnemyData.turnAtkUp = loadedEnemyData.turnAtkUp || 0;
              loadedEnemyData.turnAtkMax = loadedEnemyData.turnAtkMax || 0;
              loadedEnemyData.hitAtkUp = loadedEnemyData.hitAtkUp || 0;
              loadedEnemyData.hitAtkMax = loadedEnemyData.hitAtkMax || 0;
              loadedEnemyData.hpAtkUp = loadedEnemyData.hpAtkUp || 0;
              loadedEnemyData.hpAtkThreshold = loadedEnemyData.hpAtkThreshold || 0;
              loadedEnemyData.appearEntries = loadedEnemyData.appearEntries || [];
            }
          }

          if (!loadedEnemyData.baseAtk || loadedEnemyData.baseAtk <= 0) {
            dynContainer.innerHTML = '<p>この敵にはATKデータがありません。</p>';
          } else {
            const d = loadedEnemyData;
            // --- 条件セレクターを生成 ---
            let selectorsHTML = '<div class="condition-selectors" style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.75rem;">';

            if (d.turnAtkUp > 0 && d.turnAtkMax > 0) {
              const startTurn = d.turnAtkUpStartTurn || 1;
              const steps = Math.floor(d.turnAtkMax / d.turnAtkUp);
              selectorsHTML += '<div style="flex:1 1 45%;"><label style="font-size:0.8rem;display:block;">ターン経過</label><select class="form-control cond-turn" style="font-size:0.85rem;">';
              selectorsHTML += '<option value="0">なし</option>';
              for (let i = 1; i <= steps; i++) {
                const currentTurn = startTurn + i - 1;
                const pct = d.turnAtkUp * i;
                selectorsHTML += '<option value="' + pct + '">' + currentTurn + 'ターン (ATK+' + pct + '%)</option>';
              }
              selectorsHTML += '</select></div>';
            }

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

            if (d.hpAtkUp > 0) {
              selectorsHTML += '<div style="flex:1 1 45%;"><label style="font-size:0.8rem;display:block;">HP条件</label><select class="form-control cond-hp" style="font-size:0.85rem;">';
              selectorsHTML += '<option value="0">HP' + d.hpAtkThreshold + '%以上</option>';
              selectorsHTML += '<option value="' + d.hpAtkUp + '">HP' + d.hpAtkThreshold + '%以下 (ATK+' + d.hpAtkUp + '%)</option>';
              selectorsHTML += '</select></div>';
            }

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

            // --- 保存した状態を復元 ---
            const turnSel = dynContainer.querySelector('.cond-turn');
            if (turnSel && savedConds.turn) turnSel.value = savedConds.turn;
            const hitSel = dynContainer.querySelector('.cond-hit');
            if (hitSel && savedConds.hit) hitSel.value = savedConds.hit;
            const hpSel = dynContainer.querySelector('.cond-hp');
            if (hpSel && savedConds.hp) hpSel.value = savedConds.hp;
            const appSel = dynContainer.querySelector('.cond-appear');
            if (appSel && savedConds.appear) appSel.value = savedConds.appear;

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
                let atkCritMod_local = 1.0;
                let defForCalc = final_def;
                let attrMod_local = 1.0;
                let guardMod_local = (group1_advantage_status === 'advantage') ? 0.5 : 1.0;

                const o_class = scenarioData.own_class || 'super';
                const e_class = scenarioData.enemy_class || 'extreme';
                const is_same_class = o_class === e_class;
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

                const is_this_attack_crit = atk.isCrit || is_critical;

                if (is_this_attack_crit) {
                  // プリセットの d.critAtkUp ではなく、UIから取得・編集可能な scenarioData の値を使用する
                  const critAtkUpVal = parseFloat(scenarioData.crit_atk_up) || 0;
                  const critDefDownVal = parseFloat(scenarioData.crit_def_down) || 0;
                  const isCritUnconfigured = (critAtkUpVal === 0 && critDefDownVal === 0);

                  if (isCritUnconfigured) {
                    // 会心条件が未設定 → "--" 表示してスキップ
                    const critLabel = atk.name.includes('会心') ? '' : ' <span style="background:#dc3545;color:white;padding:0.1rem 0.3rem;border-radius:3px;font-size:0.7rem;">会心</span>';
                    html += '<div class="multi-attack-result-item" style="padding:0.3rem 0;border-bottom:1px solid var(--border-color);">' +
                      '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                      '<span class="attack-name" style="font-weight:bold;">' + atk.name + critLabel + '</span>' +
                      '<span style="font-size:0.85rem;color:var(--secondary-color);">ATK: ' + formatNumber(atk.value) + '</span>' +
                      '</div>' +
                      '<div style="font-size:0.8rem;color:#ffc107;margin-top:0.2rem;">\u26a0\ufe0f 条件が設定されていません。</div>' +
                      '<div style="text-align:right;font-size:1.1rem;font-weight:bold;color:var(--secondary-color);">被ダメ: --</div>' +
                      '</div>';
                    return;
                  }

                  // 会心条件が設定済み: ATK上昇率・DEF減少率を適用
                  atkCritMod_local = 1 + (critAtkUpVal / 100);
                  defForCalc = final_def * (1 - (critDefDownVal / 100));

                  if (is_guard) {
                    // 全ガあり: 属性相性は0.8ベース、ガード(0.5)常時発動
                    attrMod_local = 0.8;
                    guardMod_local = 0.5;
                    if (group1_advantage_status === 'advantage' && attr_def_up > 0) {
                      attrMod_local -= ((parseFloat(attr_def_up) || 0) * 0.01);
                    }
                  } else {
                    // 全ガなし: 属性相性は1.0(中立)、ガード無効
                    attrMod_local = 1.0;
                    guardMod_local = 1.0;
                    if (group1_advantage_status === 'advantage' && attr_def_up > 0) {
                      attrMod_local -= ((parseFloat(attr_def_up) || 0) * 0.01);
                    }
                  }
                }

                const dmg = Math.max(0, ((atk.value * atkCritMod_local) * attrMod_local * dr_mod - defForCalc)) * guardMod_local;
                const critBadge = (is_this_attack_crit && !atk.name.includes('会心')) ? ' <span style="background:#dc3545;color:white;padding:0.1rem 0.3rem;border-radius:3px;font-size:0.7rem;">会心</span>' : '';
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

            // イベントリスナーを毎回割り当てる
            dynContainer.querySelectorAll('.condition-selectors select').forEach(sel => {
              sel.addEventListener('change', () => {
                // セレクトボックス変更時に親カード（シナリオ）全体を再計算し、
                // 他のデータ（DEFなど）との整合性を保つ
                updateScenarioResults(card);
                saveState();
              });
            });

            renderDynamicAttacks();
          }
        } else {
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
              resultSection.innerHTML = `
                    <div class="manual-damage-result" style="padding:0.5rem; border: 1px solid var(--border-color); border-radius: 5px;">
                        <div class="attack-details" style="display:flex; justify-content:space-between; align-items:center;">
                            <span class="attack-stat" style="font-weight:bold;">敵ATK: ${formatNumber(enemy_atk_input)} <span style="background:#dc3545;color:white;padding:0.1rem 0.3rem;border-radius:3px;font-size:0.7rem;">会心</span></span>
                        </div>
                        <div style="font-size:0.8rem;color:#ffc107;margin-top:0.2rem;">⚠️ 条件が設定されていません。</div>
                        <div style="text-align:right; font-size:1.1rem; font-weight:bold; color:var(--secondary-color);">被ダメ: --</div>
                    </div>
                `;
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

          resultSection.innerHTML = `
                    <div class="manual-damage-result">
                        <div class="attack-details">
                            <span class="attack-stat">敵ATK: ${formatNumber(enemy_atk_input)}${critBadge}</span>
                            <span class="arrow">→</span>
                            <span class="damage-value">被ダメ: ${formatNumber(damage_taken)}</span>
                        </div>
                    </div>
                `;
        }
      }

      // Simplified summary icons update
      const summaryIcons = card.querySelector('.summary-icons');
      if (summaryIcons) {
        const { dr_input = 0, is_guard = false } = scenarioData;
        summaryIcons.innerHTML = `
                <div class="icon-item"><span>🛡️</span><span>DEF:${Math.round(final_def).toLocaleString()}</span></div>
                <div class="icon-item"><span>🔻</span><span>軽減:${dr_input > 0 ? `${dr_input}%` : '-'}</span></div>
                <div class="icon-item"><span></span><span>全ガ:${is_guard ? 'あり' : '-'}</span></div>
            `;
      }
    };

    const updateAllScenarioResults = () => {
      document.querySelectorAll('#scenario-cards-container .card').forEach(updateScenarioResults);
    };

    // --- Screenshot & Selection Functions ---
    const calculateFinalDefFromData = (scenario) => {
      const values = ['char_def', 'leader', 'field', 'passive', 'memory', 'link', 'multi_passive', 'super_attack'].map(key => parseFloat(scenario[key]) || 0);
      const [char_def, leader, field, passive, memory, link, multi_passive, super_attack] = values;
      return char_def * (1 + leader / 100) * (1 + field / 100) * (1 + passive / 100) * (1 + memory / 100) * (1 + link / 100) * (1 + multi_passive / 100) * (1 + super_attack / 100);
    };

    const renderPreview = (scenarios, lines, container) => {
      container.innerHTML = '';

      scenarios.forEach((scenario) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.originalIndex = scenario.originalIndex;

        const header = document.createElement('div');
        header.className = 'card-header';
        header.innerHTML = `<span class="scenario-title-text">${scenario.scenario_title}</span>`;
        card.appendChild(header);

        const infoArea = document.createElement('div');
        infoArea.className = 'summary-info';

        // Use the original, simpler calculation logic for the screenshot
        const defValue = calculateFinalDefFromData(scenario);
        const dr_input = parseFloat(scenario.dr_input) || 0;
        const is_guard = scenario.is_guard === true || String(scenario.is_guard) === 'true';

        const addInfoItem = (container, label, value, noColon = false) => {
          const item = document.createElement('div');
          item.className = 'summary-item-pair';
          const labelHtml = noColon ? `<span class="label">${label}</span>` : `<span class="label">${label}:</span>`;
          item.innerHTML = `${labelHtml}<span class="value">${value}</span>`;
          container.appendChild(item);
        };

        addInfoItem(infoArea, 'DEF', formatNumber(defValue));
        addInfoItem(infoArea, '軽減', dr_input > 0 ? `${dr_input}%` : '-');
        addInfoItem(infoArea, '全ガ', is_guard ? 'あり' : '-');

        lines.forEach(line => {
          const dmg = line.value;
          const dr_rate = 1 - (dr_input / 100);
          // This is the original, simple formula without detailed attribute modifiers
          let enemy_atk = is_guard ? ((dmg / 0.5) + defValue) / (0.8 * (dr_rate > 0 ? dr_rate : 1)) : (dr_input > 0) ? (dmg + defValue) / dr_rate : dmg + defValue;
          addInfoItem(infoArea, line.name, formatNumber(enemy_atk));
        });

        card.appendChild(infoArea);
        container.appendChild(card);
      });
    };

    const openPreviewOverlay = (scenarios, mode = 'preview') => {
      document.documentElement.style.setProperty('--overlay-safe-height', `${window.innerHeight}px`);

      const isSelectionMode = mode === 'selection';
      previewOverlay.classList.toggle('selection-mode', isSelectionMode);

      // Show/hide buttons based on mode
      overlayDownloadBtn.classList.toggle('hidden', isSelectionMode);
      overlayCloseBtn.classList.toggle('hidden', isSelectionMode);
      selectionCloseBtn.classList.toggle('hidden', !isSelectionMode);
      selectionSelectAllBtn.classList.toggle('hidden', !isSelectionMode);
      selectionDeselectAllBtn.classList.toggle('hidden', !isSelectionMode);
      selectionGenerateBtn.classList.toggle('hidden', !isSelectionMode);

      // Set layout class based on number of cards
      const cardCount = scenarios.length;
      overlayCardsContainer.className = 'cards-grid'; // Reset
      if (cardCount > 0) {
        overlayCardsContainer.classList.add(`card-count-${cardCount}`);
      }

      renderPreview(scenarios, durabilityLines, overlayCardsContainer);

      // Add selectable class in selection mode
      if (isSelectionMode) {
        overlayCardsContainer.querySelectorAll('.card').forEach(card => {
          card.classList.add('selectable');
        });
      }

      previewOverlay.classList.remove('hidden');
    };

    const openEnemySelectionModal = (targetCard) => {
      if (!targetCard) return;
      activeModalTargetCard = targetCard;

      modalEnemyList.innerHTML = ''; // Clear previous list
      if (savedEnemies.length === 0) {
        modalEnemyList.innerHTML = '<p>保存されている敵がいません。</p>';
      } else {
        savedEnemies.forEach((eventType, etIndex) => {
          const etDiv = document.createElement('div');
          etDiv.className = 'modal-enemy-category';
          const etHeader = document.createElement('h5');
          etHeader.style.color = 'var(--primary-color)';
          etHeader.style.borderBottom = '1px solid var(--border-color)';
          etHeader.style.paddingBottom = '0.3rem';
          etHeader.style.marginBottom = '0.5rem';
          etHeader.textContent = eventType.eventType;
          etDiv.appendChild(etHeader);

          eventType.series.forEach((series, serIndex) => {
            const serDiv = document.createElement('div');
            serDiv.className = 'modal-enemy-group';
            if (series.seriesName !== '-') {
              const serHeader = document.createElement('h6');
              serHeader.style.color = 'var(--secondary-color)';
              serHeader.style.marginBottom = '0.3rem';
              serHeader.textContent = series.seriesName;
              serDiv.appendChild(serHeader);
            }

            series.stages.forEach((stage, stgIndex) => {
              const stgLabel = document.createElement('div');
              stgLabel.style.fontSize = '0.8rem';
              stgLabel.style.color = 'var(--secondary-color)';
              stgLabel.style.marginBottom = '0.2rem';
              stgLabel.textContent = stage.stageName;
              serDiv.appendChild(stgLabel);

              const enemyGrid = document.createElement('div');
              enemyGrid.className = 'modal-enemy-grid';

              stage.bosses.forEach((boss, bossIndex) => {
                const item = document.createElement('div');
                item.className = 'modal-enemy-item';
                item.textContent = boss.name;
                item.dataset.etIndex = etIndex;
                item.dataset.serIndex = serIndex;
                item.dataset.stgIndex = stgIndex;
                item.dataset.bossIndex = bossIndex;
                enemyGrid.appendChild(item);
              });
              serDiv.appendChild(enemyGrid);
            });
            etDiv.appendChild(serDiv);
          });
          modalEnemyList.appendChild(etDiv);
        });
      }
      enemySelectionModal.classList.remove('hidden');
    };

    const closeEnemySelectionModal = () => {
      enemySelectionModal.classList.add('hidden');
      activeModalTargetCard = null;
    };

    const downloadPreview = () => {
      const captureTarget = document.getElementById('overlay-cards-container');
      if (!captureTarget) return;
      const isDarkMode = document.body.classList.contains('dark-mode');
      const backgroundColor = isDarkMode ? '#18191a' : '#f0f2f5';

      html2canvas(captureTarget, {
        useCORS: true,
        backgroundColor: backgroundColor,
        scale: 2
      }).then(canvas => {
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `dokkan-capture-${new Date().toISOString().slice(0, 10)}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }).catch(err => {
        console.error('Screenshot generation failed:', err);
        alert('エラーが発生し、スクリーンショットを生成できませんでした。');
      });
    };

    // --- SortableJS Logic ---
    function initSortable() {
      if (typeof Sortable === 'undefined') {
        console.warn('SortableJS not loaded, sorting disabled.');
        document.querySelectorAll('.btn-sort-mode').forEach(btn => btn.style.display = 'none');
        return;
      }
      if (sortable) sortable.destroy();

      // Sortable for scenario cards
      sortable = new Sortable(cardsContainer, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        dragClass: 'sortable-drag',
        handle: '.scenario-card-header',
        onEnd: function () { saveState(); },
        disabled: true,
      });
    }

    function toggleSortableMode() {
      if (typeof Sortable === 'undefined') return;
      const isActive = !sortable.option('disabled');
      sortable.option('disabled', isActive);
      document.body.classList.toggle('sortable-mode', !isActive);
      document.querySelectorAll('.btn-sort-mode').forEach(btn => btn.classList.toggle('active', !isActive));
    }

    // --- Event Listeners Setup ---
    function setupEventListeners() {
      // --- Calculation Mode Switch Logic ---
      const enemyManagementCard = document.getElementById('enemy-management-card');
      const calcModeRadios = document.querySelectorAll('input[name="calc_mode"]');

      const handleModeChange = () => {
        const selectedMode = document.querySelector('input[name="calc_mode"]:checked').value;
        document.querySelectorAll('#scenario-cards-container .card').forEach(card => {
          const enemyAtkGroup = card.querySelector(`[id$="-enemy-atk-group"]`);
          const loadedEnemyData = card.dataset.loadedEnemy ? JSON.parse(card.dataset.loadedEnemy) : null;

          // Show manual ATK input only in damage mode AND when no preset is loaded
          if (selectedMode === 'damage' && !loadedEnemyData) {
            enemyAtkGroup.style.display = 'block';
          } else {
            enemyAtkGroup.style.display = 'none';
          }
        });
        updateAllScenarioResults();
      };

      calcModeRadios.forEach(radio => {
        radio.addEventListener('change', handleModeChange);
      });

      // Make enemy management card visible by default, its visibility is now handled by its own collapse/expand state
      if (enemyManagementCard) enemyManagementCard.style.display = 'block';

      // --- Enemy Management Collapse/Expand Logic ---
      const enemyHeader = document.getElementById('enemy-management-header');
      const enemyBody = document.getElementById('enemy-management-body');
      if (enemyHeader) {
        enemyHeader.addEventListener('click', (e) => {
          if (e.target.closest('button')) return; // Ignore clicks on buttons inside header
          const isCollapsed = enemyBody.style.display === 'none';
          enemyBody.style.display = isCollapsed ? 'block' : 'none';
          enemyHeader.querySelector('.toggle-arrow').classList.toggle('collapsed', !isCollapsed);
        });
      }

      // Set initial visibility on load
      handleModeChange();

      addLineBtn.addEventListener('click', addDurabilityLine);
      newLineInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') addDurabilityLine(); });
      addScenarioBtn.addEventListener('click', () => { addScenarioCard(); saveState(); });

      saveCharacterBtn.addEventListener('click', () => {
        saveCharacter();
        isCharacterEditMode = false;
        saveCharacterBtn.textContent = '現在の状況を保存';
        newCharacterNameInput.value = ''; // Clear name input after saving
      });

      loadCharacterBtn.addEventListener('click', () => {
        if (loadCharacter()) { // loadCharacter returns true on success
          isCharacterEditMode = true;
          saveCharacterBtn.textContent = '変更を上書き保存';
        }
      });

      deleteCharacterBtn.addEventListener('click', () => {
        deleteCharacter();
        isCharacterEditMode = false;
        saveCharacterBtn.textContent = '現在の状況を保存';
      });

      themeToggleBtn.addEventListener('click', toggleTheme);

      newCharacterBtn.addEventListener('click', () => {
        startNewCharacter();
        isCharacterEditMode = false;
        saveCharacterBtn.textContent = '現在の状況を保存';
      });

      summaryViewBtn.addEventListener('click', () => {
        if (cardsContainer.children.length === 0) {
          alert('スクリーンショットの対象となる状況がありません。');
          return;
        }
        const scenarios = getCurrentScenariosData();
        openPreviewOverlay(scenarios, 'selection');
      });

      // Preview Overlay Listeners
      overlayCloseBtn.addEventListener('click', () => previewOverlay.classList.add('hidden'));
      overlayDownloadBtn.addEventListener('click', downloadPreview);

      // Enemy Modal Listeners
      modalCloseBtn.addEventListener('click', closeEnemySelectionModal);
      enemySelectionModal.addEventListener('click', (e) => {
        // Handle clicks on the overlay to close it
        if (e.target === enemySelectionModal) {
          closeEnemySelectionModal();
          return;
        }
        // Handle clicks on enemy items
        const enemyItem = e.target.closest('.modal-enemy-item');
        if (enemyItem && activeModalTargetCard) {
          const etIndex = parseInt(enemyItem.dataset.etIndex, 10);
          const serIndex = parseInt(enemyItem.dataset.serIndex, 10);
          const stgIndex = parseInt(enemyItem.dataset.stgIndex, 10);
          const bossIndex = parseInt(enemyItem.dataset.bossIndex, 10);
          const enemyData = savedEnemies[etIndex]?.series[serIndex]?.stages[stgIndex]?.bosses[bossIndex];

          if (enemyData) {
            // Store the entire enemy object on the card
            activeModalTargetCard.dataset.loadedEnemy = JSON.stringify(enemyData);

            // Set attributes and crit values
            activeModalTargetCard.querySelector('[data-input="enemy_class"]').value = enemyData.class;
            activeModalTargetCard.querySelector('[data-input="enemy_type"]').value = enemyData.type;
            // 会心ATK上昇率と会心DEF低下率を設定
            // critFixedRate, critHpRate, critTurnMax などから推定値を設定
            let effectiveCritAtkUp = enemyData.critAtkUp || 0;
            let effectiveCritDefDown = enemyData.critDefDown || 0;

            // 条件付き会心の場合、最大値を初期値として使用
            if (effectiveCritAtkUp === 0) {
              // critFixedRate（固定会心ATK上昇率）があればそれを使う
              if (enemyData.critFixedRate > 0) {
                effectiveCritAtkUp = enemyData.critFixedRate;
              }
              // critTurnMax（ターン経過会心の最大値）があればそれを使う
              else if (enemyData.critTurnMax > 0) {
                effectiveCritAtkUp = enemyData.critTurnMax;
              }
              // critHpRate (HP条件会心) があればそれを使う
              else if (enemyData.critHpRate > 0) {
                effectiveCritAtkUp = enemyData.critHpRate;
              }
            }

            activeModalTargetCard.querySelector('[data-input="crit_atk_up"]').value = effectiveCritAtkUp || '';
            activeModalTargetCard.querySelector('[data-input="crit_def_down"]').value = effectiveCritDefDown || '';

            const critCheckbox = activeModalTargetCard.querySelector('[data-input="is_critical"]');
            critCheckbox.checked = enemyData.isCriticalDefault || false;

            // Manually trigger the visibility toggle
            const critContainer = activeModalTargetCard.querySelector('.crit-inputs-container');
            critContainer.style.display = critCheckbox.checked ? 'grid' : 'none';


            // Clear the manual ATK input as it's no longer primary
            activeModalTargetCard.querySelector('[data-input="enemy_atk"]').value = '';

            updateScenarioResults(activeModalTargetCard);
            saveState();
          }
          closeEnemySelectionModal();
        }
      });

      // Selection Mode Listeners
      selectionCloseBtn.addEventListener('click', () => previewOverlay.classList.add('hidden'));

      overlayCardsContainer.addEventListener('click', (e) => {
        if (!previewOverlay.classList.contains('selection-mode')) return;
        const card = e.target.closest('.card.selectable');
        if (card) {
          card.classList.toggle('selected');
        }
      });

      selectionSelectAllBtn.addEventListener('click', () => {
        overlayCardsContainer.querySelectorAll('.card.selectable').forEach(card => {
          card.classList.add('selected');
        });
      });

      selectionDeselectAllBtn.addEventListener('click', () => {
        overlayCardsContainer.querySelectorAll('.card.selectable').forEach(card => {
          card.classList.remove('selected');
        });
      });

      selectionGenerateBtn.addEventListener('click', () => {
        const allScenarios = getCurrentScenariosData();
        const selectedScenarios = [];

        overlayCardsContainer.querySelectorAll('.card.selected').forEach(card => {
          const scenarioIndex = parseInt(card.dataset.originalIndex, 10);
          if (!isNaN(scenarioIndex) && allScenarios[scenarioIndex]) {
            selectedScenarios.push(allScenarios[scenarioIndex]);
          }
        });

        if (selectedScenarios.length === 0) {
          alert('スクリーンショットに含めるカードを1枚以上選択してください。');
          return;
        }

        openPreviewOverlay(selectedScenarios, 'preview');
      });

      expandAllBtn.addEventListener('click', () => {
        document.querySelectorAll('#scenario-cards-container .card .scenario-card-body').forEach(body => body.classList.add('show'));
        document.querySelectorAll('#scenario-cards-container .card .toggle-arrow').forEach(arrow => arrow.classList.remove('collapsed'));
      });
      collapseAllBtn.addEventListener('click', () => {
        document.querySelectorAll('#scenario-cards-container .card .scenario-card-body').forEach(body => body.classList.remove('show'));
        document.querySelectorAll('#scenario-cards-container .card .toggle-arrow').forEach(arrow => arrow.classList.add('collapsed'));
      });

      cardsContainer.addEventListener('input', (e) => {
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
      });

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
      });

      saveEnemyBtn.addEventListener('click', saveEnemy);
      deleteEnemyBtn.addEventListener('click', deleteEnemy);
      clearEnemyFormBtn.addEventListener('click', clearEnemyForm);

      const resetAllDataBtn = document.getElementById('reset-all-data-btn');
      if (resetAllDataBtn) {
        resetAllDataBtn.addEventListener('click', () => {
          if (confirm('全てのデータ（敵・キャラクター・状況）をリセットしますか？\r\nこの操作は元に戻せません。')) {
            localStorage.clear();
            location.reload();
          }
        });
      }

      const updatePresetEnemiesBtn = document.getElementById('update-preset-enemies-btn');
      if (updatePresetEnemiesBtn) {
        updatePresetEnemiesBtn.addEventListener('click', () => {
          if (confirm('敵のデータを最新のプリセットに更新しますか？\r\n\r\n※この操作を行っても、登録した「マイキャラクター」などの設定はそのまま残ります。\r\n※手動で追加した敵は一旦リセットされます。')) {
            let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
            state.savedEnemies = JSON.parse(JSON.stringify(DEFAULT_ENEMIES_PRESET));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            location.reload();
          }
        });
      }

      addAttackPatternBtn.addEventListener('click', () => {
        addAttackPatternRow();
      });

      newEnemyAttacksContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-attack-btn')) {
          if (newEnemyAttacksContainer.querySelectorAll('.attack-pattern-row').length > 1) {
            e.target.closest('.attack-pattern-row').remove();
          } else {
            alert('最低1つの攻撃パターンが必要です。');
          }
        }
      });

      newEnemyCritDefaultEnabledCheckbox.addEventListener('click', () => {
        newEnemyCritInputsContainer.style.display = newEnemyCritDefaultEnabledCheckbox.checked ? 'grid' : 'none';
      });

      enemyEventTypeList.addEventListener('change', () => updateSeriesList());
      enemySeriesList.addEventListener('change', () => updateStageList());
      enemyStageList.addEventListener('change', () => updateBossList());

      editEnemyBtn.addEventListener('click', () => {
        const selectedValue = enemyBossList.value;
        if (!selectedValue || selectedValue === "-1") {
          alert('編集するボスを選択してください。');
          return;
        }

        const [etIdx, serIdx, stgIdx, bossIdx] = selectedValue.split('_').map(Number);
        const eventType = savedEnemies[etIdx];
        const series = eventType?.series[serIdx];
        const stage = series?.stages[stgIdx];
        const boss = stage?.bosses[bossIdx];

        if (!boss) {
          alert('選択されたボスが見つかりませんでした。');
          return;
        }

        // Populate the form fields
        newEnemyEventTypeInput.value = eventType.eventType;
        newEnemySeriesNameInput.value = series.seriesName;
        newEnemyStageNameInput.value = stage.stageName;
        newEnemyNameInput.value = boss.name;
        newEnemyClassSelect.value = boss.class;
        newEnemyTypeSelect.value = boss.type;
        newEnemyCritAtkInput.value = boss.critAtkUp || '';
        newEnemyCritDefInput.value = boss.critDefDown || '';
        newEnemyCritDefaultEnabledCheckbox.checked = boss.isCriticalDefault || false;
        newEnemyCritInputsContainer.style.display = newEnemyCritDefaultEnabledCheckbox.checked ? 'grid' : 'none';

        // Populate attack patterns
        newEnemyAttacksContainer.innerHTML = ''; // Clear existing rows
        if (boss.attacks && boss.attacks.length > 0) {
          boss.attacks.forEach(attack => addAttackPatternRow(attack));
        } else {
          addAttackPatternRow(); // Add a blank one if none exist
        }

        // Change button text to indicate edit mode
        saveEnemyBtn.textContent = '変更を保存';
      });

      cardsContainer.addEventListener('click', (e) => {
        const target = e.target;
        const card = target.closest('.card');
        if (!card) return;

        // --- Button-specific actions ---
        // Using .closest() is more robust as it handles clicks on child elements of the button
        if (target.closest('.load-enemy-to-card-cascade-btn')) {
          const bossSel = card.querySelector('[data-input="loaded_enemy_boss"]');
          if (!bossSel || bossSel.value === '-1') {
            alert('ボスを選択してください');
            return;
          }
          const [etIdx, serIdx, stgIdx, bossIdx] = bossSel.value.split('_').map(Number);
          const boss = savedEnemies[etIdx]?.series[serIdx]?.stages[stgIdx]?.bosses[bossIdx];
          if (!boss) { alert('ボスが見つかりません'); return; }

          card.dataset.loadedEnemy = JSON.stringify(boss);
          const classSelect = card.querySelector('[data-input="enemy_class"]');
          const typeSelect = card.querySelector('[data-input="enemy_type"]');
          if (classSelect) classSelect.value = boss.class || 'super';
          if (typeSelect) typeSelect.value = boss.type || 'teq';

          // 会心自動設定: hasSaCrit のみで全体会心をONにしないように修正
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
          }

          const critAtkInput = card.querySelector('[data-input="crit_atk_up"]');
          const critDefInput = card.querySelector('[data-input="crit_def_down"]');
          if (critAtkInput) critAtkInput.value = boss.critAtkUp || '';
          if (critDefInput) critDefInput.value = boss.critDefDown || '';

          handleModeChange();
          saveState();
          return;
        }
        if (target.closest('.load-enemy-to-card-cascade-btn')) {
          const bossSel = card.querySelector('[data-input="loaded_enemy_boss"]');
          if (!bossSel || bossSel.value === '-1') {
            alert('ボスを選択してください');
            return;
          }
          const [etIdx, serIdx, stgIdx, bossIdx] = bossSel.value.split('_').map(Number);
          const boss = savedEnemies[etIdx]?.series[serIdx]?.stages[stgIdx]?.bosses[bossIdx];
          if (!boss) { alert('ボスが見つかりません'); return; }
          card.dataset.loadedEnemy = JSON.stringify(boss);
          const classSelect = card.querySelector('[data-input="enemy_class"]');
          const typeSelect = card.querySelector('[data-input="enemy_type"]');
          if (classSelect) classSelect.value = boss.class || 'super';
          if (typeSelect) typeSelect.value = boss.type || 'teq';
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
          }
          const critAtkInput = card.querySelector('[data-input="crit_atk_up"]');
          const critDefInput = card.querySelector('[data-input="crit_def_down"]');
          if (critAtkInput) critAtkInput.value = boss.critAtkUp || '';
          if (critDefInput) critDefInput.value = boss.critDefDown || '';
          handleModeChange();
          saveState();
          return;
        }
        if (target.closest('.load-enemy-to-card-btn')) {
          openEnemySelectionModal(card);
          return;
        }
        if (target.closest('.clear-enemy-from-card-btn')) {
          if (card.dataset.loadedEnemy) {
            delete card.dataset.loadedEnemy;
            card.querySelector('[data-input="enemy_class"]').value = 'super';
            card.querySelector('[data-input="enemy_type"]').value = 'teq';
            handleModeChange();
            saveState();
          }
          return;
        }
        if (target.closest('.reset-scenario-btn')) {
          if (confirm('この状況の入力値をリセットしますか？')) {
            if (card.dataset.loadedEnemy) delete card.dataset.loadedEnemy;
            card.querySelector('.crit-inputs-container').style.display = 'none';
            card.querySelectorAll('.scenario-input').forEach(input => {
              if (input.type === 'checkbox') input.checked = false;
              else if (input.dataset.input !== 'scenario_title') input.value = '';
            });
            handleModeChange();
            saveState();
          }
          return;
        }
        if (target.closest('.duplicate-scenario-btn')) {
          const scenarios = getCurrentScenariosData();
          const currentData = scenarios.find(d => d.scenario_title === card.querySelector('.scenario-title-text').textContent);
          if (currentData) {
            const newData = JSON.parse(JSON.stringify(currentData));
            newData.scenario_title = `${newData.scenario_title} (コピー)`;
            addScenarioCard(newData, card);
            saveState();
          }
          return;
        }
        if (target.closest('.delete-scenario-btn')) {
          if (document.querySelectorAll('#scenario-cards-container .card').length > 1) {
            card.remove();
            saveState();
          } else {
            alert('最低1つの状況が必要です。');
          }
          return;
        }
        if (target.closest('.btn-edit-title')) {
          const header = target.closest('.scenario-card-header');
          const input = header.querySelector('.scenario-title-input');
          const text = header.querySelector('.scenario-title-text');
          const commitTitleEdit = () => {
            header.classList.remove('is-editing');
            text.textContent = input.value.trim() || "状況";
            saveState();
            input.removeEventListener('blur', commitTitleEdit);
            input.removeEventListener('keydown', handleKeydown);
          };
          const handleKeydown = (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitTitleEdit();
            } else if (event.key === 'Escape') {
              header.classList.remove('is-editing');
              input.removeEventListener('blur', commitTitleEdit);
              input.removeEventListener('keydown', handleKeydown);
            }
          };
          if (!header.classList.contains('is-editing')) {
            header.classList.add('is-editing');
            input.value = text.textContent;
            input.focus();
            input.select();
            input.addEventListener('blur', commitTitleEdit);
            input.addEventListener('keydown', handleKeydown);
          } else {
            commitTitleEdit();
          }
          return;
        }
        if (target.closest('.btn-sort-mode')) {
          toggleSortableMode();
          return;
        }

        // --- Collapsible Header actions (will only be reached if a button was not clicked) ---
        const subHeader = target.closest('.sub-section-header');
        if (subHeader) {
          const body = subHeader.nextElementSibling;
          body.style.display = body.style.display === 'none' ? '' : 'none';
          subHeader.querySelector('.toggle-arrow').classList.toggle('collapsed', body.style.display === 'none');
          return;
        }

        const mainHeader = target.closest('.scenario-card-header');
        if (mainHeader) {
          const body = card.querySelector('.scenario-card-body');
          const arrow = card.querySelector('.toggle-arrow');
          body.classList.toggle('show');
          arrow.classList.toggle('collapsed', !body.classList.contains('show'));
          return;
        }
      });

      linesListContainer.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
          deleteDurabilityLine(parseInt(e.target.dataset.index, 10));
        }
      });
    }

    // --- Initial Load ---
    try {
      loadState();
      setupEventListeners();
      // Initial call to add one attack pattern row to the form
      addAttackPatternRow();
    } catch (e) {
      console.error("Initialization failed", e);
      const errorDiv = document.createElement('div');
      errorDiv.style.position = 'fixed';
      errorDiv.style.top = '0';
      errorDiv.style.left = '0';
      errorDiv.style.width = '100%';
      errorDiv.style.padding = '10px';
      errorDiv.style.backgroundColor = 'red';
      errorDiv.style.color = 'white';
      errorDiv.style.zIndex = '9999';
      errorDiv.textContent = 'エラーが発生しました。ページを再読み込みしてください。 ' + e.message;
      document.body.appendChild(errorDiv);
    }
  }, 0);
})