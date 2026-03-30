const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const cacheDir = './html_cache';
// 会心があるファイルのみ
const critFiles = [
    'stage_1704_17040025.html',
    'stage_1704_17040105.html',
    'stage_1705_17050015.html',
    'stage_1705_17050135.html',
    'stage_1705_17050165.html',
    'stage_1723_17230065.html',
    'stage_1743_17430013.html',
    'stage_1743_17430014.html',
    'stage_1743_17430015.html',
];

for (const file of critFiles) {
    const html = fs.readFileSync(path.join(cacheDir, file), 'utf8');
    const $ = cheerio.load(html);
    const title = $('title').text().split('|')[0].trim();

    console.log(`\n=== ${file} : ${title} ===`);

    const imgs = $('img[src*="cha_type_icon"]');
    imgs.each((i, img) => {
        const $img = $(img);
        const container = $img.closest('.row').parent();
        const text = container.text();

        // 敵名
        const nameEl = container.find('b').first();
        const name = nameEl.text().trim();

        // 会心チェック
        const critHpMatch = text.match(/HP(\d+)%以下で会心発動率(\d+)%UP/);
        const critTurnMatch = text.match(/ターン経過ごとに会心発動率(\d+)%UP\(最大(\d+)%\)/);
        const hasSaCrit = /必殺技発動時に(?:必ず)?会心/.test(text);

        const hasCrit = critHpMatch || critTurnMatch || hasSaCrit;
        if (!hasCrit) return;

        let desc = [];
        if (critHpMatch) desc.push(`HP${critHpMatch[1]}%以下→会心${critHpMatch[2]}%UP`);
        if (critTurnMatch) desc.push(`ターン経過→会心${critTurnMatch[1]}%UP(最大${critTurnMatch[2]}%)`);
        if (hasSaCrit) desc.push(`必殺技時に会心`);

        console.log(`  ${name}: ${desc.join(' | ')}`);
    });
}
