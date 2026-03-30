/**
 * patch_remove_old_accordion.js
 * 古いアコーディオンコードの残骸を除去する
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'dokkan_calc_final.js');
console.log('Reading file...');
let content = fs.readFileSync(filePath, 'utf8');
console.log('File size:', content.length);

// 古いアコーディオンの残骸を除去
// renderDynamicAttacks() の後に残っている古いgroupedAttacksのコードを削除
const OLD_CODE = `            renderDynamicAttacks();
          }

            Object.keys(groupedAttacks).forEach(group => {
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

const NEW_CODE = `            renderDynamicAttacks();
          }`;

if (content.includes(OLD_CODE)) {
    content = content.replace(OLD_CODE, NEW_CODE);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('OK: 古いアコーディオンコードを除去しました');
} else {
    console.error('FAILED: ターゲットが見つかりません');
    // デバッグ: renderDynamicAttacks 周辺
    const idx = content.indexOf('renderDynamicAttacks();');
    if (idx !== -1) {
        console.log('renderDynamicAttacks found at index', idx);
        console.log('After:', JSON.stringify(content.substring(idx, idx + 200)));
    }
}
