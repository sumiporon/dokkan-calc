/**
 * DokkanInfo 全チャレンジイベント スクレイパー
 * 
 * Phase 1: イベント一覧ページから全イベントURLを取得
 * Phase 2: 各イベントページからタイトル・ステージURLを取得
 * Phase 3: 各ステージページからボスデータを取得
 * 
 * 出力: all_enemies.json (4階層形式)
 */

const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'https://jpnja.dokkaninfo.com';
const CHALLENGE_URL = `${BASE_URL}/events/challenge`;
const TYPE_MAP = ['agl', 'teq', 'int', 'str', 'phy'];

// レート制限を考慮した待機
const delay = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * イベントタイトルからeventTypeとseriesNameを分類
 */
function classifyEvent(title) {
    // レッドゾーン
    const rzMatch = title.match(/究極のレッドゾーン\s*(.+)/);
    if (rzMatch) {
        return { eventType: 'レッドゾーン', seriesName: rzMatch[1].trim() };
    }

    // バトルスペクタクル  
    const bsMatch = title.match(/至上のバトルスペクタクル\s*(.+)/);
    if (bsMatch) {
        return { eventType: 'バトルスペクタクル', seriesName: bsMatch[1].trim() };
    }

    // その他は独立イベント
    return { eventType: title, seriesName: '-' };
}

/**
 * Phase 1: チャレンジイベント一覧ページから全イベントURLを取得
 */
