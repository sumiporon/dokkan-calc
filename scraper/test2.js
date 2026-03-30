const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    // 親URL（イベントトップページ）にアクセス
    const parentUrl = 'https://jpnja.dokkaninfo.com/events/challenge/1733';
    console.log(`Navigating to parent URL: ${parentUrl}`);
    await page.goto(parentUrl, { waitUntil: 'domcontentloaded' });

    await page.waitForTimeout(3000);

    const info = await page.evaluate(() => {
        return {
            title: document.title,
            h1s: Array.from(document.querySelectorAll('h1, h2, .title')).map(e => e.innerText ? e.innerText.trim() : '').filter(t => t.length > 0)
        };
    });

    fs.writeFileSync('testOutput2.json', JSON.stringify(info, null, 2));
    console.log('Parent URL Done!');
    await browser.close();
})();
