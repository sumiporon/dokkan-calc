const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const cacheDir = path.join(__dirname, 'html_cache');
const critFile = path.join(__dirname, 'crit_python_out.txt');
const outputFile = path.join(__dirname, 'crit_enemies_full.txt');

if (!fs.existsSync(critFile)) {
    console.log("No crit_python_out.txt found.");
    process.exit(1);
}

const lines = fs.readFileSync(critFile, 'utf8').split('\n').filter(l => l.trim().length > 0);
const results = [];

for (const line of lines) {
    // Expected format: stage_1701_17010045.html | Text: 必殺技発動時に必ず会心が発動 | ID: 49940
    const parts = line.split('|').map(p => p.trim());
    if (parts.length < 2) continue;

    const fileName = parts[0];
    const textPart = parts[1].replace('Text: ', '');
    const idPart = parts.length > 2 ? parts[2].replace('ID: ', '') : '';

    const filePath = path.join(cacheDir, fileName);
    if (fs.existsSync(filePath)) {
        const html = fs.readFileSync(filePath, 'utf8');
        const $ = cheerio.load(html);

        let title = "Unknown Stage";

        // Try multiple ways to get the stage and enemy names
        // usually it's in the title or some breadcrumb
        const titleEl = $('title').text();
        if (titleEl) {
            title = titleEl.replace(' - Dokkan! Info', '').trim();
        } else {
            // Find stage title
            const stageTitle = $('.nav-link.active').last().text().trim();
            if (stageTitle) title = stageTitle;
        }

        // Try to identify the boss. It might be explicitly marked by the user clicking ID, but generally boss names are bolded under card icons
        // Let's get the first big name in a specific generic row if possible
        let bossName = "Unknown Boss";

        // If we have an ID like 49940, we can find the element with debug-info (ID: 49940)
        let foundBossName = null;
        if (idPart !== "" && idPart !== "Unknown") {
            const debugNode = $(`div:contains("(ID: ${idPart})")`).last();
            if (debugNode.length) {
                // Usually the boss area is wrapped in a border or we can go up to the row containing the enemy name
                const bossContainer = debugNode.closest('.row.margin-5.border.border-1, .row.padding-top-5, .row');
                // Find the name which is usually bolded right after a card image or in font-size-1_2
                const possibleName = bossContainer.find('.font-size-1_2 b, b').first().text().trim();
                if (possibleName && possibleName !== "VS") {
                    foundBossName = possibleName;
                }
            }
        }

        // Fallback: Just get the main boss name of the page
        if (!foundBossName) {
            $('b').each((i, el) => {
                const text = $(el).text().trim();
                // Extremely common boss names are just "VS[Name]" or just the characters
                if (text.startsWith('VS')) {
                    foundBossName = text.substring(2).trim();
                }
            });
        }

        if (foundBossName) bossName = foundBossName;

        results.push(`Stage: ${title} (${fileName})`);
        results.push(`Enemy: ${bossName}`);
        results.push(`Condition: ${textPart}`);
        if (idPart) results.push(`ID: ${idPart}`);
        results.push('---');
    }
}

fs.writeFileSync(outputFile, results.join('\n'));
console.log(`Saved detailed list to ${outputFile}`);