async function getEventList(page) {
    console.log('=== Phase 1: イベント一覧取得 ===');
    await page.goto(CHALLENGE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await delay(5000); // 動的コンテンツ読み込み待ち

    const eventUrls = await page.evaluate((baseUrl) => {
        const links = document.querySelectorAll('a[href*="/events/challenge/"]');
        const urls = new Set();
        for (const a of links) {
            const href = a.href;
            // /events/challenge/{id} の形式のみ（ステージURLは除外）
            const match = href.match(/\/events\/challenge\/(\d+)$/);
            if (match) {
                urls.add(href);
            }
        }
        return Array.from(urls);
    }, BASE_URL);

    console.log(`Found ${eventUrls.length} events`);
    return eventUrls;
}

/**
 * Phase 2: 個別イベントページからタイトルとステージURLを取得
 */
async function getEventDetails(page, eventUrl) {
    try {
        await page.goto(eventUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await delay(3000);

        const details = await page.evaluate(() => {
            const title = document.title ? document.title.split('|')[0].trim() : '';

            // ステージリンクを取得
            const stageLinks = document.querySelectorAll('a[href*="/events/challenge/"]');
            const stageUrls = new Set();
            for (const a of stageLinks) {
                const href = a.href;
                // /events/challenge/{id}/{stageId} の形式のみ
                const match = href.match(/\/events\/challenge\/\d+\/\d+$/);
                if (match) {
                    stageUrls.add(href);
                }
            }

            return {
                title,
                stageUrls: Array.from(stageUrls)
            };
        });

        console.log(`  Event: ${details.title} (${details.stageUrls.length} stages)`);
        return details;
    } catch (err) {
        console.error(`  Error getting event details for ${eventUrl}: ${err.message}`);
        return { title: '', stageUrls: [] };
    }
}

/**
 * Phase 3: ステージページからボスデータを取得
 */
async function getBossData(page, stageUrl) {
    try {
        await page.goto(stageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // アイコンまたはテーブルの読み込みを待機
        try {
            await page.waitForSelector('img[src*="cha_type_icon"]', { state: 'attached', timeout: 10000 });
            await delay(2000);
        } catch {
            try {
                await page.waitForSelector('table', { state: 'visible', timeout: 5000 });
                await delay(2000);
            } catch {
                await delay(3000);
            }
        }

        const rawData = await page.evaluate(() => {
            const result = {
                stageName: '',
                enemies: []
            };

            // ステージ名をタイトルから取得
            const title = document.title || '';
            result.stageName = title.split('|')[0].trim();

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

                const turnMatch = text.match(/ターン経過ごとにATK(\d+)%UP\(最大(\d+)%\)/);
                const turnAtkUp = turnMatch ? parseInt(turnMatch[1], 10) : 0;
                const turnAtkMax = turnMatch ? parseInt(turnMatch[2], 10) : 0;

                const hitMatch = text.match(/(?:攻撃されるたびに|攻撃を受けるたび)ATK(\d+)%UP\(最大(\d+)%\)/);
                const hitAtkUp = hitMatch ? parseInt(hitMatch[1], 10) : 0;
                const hitAtkMax = hitMatch ? parseInt(hitMatch[2], 10) : 0;

                const hpMatch = text.match(/HP(\d+)%以下でATK(\d+)%UP/);
                const hpAtkThreshold = hpMatch ? parseInt(hpMatch[1], 10) : 0;
                const hpAtkUp = hpMatch ? parseInt(hpMatch[2], 10) : 0;

                // 複数の「登場からXターン目にATK Y%UP」を全て取得
                const appearEntries = [];
                const appearRegex = /登場から(\d+)ターン目にATK(\d+)%UP/g;
                let appearMatch;
                while ((appearMatch = appearRegex.exec(text)) !== null) {
                    appearEntries.push({
                        turn: parseInt(appearMatch[1], 10),
                        atkUp: parseInt(appearMatch[2], 10)
                    });
                }

                result.enemies.push({
                    name: enemyName || result.stageName,
                    class: cls,
                    type,
                    atk,
                    saDamage,
                    aoeDamage,
                    saBuffModifier,
                    turnAtkUp, turnAtkMax,
                    hitAtkUp, hitAtkMax,
                    hpAtkThreshold, hpAtkUp,
                    appearEntries
                });
            };

            // 属性アイコンを起点にして、敵ごとのコンテナを探す
            const imgs = Array.from(document.querySelectorAll('img[src*="cha_type_icon"]'));
            const enemyContainers = new Set();

            for (const img of imgs) {
                let parent = img.parentElement;
                let foundRow = null;
                while (parent && parent.tagName !== 'BODY') {
                    if (parent.classList.contains('row') && parent.classList.contains('align-items-center')) {
                        foundRow = parent;
                        break;
                    }
                    parent = parent.parentElement;
                }
                if (!foundRow) {
                    parent = img.parentElement;
                    while (parent && parent.tagName !== 'BODY') {
                        if (parent.tagName === 'TR' || parent.classList.contains('card')) {
                            foundRow = parent;
                            break;
                        }
                        parent = parent.parentElement;
                    }
                }

                if (foundRow) {
                    enemyContainers.add(foundRow);
                }
            }

            if (enemyContainers.size > 0) {
                for (const row of enemyContainers) {
                    const rowText = row.innerText;

                    let cls = 'extreme', type = 'teq';
                    const img = row.querySelector('img[src*="cha_type_icon"]');
                    if (img) {
                        const match = (img.src || '').match(/cha_type_icon_(\d+)/);
                        if (match) {
                            const id = parseInt(match[1], 10);
                            const typeId = id % 10;
                            const classId = Math.floor(id / 10);
                            const typeMap = ['agl', 'teq', 'int', 'str', 'phy'];
                            if (classId === 1) cls = 'super';
                            else if (classId === 2) cls = 'extreme';
                            if (typeMap[typeId]) type = typeMap[typeId];
                        }
                    }

                    let enemyName = '';
                    const nameEl = row.querySelector('.font-size-1_2 b');
                    if (nameEl) {
                        enemyName = nameEl.innerText.trim();
                    } else {
                        const bTags = row.querySelectorAll('b');
                        if (bTags.length > 0) enemyName = bTags[0].innerText.trim();
                    }

                    parseStats(rowText, cls, type, enemyName);
                }
            } else {
                let cls = 'extreme', type = 'teq';
                if (imgs.length > 0) {
                    const match = (imgs[0].src || '').match(/cha_type_icon_(\d+)/);
                    if (match) {
                        const id = parseInt(match[1], 10);
                        const typeId = id % 10;
                        const classId = Math.floor(id / 10);
                        const typeMap = ['agl', 'teq', 'int', 'str', 'phy'];
                        if (classId === 1) cls = 'super';
                        else if (classId === 2) cls = 'extreme';
                        if (typeMap[typeId]) type = typeMap[typeId];
                    }
                }
                let enemyName = '';
                const h2 = document.querySelector('.title_h2, h2, h3');
                if (h2) enemyName = h2.textContent.trim();

                parseStats(document.body.innerText, cls, type, enemyName);
            }

            return result;
        });

        // 攻撃パターンを計算
        const bosses = rawData.enemies.map(enemy => {
            const attacks = [];
            if (enemy.atk > 0) {
                const baseAtk = enemy.atk;
                const saDamage = enemy.saDamage || baseAtk * 3;
                const baseSaMulti = saDamage / baseAtk;
                const saBuffMod = enemy.saBuffModifier || 0;
                const trueSaMulti = baseSaMulti + saBuffMod;
                const postSaNormalMulti = 1.0 + saBuffMod;

                attacks.push({ name: '通常', value: baseAtk });
                if (saBuffMod > 0) attacks.push({ name: '通常(必殺後)', value: Math.floor(baseAtk * postSaNormalMulti) });
                attacks.push({ name: '必殺', value: Math.floor(baseAtk * trueSaMulti) });
                if (enemy.aoeDamage) attacks.push({ name: '全体攻撃', value: enemy.aoeDamage });

                // ターン経過：各ターンごとに表示
                if (enemy.turnAtkUp > 0 && enemy.turnAtkMax > 0) {
                    const step = enemy.turnAtkUp;
                    const totalSteps = Math.floor(enemy.turnAtkMax / step);
                    for (let i = 1; i <= totalSteps; i++) {
                        const pct = step * i;
                        const multi = 1 + (pct / 100);
                        const turnAtk = Math.floor(baseAtk * multi);
                        attacks.push({ name: `(${i}ターン目 ATK${pct}%UP) 通常`, value: turnAtk });
                        if (saBuffMod > 0) attacks.push({ name: `(${i}ターン目 ATK${pct}%UP) 通常(必殺後)`, value: Math.floor(turnAtk * postSaNormalMulti) });
                        attacks.push({ name: `(${i}ターン目 ATK${pct}%UP) 必殺`, value: Math.floor(turnAtk * trueSaMulti) });
                    }
                }

                // 被弾：各回数ごとに表示
                if (enemy.hitAtkUp > 0 && enemy.hitAtkMax > 0) {
                    const step = enemy.hitAtkUp;
                    const totalSteps = Math.floor(enemy.hitAtkMax / step);
                    for (let i = 1; i <= totalSteps; i++) {
                        const pct = step * i;
                        const multi = 1 + (pct / 100);
                        const hitAtk = Math.floor(baseAtk * multi);
                        attacks.push({ name: `(被弾${i}回 ATK${pct}%UP) 通常`, value: hitAtk });
                        if (saBuffMod > 0) attacks.push({ name: `(被弾${i}回 ATK${pct}%UP) 通常(必殺後)`, value: Math.floor(hitAtk * postSaNormalMulti) });
                        attacks.push({ name: `(被弾${i}回 ATK${pct}%UP) 必殺`, value: Math.floor(hitAtk * trueSaMulti) });
                    }
                }

                // HP条件
                if (enemy.hpAtkUp > 0) {
                    const multi = 1 + (enemy.hpAtkUp / 100);
                    const hpAtk = Math.floor(baseAtk * multi);
                    attacks.push({ name: `(HP${enemy.hpAtkThreshold}%以下) 通常`, value: hpAtk });
                    if (saBuffMod > 0) attacks.push({ name: `(HP${enemy.hpAtkThreshold}%以下) 通常(必殺後)`, value: Math.floor(hpAtk * postSaNormalMulti) });
                    attacks.push({ name: `(HP${enemy.hpAtkThreshold}%以下) 必殺`, value: Math.floor(hpAtk * trueSaMulti) });
                }

                // 登場ターン（複数エントリ対応）
                if (enemy.appearEntries && enemy.appearEntries.length > 0) {
                    for (const entry of enemy.appearEntries) {
                        const multi = 1 + (entry.atkUp / 100);
                        const aAtk = Math.floor(baseAtk * multi);
                        attacks.push({ name: `(${entry.turn}ターン目 ATK${entry.atkUp}%UP) 通常`, value: aAtk });
                        if (saBuffMod > 0) attacks.push({ name: `(${entry.turn}ターン目 ATK${entry.atkUp}%UP) 通常(必殺後)`, value: Math.floor(aAtk * postSaNormalMulti) });
                        attacks.push({ name: `(${entry.turn}ターン目 ATK${entry.atkUp}%UP) 必殺`, value: Math.floor(aAtk * trueSaMulti) });
                    }
                }
            }

            return {
                name: enemy.name,
                class: enemy.class,
                type: enemy.type,
                attacks,
                critAtkUp: 0,
                critDefDown: 0,
                isCriticalDefault: false
            };
        }).filter(b => b.attacks.length > 0);

        return {
            stageName: rawData.stageName,
            bosses
        };

    } catch (err) {
        console.error(`    Error scraping stage ${stageUrl}: ${err.message}`);
        return { stageName: 'Unknown', bosses: [] };
    }
}

/**
 * メイン処理
 */
async function main() {
    console.log('DokkanInfo 全チャレンジイベント スクレイパー 開始');
    console.log('================================================\n');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    try {
        // Phase 1: イベント一覧
        const eventUrls = await getEventList(page);

        // Phase 2 & 3: 各イベントのステージとボス取得
        const allData = []; // 最終的な4階層データ
        const eventMap = new Map(); // eventType -> { series: Map<seriesName, stages[]> }

        let eventCount = 0;
        for (const eventUrl of eventUrls) {
            eventCount++;
            console.log(`\n[${eventCount}/${eventUrls.length}] Processing: ${eventUrl}`);

            const details = await getEventDetails(page, eventUrl);
            if (!details.title || details.stageUrls.length === 0) {
                console.log('  Skipped (no title or stages)');
                continue;
            }

            const { eventType, seriesName } = classifyEvent(details.title);
            console.log(`  Classified: ${eventType} / ${seriesName}`);

            const stages = [];
            let stageCount = 0;
            for (const stageUrl of details.stageUrls) {
                stageCount++;
                console.log(`    Stage [${stageCount}/${details.stageUrls.length}]: ${stageUrl}`);

                const stageData = await getBossData(page, stageUrl);
                if (stageData.bosses.length > 0) {
                    stages.push(stageData);
                    console.log(`      Found: ${stageData.stageName} - ${stageData.bosses.map(b => b.name).join(', ')}`);
                } else {
                    console.log(`      No boss data found`);
                }

                await delay(1000); // レート制限
            }

            if (stages.length > 0) {
                // eventMapに蓄積
                if (!eventMap.has(eventType)) {
                    eventMap.set(eventType, new Map());
                }
                const seriesMap = eventMap.get(eventType);
                if (!seriesMap.has(seriesName)) {
                    seriesMap.set(seriesName, []);
                }
                seriesMap.get(seriesName).push(...stages);
            }

            await delay(1500); // レート制限

            // 進捗を途中保存
            if (eventCount % 5 === 0) {
                const interim = buildOutput(eventMap);
                fs.writeFileSync('all_enemies_progress.json', JSON.stringify(interim, null, 2), 'utf-8');
                console.log(`  [Progress saved: ${eventCount}/${eventUrls.length} events]`);
            }
        }

        // 最終出力
        const output = buildOutput(eventMap);
        fs.writeFileSync('all_enemies.json', JSON.stringify(output, null, 2), 'utf-8');
        console.log(`\n================================================`);
        console.log(`完了! ${output.length} イベント種別を all_enemies.json に保存しました。`);

        // 統計
        let totalSeries = 0, totalStages = 0, totalBosses = 0;
        for (const et of output) {
            totalSeries += et.series.length;
            for (const ser of et.series) {
                totalStages += ser.stages.length;
                for (const stg of ser.stages) {
                    totalBosses += stg.bosses.length;
                }
            }
        }
        console.log(`統計: ${output.length}種別, ${totalSeries}シリーズ, ${totalStages}ステージ, ${totalBosses}ボス`);

    } catch (err) {
        console.error('Fatal error:', err);
    } finally {
        await browser.close();
    }
}

/**
 * eventMapから4階層出力に変換
 */

function applyCustomCritOverrides(output) {
    output.forEach(et => {
        if (et.eventType === 'レッドゾーン') {
            et.series.forEach(se => {
                if (se.seriesName === '人工生命体編') {
                    se.stages.forEach(st => {
                        if (st.stageName === 'VSセルマックス') {
                            st.bosses.forEach(b => {
                                if (b.name === 'セルマックス') {
                                    b.critAtkUp = 30;
                                    b.critDefDown = 70;
                                }
                            });
                        }
                    });
                }
                if (se.seriesName === '純粋サイヤ人編') {
                    se.stages.forEach(st => {
                        if (st.stageName === 'VS キャベ') {
                            st.bosses.forEach(b => {
                                if (b.name === '超サイヤ人2キャベ') {
                                    b.critAtkUp = 100;
                                    b.critDefDown = 50;
                                }
                            });
                        }
                    });
                }
            });
        }
        
        if (et.eventType === 'バトルスペクタクル') {
            et.series.forEach(se => {
                if (se.seriesName === '次世代のサイヤ人編') {
                    se.stages.forEach(st => {
                        if (st.stageName === 'VS孫悟飯&孫悟天&トランクス2') {
                            st.bosses.forEach(b => {
                                if (b.name.includes('悟飯')) {
                                    b.critAtkUp = 50;
                                    b.critDefDown = 70;
                                }
                            });
                        }
                    });
                }
            });
        }
    });
}


function buildOutput(eventMap) {
    let output = [];
    for (const [eventType, seriesMap] of eventMap) {
        const series = [];
        for (const [seriesName, stages] of seriesMap) {
            series.push({ seriesName, stages });
        }
        output.push({ eventType, series });
    }

    // Deduplicate stages to keep only highest difficulty (last occurrence of each stage name)
    output.forEach(et => {
        et.series.forEach(se => {
            const nameToLastStage = {};
            se.stages.forEach(st => {
                nameToLastStage[st.stageName] = st;
            });
            const uniqueNames = [...new Set(se.stages.map(st => st.stageName))];
            se.stages = uniqueNames.map(name => nameToLastStage[name]);
        });
    });

    let redZone = output.find(d => d.eventType === 'レッドゾーン');
    let battleSpec = output.find(d => d.eventType === 'バトルスペクタクル');

    if (!redZone) { redZone = { eventType: 'レッドゾーン', series: [] }; output.push(redZone); }
    if (!battleSpec) { battleSpec = { eventType: 'バトルスペクタクル', series: [] }; output.push(battleSpec); }

    // Simply drop the old category names, not merge them (they are already included in レッドゾーン / バトルスペクタクル via scraping)
    let rest = output.filter(d =>
        d.eventType !== 'レッドゾーン' &&
        d.eventType !== 'バトルスペクタクル' &&
        d.eventType !== '究極のレッドゾーン' &&
        d.eventType !== '至上のバトルスペクタクル'
    );

    // Reverse the rest as requested by the user
    rest.reverse();

    const finalOut = [redZone, battleSpec, ...rest];
    applyCustomCritOverrides(finalOut);
    return finalOut;
}

main().catch(console.error);
