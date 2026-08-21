/**
 * Dokkan Attribute Parser - Content Script
 */

(function () {
    'use strict';

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
                max-width: 400px;
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
                max-height: 200px;
                overflow-y: auto;
            }
            .dokkan-parser-row {
                display: flex;
                justify-content: space-between;
                margin-bottom: 6px;
                border-bottom: 1px solid rgba(255,255,255,0.1);
                padding-bottom: 4px;
            }
            .dokkan-parser-row:last-child { margin-bottom: 0; border-bottom: none; }
            .dokkan-parser-label { color: #aaa; }
            .dokkan-parser-value { font-weight: bold; color: #fff; text-align: right; }
            .dokkan-copy-btn {
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
                margin-bottom: 8px;
            }
            .dokkan-copy-btn:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(233, 69, 96, 0.4); }
            .dokkan-copy-btn.copied { background: linear-gradient(135deg, #4caf50 0%, #388e3c 100%); }
            .dokkan-parser-status { text-align: center; font-size: 12px; color: #aaa; }
            #dokkan-progress { margin: 8px 0; font-size: 12px; color: #7cff7c; text-align: center; }
        `;
        document.head.appendChild(style);
    }

    const CLASS_NAMES_JP = { 'super': '超', 'extreme': '極' };
    const TYPE_NAMES_JP = { 'agl': '速', 'teq': '技', 'int': '知', 'str': '力', 'phy': '体' };

    function parseDocumentForBosses(doc, defaultStageName) {
        const result = { stageName: defaultStageName || '', bosses: [] };
        const titleEl = doc.querySelector('title');
        const title = titleEl ? titleEl.textContent : '';
        result.stageName = title.split('|')[0].trim() || result.stageName;

        const parseStats = (text, cls, type, enemyName) => {
            const atkMatch = text.match(/ATK[:\s]*([0-9,]+)/i);
            const atk = atkMatch ? parseInt(atkMatch[1].replace(/,/g, ''), 10) : 0;

            const saMatch = text.match(/ダメージ[:\s]*([0-9,]+)/);
            const saDamage = saMatch ? parseInt(saMatch[1].replace(/,/g, ''), 10) : 0;

            const aoeMatch = text.match(/エリアダメージ[^\n]*?:\s*([0-9,]{4,})/);
            const aoeDamage = aoeMatch ? parseInt(aoeMatch[1].replace(/,/g, ''), 10) : 0;

            let saBuffModifier = 0.0;
            if (text.match(/ATKが大幅に上昇/) || text.match(/ATKとDEFが大幅上昇/) || text.match(/1ターンATK.*大幅.*上昇/)) {
                saBuffModifier = 0.5;
            } else if (text.match(/ATKが上昇/) || text.match(/1ターンATK.*(?<!大幅)上昇/)) {
                saBuffModifier = 0.3;
            }

            const hpMatch = text.match(/HP(\d+)%以下でATK(\d+)%UP/);
            const hpAtkThreshold = hpMatch ? parseInt(hpMatch[1], 10) : 0;
            const hpAtkUp = hpMatch ? parseInt(hpMatch[2], 10) : 0;

            result.bosses.push({
                name: enemyName || result.stageName,
                class: cls,
                type,
                atk,
                saDamage,
                aoeDamage,
                saBuffModifier,
                turnAtkUp: 0, turnAtkMax: 0,
                hitAtkUp: 0, hitAtkMax: 0,
                hpAtkThreshold, hpAtkUp,
                appearEntries: []
            });
        };

        const imgs = Array.from(doc.querySelectorAll('img[src*="cha_type_icon"]'));
        const enemyContainers = new Set();

        for (const img of imgs) {
            let parent = img.parentElement;
            let foundRow = null;
            while (parent && parent.tagName !== 'BODY' && parent.tagName !== 'HTML') {
                if (parent.tagName === 'TR' || (parent.classList && parent.classList.contains('row'))) {
                    foundRow = parent; break;
                }
                parent = parent.parentElement;
            }
            if (foundRow) enemyContainers.add(foundRow);
        }

        if (enemyContainers.size > 0) {
            for (const row of enemyContainers) {
                const rowText = row.innerText || row.textContent;
                let cls = 'extreme', type = 'teq';
                const img = row.querySelector('img[src*="cha_type_icon"]');
                if (img) {
                    const match = (img.src || '').match(/cha_type_icon_(\d+)/);
                    if (match) {
                        const id = parseInt(match[1], 10);
                        const typeId = id % 10;
                        const classId = Math.floor(id / 10) % 10;
                        const typeMap = ['agl', 'teq', 'int', 'str', 'phy'];
                        if (classId === 0) cls = 'super';
                        else if (classId === 1) cls = 'extreme';
                        if (typeMap[typeId]) type = typeMap[typeId];
                    }
                }
                let enemyName = '';
                const nameEl = row.querySelector('.font-size-1_2 b') || row.querySelector('b');
                if (nameEl) enemyName = nameEl.innerText || nameEl.textContent;
                parseStats(rowText, cls, type, enemyName.trim());
            }
        }

        const finalBosses = result.bosses.map(enemy => {
            const attacks = [];
            if (enemy.atk > 0) {
                const baseAtk = enemy.atk;
                const saDamage = enemy.saDamage || baseAtk * 3;
                const baseSaMulti = saDamage / baseAtk;
                const saBuffMod = enemy.saBuffModifier || 0;
                
                attacks.push({ name: '通常', value: baseAtk });
                if (saBuffMod > 0) attacks.push({ name: '通常(必殺後)', value: Math.floor(baseAtk * (1.0 + saBuffMod)) });
                attacks.push({ name: '必殺', value: Math.floor(baseAtk * (baseSaMulti + saBuffMod)) });
                if (enemy.aoeDamage) attacks.push({ name: '全体攻撃', value: enemy.aoeDamage });
            }
            return {
                name: enemy.name, class: enemy.class, type: enemy.type,
                attacks, critAtkUp: 0, critDefDown: 0, isCriticalDefault: false
            };
        }).filter(b => b.attacks.length > 0);

        return { stageName: result.stageName, bosses: finalBosses };
    }

    function createUI(mode, data) {
        const existing = document.getElementById('dokkan-parser-container');
        if (existing) existing.remove();

        const container = document.createElement('div');
        container.id = 'dokkan-parser-container';

        if (mode === 'stage') {
            const boss = data.bosses && data.bosses[0];
            const name = boss ? boss.name : '不明';
            const typeStr = boss ? `${CLASS_NAMES_JP[boss.class] || ''}${TYPE_NAMES_JP[boss.type] || ''}` : '?';

            container.innerHTML = `
                <div id="dokkan-parser-panel">
                    <h3>ボスデータ検出 (単体)</h3>
                    <div class="dokkan-parser-info">
                        <div class="dokkan-parser-row">
                            <span class="dokkan-parser-label">名前:</span>
                            <span class="dokkan-parser-value">${name}</span>
                        </div>
                        <div class="dokkan-parser-row">
                            <span class="dokkan-parser-label">属性:</span>
                            <span class="dokkan-parser-value">${typeStr}</span>
                        </div>
                        <div class="dokkan-parser-row">
                            <span class="dokkan-parser-label">検出ボス数:</span>
                            <span class="dokkan-parser-value">${data.bosses ? data.bosses.length : 0}体</span>
                        </div>
                    </div>
                    <button class="dokkan-copy-btn" id="btn-copy-stage">📋 計算ツール用にコピー</button>
                    <div class="dokkan-parser-status">クリックでクリップボードにコピー</div>
                </div>
            `;
            document.body.appendChild(container);
            document.getElementById('btn-copy-stage').addEventListener('click', () => copyToClipboard(data, 'stage', document.getElementById('btn-copy-stage')));

        } else if (mode === 'event_list') {
            const h2 = document.querySelector('.title_h2') || document.querySelector('h2') || document.querySelector('h1');
            let eventTitle = h2 ? h2.textContent.trim() : 'イベント';
            let eventType = '独立イベント';
            let seriesName = '-';

            if(eventTitle.includes('究極のレッドゾーン')) { eventType='レッドゾーン'; seriesName = eventTitle.replace('究極のレッドゾーン', '').trim(); }
            else if(eventTitle.includes('至上のバトルスペクタクル')) { eventType='バトルスペクタクル'; seriesName = eventTitle.replace('至上のバトルスペクタクル', '').trim(); }

            container.innerHTML = `
                <div id="dokkan-parser-panel">
                    <h3>イベント一括データ検出</h3>
                    <div class="dokkan-parser-info">
                        <div class="dokkan-parser-row">
                            <span class="dokkan-parser-label">イベント:</span>
                            <span class="dokkan-parser-value" style="font-size: 11px;">${eventTitle}</span>
                        </div>
                        <div class="dokkan-parser-row">
                            <span class="dokkan-parser-label">対象ステージ数:</span>
                            <span class="dokkan-parser-value">${data.stageLinks.length}</span>
                        </div>
                    </div>
                    <div id="dokkan-progress"></div>
                    <button class="dokkan-copy-btn" id="btn-fetch-all">🔄 全ステージを一括取得＆コピー</button>
                    <div class="dokkan-parser-status">時間がかかる場合があります</div>
                </div>
            `;
            document.body.appendChild(container);

            document.getElementById('btn-fetch-all').addEventListener('click', async () => {
                const btn = document.getElementById('btn-fetch-all');
                btn.disabled = true;
                const progress = document.getElementById('dokkan-progress');
                const allStagesData = [];

                for (let i = 0; i < data.stageLinks.length; i++) {
                    const link = data.stageLinks[i];
                    progress.textContent = `[${i+1}/${data.stageLinks.length}] 取得中...`;
                    try {
                        const res = await fetch(link);
                        const html = await res.text();
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(html, 'text/html');
                        
                        const stageData = parseDocumentForBosses(doc, "Stage " + (i+1));
                        if(stageData.bosses.length > 0) allStagesData.push(stageData);
                    } catch (e) {
                        console.error('Fetch error for ' + link, e);
                    }
                    await new Promise(r => setTimeout(r, 600));
                }

                progress.textContent = '取得完了！';
                const exportObj = {
                    source: 'dokkan-extension', version: '2.0', multiple: true,
                    eventList: [{ eventType: eventType, series: [{ seriesName: seriesName, stages: allStagesData }] }]
                };
                copyToClipboard(exportObj, 'event_list', btn);
            });

        } else if (mode === 'category_list') {
            const catTitle = data.title.split('|')[0].trim();
            container.innerHTML = `
                <div id="dokkan-parser-panel">
                    <h3>挑戦カテゴリ全域一括取得</h3>
                    <div class="dokkan-parser-info">
                        <div class="dokkan-parser-row">
                            <span class="dokkan-parser-label">カテゴリ:</span>
                            <span class="dokkan-parser-value" style="font-size: 11px;">${catTitle}</span>
                        </div>
                        <div class="dokkan-parser-row">
                            <span class="dokkan-parser-label">対象イベント数:</span>
                            <span class="dokkan-parser-value">${data.eventLinks.length}</span>
                        </div>
                    </div>
                    <div id="dokkan-progress" style="color: #ffb347; margin-bottom: 5px; text-align:center; font-size: 12px; font-weight: bold;">⚠️ 完了まで数分かかります</div>
                    <button class="dokkan-copy-btn" id="btn-fetch-category">🔄 全イベントを一括取得</button>
                    <div class="dokkan-parser-status">（途中で別ページに移動しないでください）</div>
                </div>
            `;
            document.body.appendChild(container);

            document.getElementById('btn-fetch-category').addEventListener('click', async () => {
                const btn = document.getElementById('btn-fetch-category');
                btn.disabled = true;
                const progress = document.getElementById('dokkan-progress');
                progress.style.color = '#7cff7c';
                
                const allEventDatas = [];
                for (let eIdx = 0; eIdx < data.eventLinks.length; eIdx++) {
                    const eventLink = data.eventLinks[eIdx];
                    progress.textContent = `[イベント ${eIdx+1}/${data.eventLinks.length}] を解析中...`;
                    
                    try {
                        const res = await fetch(eventLink);
                        const html = await res.text();
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(html, 'text/html');
                        
                        const links = doc.querySelectorAll('a[href*="events/"]');
                        const stageLinks = new Set();
                        for(let a of links) {
                            if(a.href.match(/\/events\/[a-z]+\/\d+\/\d+(?:[?#]|$)/i)) {
                                stageLinks.add(a.href);
                            }
                        }
                        
                        const stageLinksArr = Array.from(stageLinks);
                        let subEventType = '独立イベント';
                        const h2 = doc.querySelector('.title_h2') || doc.querySelector('h2') || doc.querySelector('h1');
                        let eventTitle = h2 ? h2.textContent.trim() : 'イベント';
                        let seriesName = eventTitle;

                        if(eventTitle.includes('究極のレッドゾーン')) { subEventType='レッドゾーン'; seriesName = eventTitle.replace('究極のレッドゾーン', '').trim(); }
                        else if(eventTitle.includes('至上のバトルスペクタクル')) { subEventType='バトルスペクタクル'; seriesName = eventTitle.replace('至上のバトルスペクタクル', '').trim(); }
                        else if(eventTitle.includes('メモリアルバトル')) { subEventType='メモリアルバトル'; seriesName = eventTitle.replace('メモリアルバトル', '').trim(); }
                        else if(eventTitle.includes('極限バトルロード')) { subEventType='極限バトルロード'; seriesName = eventTitle.replace('極限バトルロード', '').trim(); }
                        else if(eventTitle.includes('スーパーバトルロード')) { subEventType='スーパーバトルロード'; seriesName = eventTitle.replace('スーパーバトルロード', '').trim(); }
                        else if(eventTitle.includes('ドッカン大乱戦')) { subEventType='大乱戦'; seriesName = eventTitle.trim(); }

                        const allStagesData = [];
                        for(let sIdx = 0; sIdx < stageLinksArr.length; sIdx++) {
                            progress.textContent = `[イベ ${eIdx+1}/${data.eventLinks.length}] ステージ (${sIdx+1}/${stageLinksArr.length}) を取得中...`;
                            const sres = await fetch(stageLinksArr[sIdx]);
                            const shtml = await sres.text();
                            const sdoc = parser.parseFromString(shtml, 'text/html');
                            const stageData = parseDocumentForBosses(sdoc, "Stage " + (sIdx+1));
                            if(stageData.bosses.length > 0) allStagesData.push(stageData);
                            await new Promise(r => setTimeout(r, 600));
                        }

                        if(allStagesData.length > 0) {
                            allEventDatas.push({ eventType: subEventType, series: [{ seriesName: seriesName, stages: allStagesData }] });
                        }
                    } catch (e) { console.error('Fetch err', e); }
                }
                
                progress.textContent = '完了!! クリップボードにコピー中...';
                const exportObj = { source: 'dokkan-extension', version: '2.0', multiple: true, eventList: allEventDatas };
                copyToClipboard(exportObj, 'category_list', btn);
            });
        }
    }

    async function copyToClipboard(exportData, type, btnElement) {
        if(type === 'stage') {
            const formatted = {
                source: 'dokkan-extension', version: '2.0', multiple: true,
                eventList: [{ eventType: '不明', series: [{ seriesName: '-', stages: [exportData] }] }]
            };
            exportData = formatted;
        }

        try {
            await navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
            if (btnElement) {
                btnElement.textContent = '✅ コピー完了！';
                btnElement.classList.add('copied');
                setTimeout(() => {
                    btnElement.textContent = type === 'stage' ? '📋 計算ツール用にコピー' : (type === 'category_list' ? '🔄 全イベントを一括取得' : '🔄 全ステージを一括取得＆コピー');
                    btnElement.classList.remove('copied');
                    btnElement.disabled = false;
                }, 3000);
            }
        } catch (err) {
            alert('コピー失敗');
        }
    }

    function init() {
        injectStyles();
        let isStageDetail = false;
        let isEventList = false;
        let isCategoryList = false;

        const stageMatch = window.location.pathname.match(/\/events\/(?:challenge|super|growth|story)\/\d+\/\d+/i);
        const eventMatch = window.location.pathname.match(/\/events\/(?:challenge|super|growth|story)\/\d+/i);
        const catMatch = window.location.pathname.match(/\/events\/(?:challenge|super|growth|story)\/?$/i);

        if (stageMatch && !window.location.pathname.endsWith('/')) isStageDetail = true;
        else if (eventMatch && !stageMatch) isEventList = true;
        else if (catMatch) isCategoryList = true;

        if (isStageDetail) {
            setTimeout(() => { createUI('stage', parseDocumentForBosses(document, document.title)); }, 1000);
        } else if (isEventList) {
            const links = document.querySelectorAll('a');
            const stageLinks = new Set();
            for(let a of links) {
                if(a.href.match(/\/events\/[a-z]+\/\d+\/\d+(?:[?#]|$)/i)) stageLinks.add(a.href);
            }
            createUI('event_list', { stageLinks: Array.from(stageLinks) });
        } else if (isCategoryList) {
            const ObjectLinks = document.querySelectorAll('a');
            const eventLinks = new Set();
            for (let a of ObjectLinks) {
                if (a.href.match(/\/events\/[a-z]+\/\d+(?:[?#]|$)/i) && !a.href.match(/\/events\/[a-z]+\/\d+\/\d+/i)) {
                    eventLinks.add(a.href);
                }
            }
            createUI('category_list', { eventLinks: Array.from(eventLinks), title: document.title });
        }
    }

    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();
