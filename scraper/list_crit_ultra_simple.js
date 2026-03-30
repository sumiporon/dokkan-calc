const fs = require('fs');
const path = require('path');

const cacheDir = './html_cache';
const files = fs.readdirSync(cacheDir).filter(f => f.endsWith('.html'));

const output = [];

for (const file of files) {
    const html = fs.readFileSync(path.join(cacheDir, file), 'utf8');
    if (!html.includes('会心')) continue;

    // 粗いタグ除去
    let rawText = html.replace(/<[^>]+>/g, '  ').replace(/\s+/g, ' ');

    let currentIndex = 0;
    while (true) {
        let critIndex = rawText.indexOf('会心', currentIndex);
        if (critIndex === -1) break;

        // 会心の前30文字、後ろ30文字を切り出す
        let start = Math.max(0, critIndex - 30);
        let end = Math.min(rawText.length, critIndex + 30);
        let snippet = rawText.substring(start, end).trim();

        output.push(`${file} : ${snippet}`);

        currentIndex = critIndex + 2;
    }
}

const resultLines = [...new Set(output)];
fs.writeFileSync('crit_final_list.txt', resultLines.join('\n'), 'utf8');
console.log(`Generated crit_final_list.txt with ${resultLines.length} extracts.`);
