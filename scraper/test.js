const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    const browser = await chromium.launch({ headless: true });
    // Cloudflareのボット対策を回避するため、User-Agentを偽装します
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    await page.goto('https://jpnja.dokkaninfo.com/events/challenge/1733/17330035', { waitUntil: 'domcontentloaded' });

    await page.waitForTimeout(5000); // ページの描画を待機

    const info = await page.evaluate(() => {
        return {
            title: document.title,
            breadcrumbs: Array.from(document.querySelectorAll('.v-breadcrumbs li, .v-breadcrumbs__item, .breadcrumb, .v-toolbar__title')).map(e => e.innerText ? e.innerText.trim() : '').filter(t => t.length > 0).slice(0, 10),
            headers: Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, .title, .text-h4, .text-h5, .v-card__title')).map(e => e.innerText ? e.innerText.trim() : '').filter(t => t.length > 0).slice(0, 15)
        };
    });

    fs.writeFileSync('testOutput.json', JSON.stringify(info, null, 2));
    console.log('Done!');
    await browser.close();
})();
