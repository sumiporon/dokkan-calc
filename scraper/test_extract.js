const { chromium } = require('playwright');
const fs = require('fs');

async function test() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('https://jpnja.dokkaninfo.com/events/challenge/300/300001');
    await page.waitForTimeout(3000); // 描画待ち

    const rawData = await page.evaluate(() => {
        const result = {
            stageName: '',
            enemies: []
        };

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
            if (text.match(/ATKが大幅に上昇/) || text.match(/ATKとDEFが大幅上昇/)) {
                saBuffModifier = 0.5;
            } else if (text.match(/ATKが上昇/)) {
                saBuffModifier = 0.3;
            }

            const hpMatch = text.match(/HP(\d+)%以下でATK(\d+)%UP/);
            const hpAtkThreshold = hpMatch ? parseInt(hpMatch[1], 10) : 0;
            const hpAtkUp = hpMatch ? parseInt(hpMatch[2], 10) : 0;

            result.enemies.push({
                name: enemyName || result.stageName,
                class: cls,
                type,
                atk,
                saDamage,
                aoeDamage,
                saBuffModifier,
                hpAtkThreshold, hpAtkUp
            });
        };

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
            if (foundRow) enemyContainers.add(foundRow);
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
        }
        return result;
    });

    console.log(JSON.stringify(rawData, null, 2));
    await browser.close();
}
test();
