const { chromium } = require('playwright');
const fs = require('fs');

async function checkInternal() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    // Red Zone Namek Frieza stage (guessing URL format or just going to a challenge page)
    // Actually let's just go to a known Red Zone stage, like the 8th anniversary ones or Namek Frieza
    await page.goto('https://jpnja.dokkaninfo.com/events/challenge/300/300001');
    await page.waitForTimeout(3000);
    
    const html = await page.content();
    fs.writeFileSync('test_dokkan_internal.html', html, 'utf-8');
    console.log("Saved HTML. Checking for keywords like 'crit', 'multiplier', etc...");
    
    // Check for inline JSON state often used by Nuxt/Next.js
    const match = html.match(/__NUXT__\s*=\s*(\{.*?\});/s);
    if(match) {
        console.log("Found Nuxt state!");
        fs.writeFileSync('test_dokkan_state.json', match[1], 'utf-8');
    } else {
        const nextMatch = html.match(/__NEXT_DATA__.*?>(.*?)</s);
        if(nextMatch) {
            console.log("Found Next.js state!");
            fs.writeFileSync('test_dokkan_state.json', nextMatch[1], 'utf-8');
        } else {
            console.log("No obvious internal JSON state found.");
        }
    }
    
    await browser.close();
}

checkInternal();
