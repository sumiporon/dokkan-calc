/**
 * Dokkan Attribute Parser - Content Script
 * DokkanInfoのボスページから敵の属性情報を取得
 */

(function () {
    'use strict';

    // スタイルを注入
    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #dokkan-parser-container {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 999999;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            #dokkan-parser-panel {
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                border: 2px solid #e94560;
                border-radius: 12px;
                padding: 16px;
                min-width: 280px;
                box-shadow: 0 8px 32px rgba(233, 69, 96, 0.3);
                color: #fff;
            }
            #dokkan-parser-panel h3 {
                margin: 0 0 12px 0;
                font-size: 14px;
                color: #e94560;
            }
            #dokkan-parser-panel h3::before {
                content: '🐉 ';
            }
            .dokkan-parser-info {
                background: rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                padding: 12px;
                margin-bottom: 12px;
                font-size: 13px;
            }
            .dokkan-parser-row {
                display: flex;
                justify-content: space-between;
                margin-bottom: 6px;
            }
            .dokkan-parser-row:last-child { margin-bottom: 0; }
            .dokkan-parser-label { color: #aaa; }
            .dokkan-parser-value { font-weight: bold; color: #fff; }
            .dokkan-parser-value.type-agl { color: #5eb5ff; }
            .dokkan-parser-value.type-teq { color: #7cff7c; }
            .dokkan-parser-value.type-int { color: #ff7cff; }
            .dokkan-parser-value.type-str { color: #ff7c7c; }
            .dokkan-parser-value.type-phy { color: #ffb347; }
            #dokkan-copy-btn {
                width: 100%;
                padding: 12px;
                background: linear-gradient(135deg, #e94560 0%, #c23a51 100%);
                border: none;
                border-radius: 8px;
                color: #fff;
                font-size: 14px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            #dokkan-copy-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 16px rgba(233, 69, 96, 0.4);
            }
            #dokkan-copy-btn.copied {
                background: linear-gradient(135deg, #4caf50 0%, #388e3c 100%);
            }
            .dokkan-parser-status {
                text-align: center;
                font-size: 12px;
                color: #aaa;
                margin-top: 8px;
            }
            .dokkan-parser-not-found {
                color: #ffb347;
                text-align: center;
                padding: 20px;
            }
        `;
        document.head.appendChild(style);
    }

    // 属性マッピング
    // cha_type_icon_XX: 10-14=Super, 20-24=Extreme
    // 末尾: 0=AGL, 1=TEQ, 2=INT, 3=STR, 4=PHY
    const TYPE_MAP = ['agl', 'teq', 'int', 'str', 'phy'];
    const TYPE_NAMES_JP = {
        'agl': '速',
        'teq': '技',
        'int': '知',
        'str': '力',
        'phy': '体'
    };
    const CLASS_NAMES_JP = {
        'super': '超',
        'extreme': '極'
    };

    // 敵データを格納
    let enemyData = null;

    /**
     * cha_type_icon_XX から属性を解析
     */
    function parseTypeFromIconId(id) {
        const typeId = id % 10;
        const classId = Math.floor(id / 10);

        let enemyClass = null;
        if (classId === 1) enemyClass = 'super';
        else if (classId === 2) enemyClass = 'extreme';

        const enemyType = TYPE_MAP[typeId];

        if (enemyClass && enemyType) {
            return { class: enemyClass, type: enemyType };
        }
        return null;
    }

    /**
     * ページから敵データを抽出
     */
    function extractEnemyData() {
        const data = {
            name: null,
            class: null,
            type: null,
            normalAtk: null,
            saAtk: null
        };

        // 1. 名前を取得
        const nameEl = document.querySelector('.title_h2') ||
            document.querySelector('h2') ||
            document.querySelector('h1');
        if (nameEl) {
            data.name = nameEl.textContent.trim();
        }

        // 2. cha_type_icon を検索（DOM内の全img要素）
        const imgs = document.querySelectorAll('img');
        for (const img of imgs) {
            const src = img.src || '';
            const match = src.match(/cha_type_icon_(\d+)/);
            if (match) {
                const id = parseInt(match[1], 10);
                const typeInfo = parseTypeFromIconId(id);
                if (typeInfo) {
                    data.class = typeInfo.class;
                    data.type = typeInfo.type;
                    console.log(`[Dokkan Parser] 属性検出: cha_type_icon_${id} → ${typeInfo.class} ${typeInfo.type}`);
                    break;
                }
            }
        }

        // 3. ATK値を取得（Attack Stat: XXX のパターン）
        const bodyText = document.body.innerText;
        const atkMatch = bodyText.match(/Attack Stat[:\s]+([\d,]+)/i);
        if (atkMatch) {
            data.normalAtk = parseInt(atkMatch[1].replace(/,/g, ''), 10);
        }

        // 4. SA ATK を推定（3倍）
        if (data.normalAtk) {
            data.saAtk = data.normalAtk * 3;
        }

        return data;
    }

    /**
     * UIパネルを作成
     */
    function createUI() {
        // 既存のパネルがあれば削除
        const existing = document.getElementById('dokkan-parser-container');
        if (existing) existing.remove();

        const container = document.createElement('div');
        container.id = 'dokkan-parser-container';

        enemyData = extractEnemyData();

        if (enemyData.type) {
            // データが見つかった場合
            const classJP = CLASS_NAMES_JP[enemyData.class] || '?';
            const typeJP = TYPE_NAMES_JP[enemyData.type] || '?';

            container.innerHTML = `
        <div id="dokkan-parser-panel">
          <h3>敵データ検出</h3>
          <div class="dokkan-parser-info">
            <div class="dokkan-parser-row">
              <span class="dokkan-parser-label">名前:</span>
              <span class="dokkan-parser-value">${enemyData.name || '不明'}</span>
            </div>
            <div class="dokkan-parser-row">
              <span class="dokkan-parser-label">属性:</span>
              <span class="dokkan-parser-value type-${enemyData.type}">${classJP}${typeJP}</span>
            </div>
            ${enemyData.normalAtk ? `
            <div class="dokkan-parser-row">
              <span class="dokkan-parser-label">ATK:</span>
              <span class="dokkan-parser-value">${enemyData.normalAtk.toLocaleString()}</span>
            </div>
            ` : ''}
          </div>
          <button id="dokkan-copy-btn">📋 計算ツール用にコピー</button>
          <div class="dokkan-parser-status">クリックでクリップボードにコピー</div>
        </div>
      `;
        } else {
            // データが見つからなかった場合
            container.innerHTML = `
        <div id="dokkan-parser-panel">
          <h3>敵データ検出</h3>
          <div class="dokkan-parser-not-found">
            ⚠️ 属性情報が見つかりませんでした<br>
            <small>ボスページを開いてください</small>
          </div>
        </div>
      `;
        }

        document.body.appendChild(container);

        // コピーボタンのイベント
        const copyBtn = document.getElementById('dokkan-copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', handleCopy);
        }
    }

    /**
     * クリップボードにコピー
     */
    async function handleCopy() {
        if (!enemyData || !enemyData.type) return;

        const exportData = {
            source: 'dokkan-extension',
            version: '1.0',
            enemy: {
                name: enemyData.name || 'Unknown',
                class: enemyData.class,
                type: enemyData.type,
                attacks: []
            }
        };

        // ATKがある場合は攻撃パターンを追加
        if (enemyData.normalAtk) {
            exportData.enemy.attacks.push({ name: '通常', value: enemyData.normalAtk });
        }
        if (enemyData.saAtk) {
            exportData.enemy.attacks.push({ name: '必殺', value: enemyData.saAtk });
        }

        try {
            await navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));

            const btn = document.getElementById('dokkan-copy-btn');
            if (btn) {
                btn.textContent = '✅ コピーしました！';
                btn.classList.add('copied');

                setTimeout(() => {
                    btn.textContent = '📋 計算ツール用にコピー';
                    btn.classList.remove('copied');
                }, 2000);
            }

            console.log('[Dokkan Parser] データをコピーしました:', exportData);
        } catch (err) {
            console.error('[Dokkan Parser] コピー失敗:', err);
            alert('コピーに失敗しました。ページを再読み込みしてください。');
        }
    }

    /**
     * 初期化（ページ読み込み完了後に実行）
     */
    function init() {
        // スタイルを注入
        injectStyles();

        // ボスページかどうかをチェック（URLに /boss/ や /enemy/ が含まれる場合など）
        const url = window.location.href.toLowerCase();
        const isBossPage = url.includes('/boss/') ||
            url.includes('/enemy/') ||
            url.includes('/stage/') ||
            url.includes('/event/');

        // すべてのページでUIを表示（属性が見つからない場合はメッセージを表示）
        console.log('[Dokkan Parser] 初期化開始...');

        // DOMが完全に読み込まれるまで少し待つ
        setTimeout(() => {
            createUI();
            console.log('[Dokkan Parser] UI作成完了');
        }, 1500);
    }

    // 実行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
