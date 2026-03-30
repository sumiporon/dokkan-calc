/**
 * patch_turn_default.js
 * ターン経過ドロップダウンの初期選択を「1ターン目」に変更する
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'dokkan_calc_final.js');
let content = fs.readFileSync(filePath, 'utf8');
let count = 0;

// ターン経過の「なし」オプションを残しつつ、1ターン目をselectedにする
const FIND = `              selectorsHTML += '<option value="0">なし</option>';
              for (let i = 1; i <= steps; i++) {
                const pct = d.turnAtkUp * i;
                selectorsHTML += '<option value="' + pct + '">' + i + 'ターン (ATK+' + pct + '%)</option>';
              }`;

const REPLACE = `              selectorsHTML += '<option value="0">なし</option>';
              for (let i = 1; i <= steps; i++) {
                const pct = d.turnAtkUp * i;
                const sel = (i === 1) ? ' selected' : '';
                selectorsHTML += '<option value="' + pct + '"' + sel + '>' + i + 'ターン (ATK+' + pct + '%)</option>';
              }`;

if (content.includes(FIND)) {
    content = content.replace(FIND, REPLACE);
    count++;
    console.log('OK: ターン経過 初期値を1ターン目に変更');
} else {
    console.error('FAILED: ターゲットが見つかりません');
    // デバッグ
    const idx = content.indexOf("selectorsHTML += '<option value=\"0\">なし</option>'");
    console.log('なしオプション index:', idx);
    if (idx !== -1) {
        console.log('Context:', JSON.stringify(content.substring(idx, idx + 200)));
    }
}

if (count > 0) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('保存完了');
}
