const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const cacheDir = path.join(__dirname, 'html_cache');
const files = fs.readdirSync(cacheDir).filter(f => f.startsWith('stage_') && f.endsWith('.html'));

const results = [];

files.forEach(file => {
    const html = fs.readFileSync(path.join(cacheDir, file), 'utf8');
    const $ = cheerio.load(html);

    // We look for text related to critical hits.
    $('*').each((i, el) => {
        const text = $(el).contents().filter(function () {
            return this.type === 'text';
        }).text().trim();

        if (text.includes('会心') || text.includes('クリティカル')) {
            // Check if it's an enemy skill. Usually it's in a .row next to a debug-info ID
            const parent = $(el).parent();
            const debugInfo = parent.find('.debug-info, [class*="debug-info"]');
            let idText = "";
            if (debugInfo.length > 0) {
                idText = debugInfo.text().trim();
            } else {
                // Try parent's sibling
                const debugInfo2 = $(el).closest('.row').siblings('.debug-info');
                if (debugInfo2.length > 0) {
                    idText = debugInfo2.text().trim();
                } else {
                    const debugInfo3 = $(el).closest('.row').find('.debug-info');
                    if (debugInfo3.length > 0) {
                        idText = debugInfo3.text().trim();
                    }
                }
            }

            // Filter out obvious player UI things if possible, but keep it broad
            if (!text.includes('スキル玉') && !text.includes('ミッション')) {
                results.push(`File: ${file} | Text: ${text} | ID: ${idText}`);
            }
        }
    });
});

// clean up and deduplicate
const uniqueResults = [...new Set(results)].filter(r => !r.includes('ID: ') || r.match(/ID: \d+/));
fs.writeFileSync(path.join(__dirname, 'crit_findings.txt'), uniqueResults.join('\n'));
console.log('Done! Wrote to crit_findings.txt');
