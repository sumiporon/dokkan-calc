const { chromium } = require('playwright');
const fs = require('fs');

async function main() {
    try {
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();

        console.log('Navigating...');
        await page.goto('https://jpnja.dokkaninfo.com/events/challenge/1733/17330035', { waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log('Waiting for content...');
        await page.waitForTimeout(5000); // Wait for dynamic content

        const html = await page.content();
        fs.writeFileSync('temp_dokkan.html', html, 'utf-8');

        await browser.close();
        console.log('Successfully saved to temp_dokkan.html');
    } catch (e) {
        console.error('Error:', e);
    }
}

main();
