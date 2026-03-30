const { chromium } = require('playwright');
const fs = require('fs');

async function testmulti() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Using a known stage with multiple bosses/phases (e.g., Red Zone Broly or something, or just an SBR stage)
    // SBR stage 1:
    await page.goto('https://jpnja.dokkaninfo.com/events/challenge/300/300001');

    await page.waitForTimeout(3000);

    const data = await page.evaluate(() => {
        const imgs = document.querySelectorAll('img[src*="cha_type_icon"]');
        const results = [];

        for (const img of imgs) {
            // Traverse up to find a container that might hold the stats for this specific enemy
            let container = img.parentElement;
            let level = 1;
            // Typically enemies are in separate tabs or table rows. Let's find the nearest "table" or "div.tab-pane" or a large container
            while (container && container.tagName !== 'TABLE' && container.className !== 'tab-pane active' && level < 10) {
                container = container.parentElement;
                level++;
            }
            if (!container) container = img.parentElement.parentElement.parentElement;

            results.push({
                src: img.src,
                levelUp: level,
                containerTag: container.tagName,
                containerClass: container.className,
                containerText: container.innerText.substring(0, 100).replace(/\n/g, '\\n')
            });
        }
        return results;
    });

    console.log(JSON.stringify(data, null, 2));
    await browser.close();
}

testmulti();
