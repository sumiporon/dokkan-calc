const fs = require('fs');
const cheerio = require('cheerio');
const path = require('path');

const htmlContent = fs.readFileSync(path.join(__dirname, 'html_cache', 'stage_1705_17050165.html'), 'utf8');
const $ = cheerio.load(htmlContent);

const imgs = $('img[src*="cha_type_icon"]');

imgs.each((i, img) => {
    const $img = $(img);
    const container = $img.closest('.list-group-item, .row.margin-5.border.border-1');
    if (container.length) {
        let enemyName = '';
        const possibleName = container.find('.font-size-1_2 b, b').first().text().trim();
        enemyName = possibleName;

        const text = container.text();
        const hasSaCrit = /(会心が発動|会心発動|必ず会心|高確率で会心)/.test(text);

        console.log("Found:", enemyName);
        console.log("hasSaCrit:", hasSaCrit);
        console.log("Matched specific strings?");
        console.log("- 会心が発動:", text.includes("会心が発動"));
        console.log("- 必殺技を受けると:", text.includes("必殺技を受けると"));
        console.log("Length of text:", text.length);
        console.log("------------------------");
    } else {
        console.log("No container found for img", $img.attr('src'));
    }
});
