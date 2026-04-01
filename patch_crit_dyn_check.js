const fs = require('fs');

const jsContent = fs.readFileSync('dokkan_calc_final.js', 'utf-8');

const targetString = `const saveState = (showMessage = true) => {`;
const insertString = `

    // --- Critical Setup Logic ---
    const checkAndShowCritBanner = () => {
        const overrides = JSON.parse(localStorage.getItem('dokkan_crit_overrides') || '{}');
        let unsetBosses = [];

        savedEnemies.forEach((et, etIndex) => {
            et.series.forEach((ser, serIndex) => {
                ser.stages.forEach((stg, stgIndex) => {
                    stg.bosses.forEach((boss, bossIndex) => {
                        const bossId = \`\${et.eventType}_\${ser.seriesName}_\${stg.stageName}_\${boss.name}\`;

                        // Apply overrides on load
                        if (overrides[bossId]) {
                            boss.critAtkUp = overrides[bossId].critAtkUp;
                            boss.critDefDown = overrides[bossId].critDefDown;
                        }

                        // Check if needs setup (hasSaCrit or isCriticalDefault but values are 0)
                        const hasCritContext = boss.hasSaCrit || boss.isCriticalDefault || boss.critFixedRate > 0 || boss.critTurnMax > 0 || boss.critHpRate > 0;
                        const needsSetup = hasCritContext && (!boss.critAtkUp && !boss.critDefDown);

                        if (needsSetup) {
                            unsetBosses.push({ etIndex, serIndex, stgIndex, bossIndex, boss, bossId, etName: et.eventType, serName: ser.seriesName, stgName: stg.stageName });
                        }
                    });
                });
            });
        });

        const banner = document.getElementById('crit-setup-banner');
        const countSpan = document.getElementById('crit-unset-count');

        if (unsetBosses.length > 0) {
            countSpan.textContent = unsetBosses.length;
            banner.style.display = 'block';

            // Store unset bosses for modal
            window._dokkanUnsetBosses = unsetBosses;
        } else {
            banner.style.display = 'none';
        }
    };

    const populateCritSetupModal = () => {
        const listDiv = document.getElementById('crit-setup-list');
        listDiv.innerHTML = '';
        const unsetBosses = window._dokkanUnsetBosses || [];

        if (unsetBosses.length === 0) {
            listDiv.innerHTML = '<p>設定が必要なボスはいません。</p>';
            return;
        }

        unsetBosses.forEach(item => {
            const div = document.createElement('div');
            div.className = 'crit-setup-item form-grid';
            div.style.marginBottom = '1rem';
            div.style.paddingBottom = '1rem';
            div.style.borderBottom = '1px solid var(--border-color)';
            div.dataset.bossId = item.bossId;
            div.dataset.etIndex = item.etIndex;
            div.dataset.serIndex = item.serIndex;
            div.dataset.stgIndex = item.stgIndex;
            div.dataset.bossIndex = item.bossIndex;

            div.innerHTML = \`
                <div style="grid-column: 1 / -1; font-weight: bold; margin-bottom: 0.5rem; color: var(--primary-color);">
                    \${item.etName} / \${item.serName} / \${item.stgName} - \${item.boss.name}
                </div>
                <div class="form-group">
                    <label>会心時ATK上昇率 (%)</label>
                    <input type="number" class="form-control crit-atk-input" value="\${item.boss.critAtkUp || ''}">
                </div>
                <div class="form-group">
                    <label>会心時相手DEF低下率 (%)</label>
                    <input type="number" class="form-control crit-def-input" value="\${item.boss.critDefDown || ''}">
                </div>
            \`;
            listDiv.appendChild(div);
        });
    };

    const saveCritSetupLocal = () => {
        const overrides = JSON.parse(localStorage.getItem('dokkan_crit_overrides') || '{}');
        const items = document.querySelectorAll('.crit-setup-item');
        let hasChanges = false;

        items.forEach(item => {
            const atkVal = parseFloat(item.querySelector('.crit-atk-input').value);
            const defVal = parseFloat(item.querySelector('.crit-def-input').value);

            if (!isNaN(atkVal) || !isNaN(defVal)) {
                const finalAtk = isNaN(atkVal) ? 0 : atkVal;
                const finalDef = isNaN(defVal) ? 0 : defVal;
                const bossId = item.dataset.bossId;

                overrides[bossId] = {
                    critAtkUp: finalAtk,
                    critDefDown: finalDef
                };

                // Also update live savedEnemies array
                const b = savedEnemies[item.dataset.etIndex].series[item.dataset.serIndex].stages[item.dataset.stgIndex].bosses[item.dataset.bossIndex];
                b.critAtkUp = finalAtk;
                b.critDefDown = finalDef;

                hasChanges = true;
            }
        });

        if (hasChanges) {
            localStorage.setItem('dokkan_crit_overrides', JSON.stringify(overrides));
            saveState(false);
            checkAndShowCritBanner();
            alert('ローカルに保存しました。');
            document.getElementById('crit-setup-modal').classList.add('hidden');
        } else {
            alert('保存する値がありません。');
        }

        return overrides;
    };

    document.getElementById('crit-setup-banner').addEventListener('click', () => {
        populateCritSetupModal();
        document.getElementById('crit-setup-modal').classList.remove('hidden');
    });

    document.getElementById('crit-modal-close-btn').addEventListener('click', () => {
        document.getElementById('crit-setup-modal').classList.add('hidden');
    });

    document.getElementById('save-crit-setup-btn').addEventListener('click', () => {
        saveCritSetupLocal();
    });
`;

if (jsContent.includes(targetString) && !jsContent.includes('checkAndShowCritBanner')) {
    const newContent = jsContent.replace(targetString, insertString + '\n' + targetString);
    fs.writeFileSync('dokkan_calc_final.js', newContent, 'utf-8');
    console.log("Crit Setup JS patched!");
} else {
    console.log("Target string not found or already patched.");
}
