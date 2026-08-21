const fs = require('fs');

function patchFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    let js = fs.readFileSync(filePath, 'utf-8');

    const replacement = `
        let isStageDetail = false;
        let isEventList = false;
        let isCategoryList = false;

        const stageMatch = window.location.pathname.match(/\\/events\\/(?:challenge|super|growth|story)\\/\\d+\\/\\d+/i);
        const eventMatch = window.location.pathname.match(/\\/events\\/(?:challenge|super|growth|story)\\/\\d+$/i);
        const catMatch = window.location.pathname.match(/\\/events\\/(?:challenge|super|growth|story)$/i);

        if (stageMatch) {
            isStageDetail = true;
        } else if (eventMatch) {
            isEventList = true;
        } else if (catMatch) {
            isCategoryList = true;
        } else {
`;
    js = js.replace(/        let isStageDetail = false;[\s\S]*?        \} else \{/, replacement);

    const replacement2 = `
        } else if (isEventList) {
            console.log('[Dokkan Parser] イベント一覧ページを検出');
            const links = document.querySelectorAll('a[href*="/events/"]');
            const stageLinks = new Set();
            for(let a of links) {
                if(a.href.match(/\\/events\\/[a-z]+\\/\\d+\\/\\d+$/i)) {
                    stageLinks.add(a.href);
                }
            }
            if(stageLinks.size > 0) {
                createUI('event_list', { stageLinks: Array.from(stageLinks) });
            }
        } else if (isCategoryList) {
            console.log('[Dokkan Parser] カテゴリ一覧ページを検出');
            const links = document.querySelectorAll('a[href*="/events/"]');
            const eventLinks = new Set();
            for(let a of links) {
                if(a.href.match(/\\/events\\/[a-z]+\\/\\d+$/i)) {
                    eventLinks.add(a.href);
                }
            }
            if(eventLinks.size > 0) {
                createUI('category_list', { eventLinks: Array.from(eventLinks), title: document.title });
            }
        }
    }
`;
    js = js.replace(/        \} else if \(isEventList\) \{[\s\S]*?    \}/, replacement2);

    const uiReplacement = `
        } else if (mode === 'category_list') {
            const catTitle = data.title.split('|')[0].trim();
            container.innerHTML = \`
                <div id="dokkan-parser-panel">
                    <h3>挑戦カテゴリ一括データ検出</h3>
                    <div class="dokkan-parser-info">
                        <div class="dokkan-parser-row">
                            <span class="dokkan-parser-label">カテゴリ:</span>
                            <span class="dokkan-parser-value" style="font-size: 11px;">\${catTitle}</span>
                        </div>
                        <div class="dokkan-parser-row">
                            <span class="dokkan-parser-label">対象イベント数:</span>
                            <span class="dokkan-parser-value">\${data.eventLinks.length}</span>
                        </div>
                    </div>
                    <div id="dokkan-progress" style="color: #ffb347; margin-bottom: 5px; text-align:center; font-size: 12px; font-weight: bold;">⚠️ 完了まで数分かかります</div>
                    <button class="dokkan-copy-btn" id="btn-fetch-category">🔄 全イベントを一括取得＆コピー</button>
                </div>
            \`;
            document.body.appendChild(container);

            document.getElementById('btn-fetch-category').addEventListener('click', async () => {
                const btn = document.getElementById('btn-fetch-category');
                btn.disabled = true;
                const progress = document.getElementById('dokkan-progress');
                progress.style.color = '#7cff7c';
                
                const allEventDatas = [];
                for (let eIdx = 0; eIdx < data.eventLinks.length; eIdx++) {
                    const eventLink = data.eventLinks[eIdx];
                    progress.textContent = \`[イベント \${eIdx+1}/\${data.eventLinks.length}] を解析中...\`;
                    
                    try {
                        const res = await fetch(eventLink);
                        const html = await res.text();
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(html, 'text/html');
                        
                        const links = doc.querySelectorAll('a[href*="/events/"]');
                        const stageLinks = new Set();
                        for(let a of links) {
                            if(a.href.match(/\\/events\\/[a-z]+\\/\\d+\\/\\d+$/i)) {
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
                            progress.textContent = \`[イベント \${eIdx+1}/\${data.eventLinks.length}] ステージ (\${sIdx+1}/\${stageLinksArr.length}) を取得中...\`;
                            const sres = await fetch(stageLinksArr[sIdx]);
                            const shtml = await sres.text();
                            const sdoc = parser.parseFromString(shtml, 'text/html');
                            const stageData = parseDocumentForBosses(sdoc, "Stage " + (sIdx+1));
                            if(stageData.bosses.length > 0) {
                                allStagesData.push(stageData);
                            }
                            await new Promise(r => setTimeout(r, 600));
                        }

                        if(allStagesData.length > 0) {
                            allEventDatas.push({
                                eventType: subEventType,
                                series: [{
                                    seriesName: seriesName,
                                    stages: allStagesData
                                }]
                            });
                        }
                    } catch (e) {
                         console.error('Fetch error: ' + eventLink, e);
                    }
                }
                
                progress.textContent = '全取得完了！！クリップボードにコピーしています...';
                
                const exportObj = {
                    source: 'dokkan-extension',
                    version: '2.0',
                    multiple: true,
                    eventList: allEventDatas
                };

                copyToClipboard(exportObj, 'category', btn);
            });
        }
    }`;
    js = js.replace(/        \} else if \(mode === 'event_list'\) \{/, uiReplacement + '\n        } else if (mode === \'event_list\') {');

    // Make copyToClipboard support 'category' mode to switch text back
    js = js.replace(/btnElement\.textContent = type === 'stage' \? '📋 計算ツール用にコピー' : '🔄 全ステージを一括取得＆コピー';/, "btnElement.textContent = type === 'stage' ? '📋 計算ツール用にコピー' : (type === 'category' ? '🔄 全イベントを一括取得＆コピー' : '🔄 全ステージを一括取得＆コピー');");

    fs.writeFileSync(filePath, js, 'utf-8');
}

patchFile('c:/Users/kou20/Downloads/dokkan-calc-main/chrome_extension/content.js');
patchFile('C:/Users/kou20/OneDrive - 甲南大学/デスクトップ/ドッカン計算/chrome_extension/content.js');
console.log('patched');
