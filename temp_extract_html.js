const fs = require('fs');
const content = fs.readFileSync('c:/Users/kou20/OneDrive - 甲南大学/デスクトップ/ドッカン計算/dokkan_calc_final.js', 'utf8');

const startIndex = content.indexOf('const createScenarioCardHTML');
if (startIndex !== -1) {
    // テンプレートリテラルなどで長くなるので、そこから適当に20000文字分くらい抜き出して検索
    const snippet = content.substring(startIndex, startIndex + 20000);
    const criticalIdx = snippet.indexOf('is_critical');
    if (criticalIdx !== -1) {
        fs.writeFileSync('c:/Users/kou20/OneDrive - 甲南大学/デスクトップ/ドッカン計算/temp_out.txt', snippet.substring(criticalIdx - 300, criticalIdx + 500));
        console.log('Found and wrote to temp_out.txt');
    } else {
        fs.writeFileSync('c:/Users/kou20/OneDrive - 甲南大学/デスクトップ/ドッカン計算/temp_out.txt', 'is_critical not found in the snippet');
        console.log('Not found');
    }
} else {
    console.log('createScenarioCardHTML function not found');
}
