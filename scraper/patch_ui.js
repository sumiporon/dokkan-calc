/**
 * patch_ui.js - dokkan_calc_final.js にパッチを当てるスクリプト
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'dokkan_calc_final.js');
console.log('Reading file:', filePath);
let content = fs.readFileSync(filePath, 'utf8');
console.log('File size:', content.length);

let patchCount = 0;

// ===== Patch 1: カスケード初期化関数の追加 =====
const P1_FIND = '      updateScenarioResults(card);\n    };\n\n    // --- Calculation Functions ---';
const P1_REPLACE = `      // カスケードドロップダウンを初期化
      initScenarioCascade(card, cardId);

      updateScenarioResults(card);
    };

    // --- シナリオカード用カスケードドロップダウン ---
    const initScenarioCascade = (card, cardId) => {
      const etList = card.querySelector('[data-input="loaded_enemy_event_type"]');
      const serList = card.querySelector('[data-input="loaded_enemy_series"]');
      const stgList = card.querySelector('[data-input="loaded_enemy_stage"]');
      const bossList = card.querySelector('[data-input="loaded_enemy_boss"]');
      if (!etList || !serList || !stgList || !bossList) return;

      const fillET = () => {
        etList.innerHTML = '';
        serList.innerHTML = '<option value="-1">-</option>';
        stgList.innerHTML = '<option value="-1">-</option>';
        bossList.innerHTML = '<option value="-1">-</option>';
        if (savedEnemies.length === 0) {
          etList.innerHTML = '<option value="-1">敵がいません</option>';
          return;
        }
        savedEnemies.forEach((et, i) => {
          const o = document.createElement('option');
          o.value = i; o.textContent = et.eventType;
          etList.appendChild(o);
        });
        etList.selectedIndex = 0;
        fillSer();
      };

      const fillSer = () => {
        serList.innerHTML = '';
        stgList.innerHTML = '<option value="-1">-</option>';
        bossList.innerHTML = '<option value="-1">-</option>';
        const etIdx = etList.value;
        if (etIdx === '-1' || !savedEnemies[etIdx]) return;
        savedEnemies[etIdx].series.forEach((ser, i) => {
          const o = document.createElement('option');
          o.value = i; o.textContent = ser.seriesName;
          serList.appendChild(o);
        });
        serList.selectedIndex = 0;
        fillStg();
      };

      const fillStg = () => {
        stgList.innerHTML = '';
        bossList.innerHTML = '<option value="-1">-</option>';
        const etIdx = etList.value;
        const serIdx = serList.value;
        if (etIdx === '-1' || serIdx === '-1') return;
        const ser = savedEnemies[etIdx]?.series[serIdx];
        if (!ser) return;
        ser.stages.forEach((stg, i) => {
          const o = document.createElement('option');
          o.value = i; o.textContent = stg.stageName;
          stgList.appendChild(o);
        });
        stgList.selectedIndex = 0;
        fillBoss();
      };

      const fillBoss = () => {
        bossList.innerHTML = '';
        const etIdx = etList.value;
        const serIdx = serList.value;
        const stgIdx = stgList.value;
        if (etIdx === '-1' || serIdx === '-1' || stgIdx === '-1') return;
        const stg = savedEnemies[etIdx]?.series[serIdx]?.stages[stgIdx];
        if (!stg) return;
        stg.bosses.forEach((boss, i) => {
          const o = document.createElement('option');
          o.value = etIdx + '_' + serIdx + '_' + stgIdx + '_' + i;
          o.textContent = boss.name;
          bossList.appendChild(o);
        });
        bossList.selectedIndex = 0;
      };

      etList.addEventListener('change', fillSer);
      serList.addEventListener('change', fillStg);
      stgList.addEventListener('change', fillBoss);
      fillET();
    };

    // --- Calculation Functions ---`;

if (content.includes(P1_FIND)) {
    content = content.replace(P1_FIND, P1_REPLACE);
    patchCount++;
    console.log('Patch 1 OK: カスケード初期化関数を追加');
} else {
    console.error('Patch 1 FAILED: ターゲット文字列が見つかりません');
    // デバッグ: 周辺の文字列を表示
    const idx = content.indexOf('updateScenarioResults(card);');
    if (idx !== -1) {
        console.log('Found updateScenarioResults at index', idx);
        console.log('Context:', JSON.stringify(content.substring(idx - 50, idx + 100)));
    }
}

// ===== Patch 2: 「反映」ボタンのイベントハンドラ =====
const P2_FIND = "if (target.closest('.load-enemy-to-card-btn')) {\n          openEnemySelectionModal(card);\n          return;\n        }";

const P2_REPLACE = `if (target.closest('.load-enemy-to-card-cascade-btn')) {
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
          if (critCheckbox && boss.isCriticalDefault) {
            critCheckbox.checked = true;
            const critContainer = card.querySelector('.crit-inputs-container');
            if (critContainer) critContainer.style.display = 'grid';
          }
          handleModeChange();
          saveState();
          return;
        }
        if (target.closest('.load-enemy-to-card-btn')) {
          openEnemySelectionModal(card);
          return;
        }`;

if (content.includes(P2_FIND)) {
    content = content.replace(P2_FIND, P2_REPLACE);
    patchCount++;
    console.log('Patch 2 OK: 反映ボタンのイベントハンドラを追加');
} else {
    console.error('Patch 2 FAILED');
    const idx2 = content.indexOf('load-enemy-to-card-btn');
    if (idx2 !== -1) {
        console.log('Found load-enemy-to-card-btn at index', idx2);
        console.log('Context:', JSON.stringify(content.substring(idx2 - 80, idx2 + 120)));
    }
}

// ===== Patch 3: isCrit変数名 =====
const P3_FIND = 'is_critical || atk.isCrit';
const P3_REPLACE = 'is_critical || attack.isCrit';

if (content.includes(P3_FIND)) {
    content = content.replace(P3_FIND, P3_REPLACE);
    patchCount++;
    console.log('Patch 3 OK: isCrit変数名を修正');
} else {
    console.log('Patch 3 SKIP: 既に修正済みか見つかりません');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log(`完了: ${patchCount}個のパッチを適用`);
