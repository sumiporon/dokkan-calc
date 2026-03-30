const fs = require('fs');
const content = fs.readFileSync('c:/Users/kou20/OneDrive - 甲南大学/デスクトップ/ドッカン計算/dokkan_calc_final.js', 'utf8');
const match = content.match(/const savedEnemies = (\[.*?\]);/s);
if (match) {
    const enemies = eval(match[1]);
    const results = [];
    enemies.forEach(e => e.series.forEach(se => se.stages.forEach(st => st.bosses.forEach(b => {
        if (b.hasSaCrit || typeof b.critAtkUp !== 'undefined' || b.name.includes('セルマックス')) {
            results.push({
                name: b.name,
                hasSaCrit: b.hasSaCrit,
                critAtkUp: b.critAtkUp,
                critDefDown: b.critDefDown,
                typeOfCrit: typeof b.critAtkUp
            });
        }
    }))));
    console.log(JSON.stringify(results, null, 2));
} else {
    console.log("No savedEnemies found");
}
