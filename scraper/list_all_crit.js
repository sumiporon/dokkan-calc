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

    // HTMLタグを除去してテキストのみにする
    // 各敵ブロックは <b>敵名</b> で始まり、cha_type_icon で属性がある
    // まず、全ての会心関連テキストを抽出

    // 敵名を取得 - <b>名前</b> パターンで cha_type_icon の近くにある
    // 簡易的に、テキスト全体から会心パターンを見つけ、近くの敵名を特定する

    // アプローチ: 各 padding-top-bottom-5 ブロック(敵ブロック)ごとに処理
    // HTMLをテキストにして、会心を含むセクションを見つける

    // cha_type_icon の位置を見つけ、その近くの <b>名前</b> と会心テキストを抽出
    const enemyPattern = /cha_type_icon_\d+\.png.*?<b>([^<]+)<\/b>.*?(?=cha_type_icon_\d+\.png|<\/div>\s*<\/div>\s*<\/div>\s*<div class="row margin-5|<div class="row padding-top-bottom-5"|$)/gs;

    let match;
    while ((match = enemyPattern.exec(html)) !== null) {
        const block = match[0];
        const name = match[1].trim();

        if (!block.includes('会心')) continue;

        // HTMLタグ除去
        const text = block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

        const patterns = [];

        // 各会心パターンを抽出
        let m;

        // HP条件付き会心発動率
        const re1 = /HP(\d+)%以下で会心発動率(\d+)%UP/g;
        while ((m = re1.exec(text)) !== null) patterns.push(m[0]);

        // ターン経過による会心発動率
        const re2 = /ターン経過ごとに会心発動率(\d+)%UP[（(]最大(\d+)%[)）]/g;
        while ((m = re2.exec(text)) !== null) patterns.push(m[0]);

        // 必殺技発動時に会心
        const re3 = /必殺技発動時に[^\s]*?会心/g;
        while ((m = re3.exec(text)) !== null) patterns.push(m[0]);

        // 「必ず会心が発動する」系
        const re4 = /必ず会心[がをの][^\s]*/g;
        while ((m = re4.exec(text)) !== null) patterns.push(m[0]);

        // 会心発動率X%UP (固定、HP条件やターン条件なし)
        const re5 = /(?<!HP\d+%以下で)(?<!ターン経過ごとに)会心発動率(\d+)%UP/g;
        while ((m = re5.exec(text)) !== null) patterns.push(m[0]);

        // 会心が発動する
        const re6 = /会心が発動する/g;
        while ((m = re6.exec(text)) !== null) patterns.push(m[0]);

        // 会心無効
        const re7 = /会心を無効化/g;
        while ((m = re7.exec(text)) !== null) patterns.push(m[0]);

        const unique = [...new Set(patterns)];

        if (unique.length > 0) {
            output.push(`${file} | ${title} | ${name} | ${unique.join(' / ')}`);
        }
    }
}

const result = `会心を持つ敵一覧 (${output.length}件)\n${'='.repeat(80)}\n` + output.join('\n');
fs.writeFileSync('crit_enemies_full_list.txt', result, 'utf8');
console.log(result);
console.log(`\n--- 出力完了: crit_enemies_full_list.txt (${output.length}件) ---`);
