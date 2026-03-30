const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const cacheDir = './html_cache';

// grepで抽出したファイル名 (一部省略部分も自動で補完するため、fs.readdirして絞り込む)
const allFiles = fs.readdirSync(cacheDir).filter(f => f.endsWith('.html'));
const targetFiles = [];

for (const file of allFiles) {
    const html = fs.readFileSync(path.join(cacheDir, file), 'utf8');
    if (html.includes('会心')) {
        targetFiles.push({ file, html });
    }
}

console.log(`Found ${targetFiles.length} files with '会心'`);

const output = [];

for (const { file, html } of targetFiles) {
    // try cheerio without loading all
    const $ = cheerio.load(html);
    const title = $('title').text().split('|')[0].trim();

    // 各敵ブロックを走査
    const enemyBlocks = $('img[src*="cha_type_icon"]');

    enemyBlocks.each((i, img) => {
        const $img = $(img);
        let container = $img.closest('.row.padding-top-bottom-5');
        if (!container.length) container = $img.closest('.row').parent();

        const text = container.text().replace(/\s+/g, ' ');
        if (!text.includes('会心')) return;

        const nameEl = container.find('b').first();
        const name = nameEl.text().trim();

        const patterns = [];

        // HP条件付き会心
        const re1 = /HP(\d+)%以下で会心発動率(\d+)%UP/g;
        // ターン経過による会心
        const re2 = /ターン経過ごとに会心発動率(\d+)%UP[（(]最大(\d+)%[)）]/g;
        // 必殺技時の会心
        const re3 = /必殺技発動時に(?:超高確率で)?(?:必ず)?会心/g;
        const re4 = /必ず会心/g;
        const re5 = /(?<!HP\d+%以下で)(?<!ターン経過ごとに)会心発動率(\d+)%UP/g;
        const re6 = /会心が発動/g;
        const re7 = /会心を無効化/g;
        const re8 = /会心攻撃/g;

        const extract = (regex) => {
            let m;
            while ((m = regex.exec(text)) !== null) patterns.push(m[0]);
        };

        extract(re1); extract(re2); extract(re3);
        extract(re4); extract(re5); extract(re6);
        extract(re7); extract(re8);

        // フォールバック
        if (patterns.length === 0) {
            const pFallback = /.{0,10}会心.{0,10}/g;
            extract(pFallback);
        }

        const unique = [...new Set(patterns)];

        if (unique.length > 0) {
            output.push(`${file} | ${title} | ${name} | ${unique.join(' / ')}`);
        }
    });
}

const result = `会心を持つ敵一覧 (${output.length}件)\n${'='.repeat(80)}\n` + output.join('\n');
fs.writeFileSync('crit_enemies_full_list.txt', result, 'utf8');
console.log(`Generated crit_enemies_full_list.txt with ${output.length} entries`);
