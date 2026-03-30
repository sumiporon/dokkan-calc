const fs = require('fs');
const path = require('path');

const cacheDir = './html_cache';
const files = fs.readdirSync(cacheDir).filter(f => f.endsWith('.html'));

const output = [];

for (const file of files) {
    const html = fs.readFileSync(path.join(cacheDir, file), 'utf8');

    if (!html.includes('会心')) continue;

    // titleを取得
    const titleMatch = html.match(/<title>([^<]*)<\/title>/);
    const title = titleMatch ? titleMatch[1].split('|')[0].trim() : file;

    // 敵ブロックごとに分割
    const blocks = html.split('cha_type_icon_');
    // 最初のブロックはアイコン前なのでスキップ
    for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i];

        // 敵の終わりまでを適当に切る（次の <div class="row margin-5 または padding-top-bottom-5）
        const endIdx1 = block.indexOf('row margin-5');
        const endIdx2 = block.indexOf('row padding-top-bottom-5');
        let endIndex = block.length;
        if (endIdx1 !== -1 && endIdx2 !== -1) endIndex = Math.min(endIdx1, endIdx2);
        else if (endIdx1 !== -1) endIndex = endIdx1;
        else if (endIdx2 !== -1) endIndex = endIdx2;

        const enemyContext = block.substring(0, endIndex);

        // 敵名を探す
        const nameMatch = enemyContext.match(/<b>([^<]+)<\/b>/);
        const name = nameMatch ? nameMatch[1].trim() : "Unknown";

        // タグを除去して検索
        const textContext = enemyContext.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

        if (!textContext.includes('会心')) continue;

        const patterns = [];

        // 単純な正規表現で抽出
        const matches = textContext.match(/[^\s。、]{0,20}会心[^\s。、]{0,20}/g);
        if (matches) {
            matches.forEach(m => patterns.push(m.trim()));
        }

        if (patterns.length > 0) {
            // 重複除去
            const unique = [...new Set(patterns)];
            output.push(`${file} | ${title} | ${name} | ${unique.join(' / ')}`);
        }
    }
}

const result = output.join('\n');
fs.writeFileSync('crit_enemies_simple.txt', result, 'utf8');
console.log(`Finished, wrote ${output.length} entries to crit_enemies_simple.txt`);
