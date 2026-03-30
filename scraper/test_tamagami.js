const fs = require('fs');
const cheerio = require('cheerio');

const htmlContent = fs.readFileSync('./html_cache/stage_1733_17330035.html', 'utf8');
const $ = cheerio.load(htmlContent);

const imgs = $('img[src*="cha_type_icon"]');
imgs.each((i, img) => {
    const $img = $(img);
    const enemyContainer = $img.closest('.row').parent();
    const text = enemyContainer.text();

    // get name
    const nameMatch = text.match(/\n\s*([^\n]+)\n\s*HP:/);
    let n = '';
    if (nameMatch) {
        n = nameMatch[1].trim();
    } else {
        const nameEl = enemyContainer.find('.font-size-1_2 b').first();
        if (nameEl.length) n = nameEl.text().trim();
    }

    console.log(`--- ${n} ---`);
    const turnMatch = text.match(/ターン経過ごとにATK(\d+)%UP\(最大(\d+)%\)/);
    console.log('Turn Match:', turnMatch ? `${turnMatch[1]}% max ${turnMatch[2]}%` : 'None');

    const atkMatch = text.match(/ATK[:\s]*([0-9,]+)/i);
    console.log('ATK Match:', atkMatch ? atkMatch[1] : 'None');

    const saMatch = text.match(/ダメージ[:\s]*([0-9,]+)/);
    console.log('SA Match:', saMatch ? saMatch[1] : 'None');
    // console.log('Raw text snippet:', text.substring(0, 500).replace(/\n/g, '\\n'));
});
