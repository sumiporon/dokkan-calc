const fs = require('fs');
const path = require('path');

const cacheDir = './html_cache';
const files = fs.readdirSync(cacheDir).filter(f => f.endsWith('.html'));
console.log("Found " + files.length + " files.");

const output = [];

for (const file of files) {
    const html = fs.readFileSync(path.join(cacheDir, file), 'utf8');
    if (!html.includes('会心')) continue;

    // titleを取得
    const titleMatch = html.match(/<title>([^<]*)<\/title>/);
    const title = titleMatch ? titleMatch[1].split('|')[0].trim() : file;

    // 敵名を探す
    const enemyPattern = /<b>([^<]+)<\/b>/g;
    let nameMatch;
    let names = [];
    while ((nameMatch = enemyPattern.exec(html)) !== null) {
        if (!names.includes(nameMatch[1].trim())) {
            names.push(nameMatch[1].trim());
        }
    }

    // 会心パターンを全て抽出する (タグ除去後)
    const textContext = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    const patterns = [];
    // 「会心」の周り15文字を抽出
    const p1 = /[^\s]{0,20}会心[^\s]{0,20}/g;
    let m;
    while ((m = p1.exec(textContext)) !== null) {
        patterns.push(m[0].trim());
    }

    if (patterns.length > 0) {
        const unique = [...new Set(patterns)];
        output.push(`${file} | ${title} | Enemies: ${names.slice(0, 3).join(', ')} | ${unique.join(' / ')}`);
    }
}

fs.writeFileSync('crit_debug.txt', output.join('\n'), 'utf8');
console.log(`Done. Wrote ${output.length} lines.`);
