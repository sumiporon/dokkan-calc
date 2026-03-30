const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();

        console.log('Navigating to page...');
        await page.goto('https://jpnja.dokkaninfo.com/events/challenge/1733/17330015', { waitUntil: 'domcontentloaded', timeout: 30000 });

        console.log('Waiting 8 seconds for data to load...');
        await page.waitForTimeout(8000);

        console.log('Evaluating text...');
        const info = await page.evaluate(() => {
            return document.body.innerText;
        });

        fs.writeFileSync('testOutput5.txt', info);
        console.log('Dumped text content successfully!');
    } catch (e) {
        console.error('Error occurred:', e);
    } finally {
        if (browser) await browser.close();
    }
})();
