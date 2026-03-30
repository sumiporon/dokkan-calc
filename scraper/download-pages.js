/**
 * DokkanInfo HTMLダウンローダー
 * 
 * 全チャレンジイベント・ステージページのHTMLをローカルに保存する。
 * 解析ロジック修正時にはこのスクリプトを再実行する必要はなく、
 * parse-cached.js だけを実行すればOK。
 * 
 * 出力: html_cache/ フォルダ内に各ページのHTMLとindex.jsonを保存
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://jpnja.dokkaninfo.com';
const CHALLENGE_URL = `${BASE_URL}/events/challenge`;
const CACHE_DIR = path.join(__dirname, 'html_cache');

const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
    console.log('=== DokkanInfo HTMLダウンローダー ===');
    console.log(`保存先: ${CACHE_DIR}\n`);

    // キャッシュディレクトリ作成
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    // index.json: URL → ファイル名の対応表
    const index = {
        downloadedAt: new Date().toISOString(),
        events: [] // { url, file, title, stages: [{ url, file }] }
    };

    try {
        // ===== Phase 1: イベント一覧ページ =====
        console.log('[Phase 1] イベント一覧ページをダウンロード中...');
        await page.goto(CHALLENGE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await delay(5000);

        const listHtml = await page.content();
        fs.writeFileSync(path.join(CACHE_DIR, 'challenge_list.html'), listHtml, 'utf-8');
        console.log('  → challenge_list.html 保存完了');

        // イベントURLを抽出
        const eventUrls = await page.evaluate(() => {
            const links = document.querySelectorAll('a[href*="/events/challenge/"]');
            const urls = new Set();
            for (const a of links) {
                const match = a.href.match(/\/events\/challenge\/(\d+)$/);
                if (match) urls.add(a.href);
            }
            return Array.from(urls);
        });
        console.log(`  → ${eventUrls.length} イベントを検出\n`);

        // ===== Phase 2 & 3: 各イベント・ステージ =====
        let eventCount = 0;
        for (const eventUrl of eventUrls) {
            eventCount++;
            const eventIdMatch = eventUrl.match(/\/events\/challenge\/(\d+)$/);
            const eventId = eventIdMatch ? eventIdMatch[1] : `unknown_${eventCount}`;
            const eventFile = `event_${eventId}.html`;

            console.log(`[${eventCount}/${eventUrls.length}] ${eventUrl}`);

            try {
                await page.goto(eventUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await delay(3000);

                const eventHtml = await page.content();
                fs.writeFileSync(path.join(CACHE_DIR, eventFile), eventHtml, 'utf-8');

                // タイトル取得
                const title = await page.evaluate(() => {
                    return document.title ? document.title.split('|')[0].trim() : '';
                });

                // ステージURLを抽出
                const stageUrls = await page.evaluate(() => {
                    const links = document.querySelectorAll('a[href*="/events/challenge/"]');
                    const urls = new Set();
                    for (const a of links) {
                        const match = a.href.match(/\/events\/challenge\/\d+\/\d+$/);
                        if (match) urls.add(a.href);
                    }
                    return Array.from(urls);
                });

                console.log(`  タイトル: ${title} (${stageUrls.length} ステージ)`);

                const eventEntry = {
                    url: eventUrl,
                    file: eventFile,
                    title,
                    stages: []
                };

                // 各ステージをダウンロード
                let stageCount = 0;
                for (const stageUrl of stageUrls) {
                    stageCount++;
                    const stageIdMatch = stageUrl.match(/\/events\/challenge\/(\d+)\/(\d+)$/);
                    const stageFile = stageIdMatch
                        ? `stage_${stageIdMatch[1]}_${stageIdMatch[2]}.html`
                        : `stage_${eventId}_${stageCount}.html`;

                    try {
                        await page.goto(stageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

                        // アイコン読み込み待機
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

                        const stageHtml = await page.content();
                        fs.writeFileSync(path.join(CACHE_DIR, stageFile), stageHtml, 'utf-8');

                        eventEntry.stages.push({ url: stageUrl, file: stageFile });
                        console.log(`    [${stageCount}/${stageUrls.length}] ${stageFile} ✓`);
                    } catch (err) {
                        console.error(`    [${stageCount}/${stageUrls.length}] エラー: ${err.message}`);
                    }

                    await delay(1000);
                }

                index.events.push(eventEntry);
            } catch (err) {
                console.error(`  イベントエラー: ${err.message}`);
            }

            await delay(1500);

            // 進捗保存（5イベントごと）
            if (eventCount % 5 === 0) {
                fs.writeFileSync(path.join(CACHE_DIR, 'index.json'), JSON.stringify(index, null, 2), 'utf-8');
                console.log(`  [進捗保存: ${eventCount}/${eventUrls.length}]`);
            }
        }

        // 最終保存
        fs.writeFileSync(path.join(CACHE_DIR, 'index.json'), JSON.stringify(index, null, 2), 'utf-8');

        // 統計
        let totalStages = 0;
        for (const ev of index.events) totalStages += ev.stages.length;
        console.log(`\n=== 完了 ===`);
        console.log(`${index.events.length} イベント, ${totalStages} ステージのHTMLを保存しました。`);
        console.log(`保存先: ${CACHE_DIR}`);

    } catch (err) {
        console.error('Fatal error:', err);
    } finally {
        await browser.close();
    }
}

main().catch(console.error);
