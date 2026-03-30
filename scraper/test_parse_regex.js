const fs = require('fs');
const path = require('path');

// キャッシュにあるセルマックスのHTMLを読み込むか、直接テキストで検証する
// 今回は scrape 済みの html キャッシュファイル (10486_2.html など) の中身を参照するのが確実
const CACHE_DIR = path.join(__dirname, '..', '..', '..', '..', 'Downloads', 'dokkaninfo_cache');
// => c:/Users/kou20/Downloads/dokkaninfo_cache

const targetFile = '10486_2.html'; // セルマックス（目醒める恐怖）のステージキャッシュ例（仮）
// 代わりに grep_search で実際のテキストがあるか調べるためのスクリプト
const regex = /(?:(\d+)ターン目以降、)?ターン経過ごとにATK(\d+)%UP\(最大(\d+)%\)/;

console.log("Regex:", regex);
const testText1 = "「4ターン目以降、ターン経過ごとにATK200%UP(最大600%)」";
const match1 = testText1.match(regex);
console.log("Match1:", match1);

const testText2 = "ターン経過ごとにATK10%UP(最大50%)";
const match2 = testText2.match(regex);
console.log("Match2:", match2);

// JSファイルを直接読んでパースロジックの箇所を確認
const code = fs.readFileSync('parse-cached.js', 'utf8');
const parseMatch = code.match(/turnMatch = text\.match\(.*?\)/);
console.log("parse-cached.js regex:", parseMatch ? parseMatch[0] : "Not found");
