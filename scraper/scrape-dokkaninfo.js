/**
 * DokkanInfo Enemy Data Scraper
 * 
 * Playwrightを使用してDokkanInfoから敵データを取得
 * GitHub Actions対応
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// 属性マッピング (cha_type_icon_XX)
// 10-14 = Super, 20-24 = Extreme
// 末尾: 0=AGL, 1=TEQ, 2=INT, 3=STR, 4=PHY
const TYPE_MAP = ['agl', 'teq', 'int', 'str', 'phy'];

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

async function scrapeUrl(page, url) {
    console.log(`Scraping: ${url}`);

    try {
        let eventStageName = null;

        // URLから親イベントのURLを推測して先にステージ名を取得する (例: challenge/1733/17330035 -> challenge/1733)
        const matchEvent = url.match(/(.*\/events\/[^\/]+\/\d+)\//);
        if (matchEvent) {
            const parentUrl = matchEvent[1];
            console.log(`Extracting Stage Name from parent URL: ${parentUrl}`);
            try {
                await page.goto(parentUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForTimeout(2000); // タイトル描画待機
                const parentTitle = await page.evaluate(() => document.title || '');
                if (parentTitle) {
                    eventStageName = parentTitle.split('|')[0].trim();
                    console.log(`Found Stage Name: ${eventStageName}`);
                }
            } catch (err) {
                console.log(`Could not fetch parent URL for stage name.`);
            }
        }

        // domcontentloaded で待機（networkidle だと広告等で永遠に待つ）
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // 動的コンテンツ(Vue/Reactなど)が読み込まれるまで待機
        console.log('Waiting for elements to render...');
        try {
            // 画像(アイコン)がロードされるのを最大15秒待機
            await page.waitForSelector('img[src*="cha_type_icon"]', { state: 'attached', timeout: 15000 });
            // メインコンテンツのテーブルなどが表示されるのを最大5秒追加待機
            await page.waitForTimeout(2000); // 描画ラグを考慮
        } catch (e) {
            console.log('Timeout waiting for icons. Trying to wait for any table...');
            try {
                await page.waitForSelector('table', { state: 'visible', timeout: 10000 });
                await page.waitForTimeout(2000);
            } catch (e2) {
                console.log('Timeout waiting for table. Proceeding with current DOM state.');
            }
        }
        console.log('Extracting data...');

        const enemyData = await page.evaluate((passedStageName) => {
            const data = {
                stage: passedStageName,
                name: null,
                class: null,
                type: null,
                atk: null,
                saDamage: null,
                aoeDamage: null,
                turnAtkUp: null,
                turnAtkMax: null,
                hitAtkUp: null,
                hitAtkMax: null,
                hpAtkUp: null,
                hpAtkThreshold: null,
                attacks: []
            };

            // 0. ステージ/イベント名を取得 (ページタイトルから推測。親URLで取れなかった場合の予備)
            if (!data.stage) {
                const title = document.title || '';
                if (title) {
                    data.stage = title.split('|')[0].trim();
                }
            }

            // 1. cha_type_icon_XX を検索
            const imgs = document.querySelectorAll('img');
            for (const img of imgs) {
                const src = img.src || '';
                const match = src.match(/cha_type_icon_(\d+)/);
                if (match) {
                    const id = parseInt(match[1], 10);
                    const typeId = id % 10;
                    const classId = Math.floor(id / 10);

                    const typeMap = ['agl', 'teq', 'int', 'str', 'phy'];

                    if (classId === 1) data.class = 'super';
                    else if (classId === 2) data.class = 'extreme';

                    data.type = typeMap[typeId];
                    break;
                }
            }

            // 2. ページ内のテキストから情報を抽出
            const bodyText = document.body.innerText;

            // ATK
            const atkMatch = bodyText.match(/ATK[:\s]*([0-9,]+)/i);
            if (atkMatch) {
                data.atk = parseInt(atkMatch[1].replace(/,/g, ''), 10);
            }

            // 必殺技ダメージ
            const saMatch = bodyText.match(/ダメージ[:\s]*([0-9,]+)/);
            if (saMatch) {
                data.saDamage = parseInt(saMatch[1].replace(/,/g, ''), 10);
            }

            // 全体攻撃(AoE)ダメージ
            const aoeMatch = bodyText.match(/エリアダメージ[^\n]*?:\s*([0-9,]{4,})/);
            if (aoeMatch) {
                data.aoeDamage = parseInt(aoeMatch[1].replace(/,/g, ''), 10);
            }

            // 必殺技効果(ATK上昇バフ)の取得
            // 敵の必殺技倍率に加算されるバフ（例：ATKが上昇 = +0.3）
            data.saBuffModifier = 0.0;
            // 優先度高: 大幅上昇 (+0.5) > 上昇 (+0.3) > ATKとDEF上昇 (+0.2)
            if (bodyText.match(/ATKが大幅に上昇/)) {
                data.saBuffModifier = 0.5;
            } else if (bodyText.match(/ATKが上昇/)) {
                data.saBuffModifier = 0.3;
            } else if (bodyText.match(/ATKとDEFが上昇/)) {
                data.saBuffModifier = 0.2;
            }

            // パッシブ: ターン経過アップ
            const turnAtkMatch = bodyText.match(/ターン経過ごとにATK(\d+)%UP\(最大(\d+)%\)/);
            if (turnAtkMatch) {
                data.turnAtkUp = parseInt(turnAtkMatch[1], 10);
                data.turnAtkMax = parseInt(turnAtkMatch[2], 10);
            }

            // パッシブ: 被弾アップ
            const hitAtkMatch = bodyText.match(/(?:攻撃されるたびに|攻撃を受けるたび)ATK(\d+)%UP\(最大(\d+)%\)/);
            if (hitAtkMatch) {
                data.hitAtkUp = parseInt(hitAtkMatch[1], 10);
                data.hitAtkMax = parseInt(hitAtkMatch[2], 10);
            }

            // パッシブ: HP条件アップ
            const hpAtkMatch = bodyText.match(/HP(\d+)%以下でATK(\d+)%UP/);
            if (hpAtkMatch) {
                data.hpAtkThreshold = parseInt(hpAtkMatch[1], 10);
                data.hpAtkUp = parseInt(hpAtkMatch[2], 10);
            }

            // 3. 敵の名前を取得（アイコン要素の親から探索する確実な方法）
            try {
                // cha_type_iconを持つ画像を再度探す
                const iconImg = Array.from(document.querySelectorAll('img')).find(img => img.src && img.src.includes('cha_type_icon'));

                if (iconImg) {
                    // アイコンの親要素（最大5階層上まで）のテキストを取得してみる
                    let parent = iconImg.parentElement;
                    let level = 1;
                    let foundText = '';

                    while (parent && level <= 5) {
                        const text = parent.innerText ? parent.innerText.trim() : '';

                        // テキストが十分な長さ（数字だけでなく名前っぽいやつ）なら保存
                        if (text && text.length > 2 && text.length < 50 && !text.includes('HP')) {
                            foundText = text;
                        }

                        parent = parent.parentElement;
                        level++;
                    }

                    if (foundText) {
                        // 改行が含まれる場合は、最初の行を名前にする
                        data.name = foundText.split('\\n')[0].trim();
                    }
                }
            } catch (err) {
                console.error('Error during name extraction:', err.message);
            }

            return data;
        }, eventStageName);

        // ATKと必殺技があれば攻撃パターンを段階的に追加
        if (enemyData.atk) {
            const baseAtk = enemyData.atk;
            const saDamage = enemyData.saDamage || baseAtk * 3;
            // ドッカンバトルの敵の必殺倍率 = 必殺ダメージ / 通常ATK
            const baseSaMulti = saDamage / baseAtk;
            const saBuffMod = enemyData.saBuffModifier || 0.0;
            const trueSaMulti = baseSaMulti + saBuffMod; // バフは必殺技倍率に直接加算される（例: 3.0 + 0.3 = 3.3）
            const postSaNormalMulti = 1.0 + saBuffMod; // 必殺後の通常攻撃は別枠乗算計算

            // 基準値の追加
            enemyData.attacks.push({ name: '通常', value: baseAtk });
            if (saBuffMod > 0.0) enemyData.attacks.push({ name: '通常 (必殺後)', value: Math.floor(baseAtk * postSaNormalMulti) });
            enemyData.attacks.push({ name: '必殺', value: Math.floor(baseAtk * trueSaMulti) });
            if (enemyData.aoeDamage) enemyData.attacks.push({ name: '全体攻撃', value: enemyData.aoeDamage });

            // ターン経過アップがある場合
            if (enemyData.turnAtkUp) {
                const maxSteps = Math.floor(enemyData.turnAtkMax / enemyData.turnAtkUp);
                for (let t = 1; t <= maxSteps; t++) {
                    const upRate = enemyData.turnAtkUp * t;
                    const multi = 1 + (upRate / 100);
                    const tAtk = Math.floor(baseAtk * multi); // このターンの基本ATK

                    enemyData.attacks.push({ name: `通常 (${t}ターン目)`, value: tAtk });
                    if (saBuffMod > 0.0) enemyData.attacks.push({ name: `通常 (${t}ターン目・必殺後)`, value: Math.floor(tAtk * postSaNormalMulti) });
                    enemyData.attacks.push({ name: `必殺 (${t}ターン目)`, value: Math.floor(tAtk * trueSaMulti) });
                    if (enemyData.aoeDamage) enemyData.attacks.push({ name: `全体攻撃 (${t}ターン目)`, value: Math.floor(enemyData.aoeDamage * multi) });
                }
            }

            // 被弾アップがある場合
            if (enemyData.hitAtkUp) {
                const multi = 1 + (enemyData.hitAtkMax / 100);
                const hAtk = Math.floor(baseAtk * multi);

                enemyData.attacks.push({ name: `通常 (最大被弾時)`, value: hAtk });
                if (saBuffMod > 0.0) enemyData.attacks.push({ name: `通常 (最大被弾時・必殺後)`, value: Math.floor(hAtk * postSaNormalMulti) });
                enemyData.attacks.push({ name: `必殺 (最大被弾時)`, value: Math.floor(hAtk * trueSaMulti) });
                if (enemyData.aoeDamage) enemyData.attacks.push({ name: `全体攻撃 (最大被弾時)`, value: Math.floor(enemyData.aoeDamage * multi) });
            }

            // HP条件アップがある場合
            if (enemyData.hpAtkUp) {
                const multi = 1 + (enemyData.hpAtkUp / 100);
                const hpAtk = Math.floor(baseAtk * multi);

                enemyData.attacks.push({ name: `通常 (HP${enemyData.hpAtkThreshold}%以下)`, value: hpAtk });
                if (saBuffMod > 0.0) enemyData.attacks.push({ name: `通常 (HP${enemyData.hpAtkThreshold}%以下・必殺後)`, value: Math.floor(hpAtk * postSaNormalMulti) });
                enemyData.attacks.push({ name: `必殺 (HP${enemyData.hpAtkThreshold}%以下)`, value: Math.floor(hpAtk * trueSaMulti) });
                if (enemyData.aoeDamage) enemyData.attacks.push({ name: `全体攻撃 (HP${enemyData.hpAtkThreshold}%以下)`, value: Math.floor(enemyData.aoeDamage * multi) });
            }
        }

        return {
            url,
            ...enemyData,
            success: !!(enemyData.class && enemyData.type)
        };

    } catch (error) {
        console.error(`Error scraping ${url}:`, error.message);
        return {
            url,
            success: false,
            error: error.message
        };
    }
}

async function main() {
    // URLリストを読み込む（引数またはファイルから）
    let urls = [];

    const urlsFilePath = path.join(__dirname, 'urls.txt');
    if (fs.existsSync(urlsFilePath)) {
        const content = fs.readFileSync(urlsFilePath, 'utf-8');
        urls = content.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
    }

    // コマンドライン引数からもURLを追加
    const args = process.argv.slice(2);
    urls.push(...args.filter(arg => arg.startsWith('http')));

    if (urls.length === 0) {
        console.log('使用法: node scrape-dokkaninfo.js [URL...]');
        console.log('または urls.txt にURLを1行ずつ記載');
        process.exit(1);
    }

    console.log(`Scraping ${urls.length} URL(s)...`);

    const browser = await chromium.launch({
        headless: true
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();

    // 🌟ブラウザ内のconsole.logをNode側のターミナルに表示する設定
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

    const results = {
        lastUpdated: new Date().toISOString(),
        enemies: []
    };

    for (const url of urls) {
        const data = await scrapeUrl(page, url);
        results.enemies.push(data);

        // レート制限対策
        await page.waitForTimeout(1000);
    }

    await browser.close();

    // 結果を出力
    const outputPath = path.join(__dirname, 'enemies.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`\nResults saved to: ${outputPath}`);

    // サマリーを表示
    const successful = results.enemies.filter(e => e.success).length;
    console.log(`\nSummary: ${successful}/${results.enemies.length} URLs scraped successfully`);

    // コンソールにも結果を表示
    console.log('\n--- Results ---');
    for (const enemy of results.enemies) {
        if (enemy.success) {
            const stageText = enemy.stage ? `[${enemy.stage}] ` : '';
            console.log(`✅ ${stageText}${enemy.name || 'Unknown'} - ${enemy.class} ${enemy.type}`);
            for (const attack of enemy.attacks) {
                console.log(`    ⚔️ ${attack.name}: ${attack.value.toLocaleString()}`);
            }
        } else {
            console.log(`❌ ${enemy.url} - Failed: ${enemy.error || 'No type detected'}`);
        }
    }
}

main().catch(console.error);
